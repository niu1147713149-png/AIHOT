import { z } from "zod";
import type { Leaderboard, Resets } from "../contracts.ts";

const text = z.string().max(50000);
const stamp = z.string().refine(s => Number.isFinite(Date.parse(s)), "invalid date");
const url = z.string().url().refine(s => { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password; });
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,149}$/);
const number = z.number().finite();
const price = number.nonnegative().nullable();
const entry = z.object({ slug, rank: number.int().positive(), score: number, sourceCount: number.int().nonnegative(), coverage: number.min(0).max(1) });
export const leaderboardSchema: z.ZodType<Leaderboard> = z.object({
  run: z.object({ id: text, methodologyVersion: text, generatedAt: stamp,
    fx: z.object({ rate: number.positive(), asOf: stamp, sourceName: text }).nullable() }),
  models: z.record(slug, z.object({
    model: z.object({ slug, name: text, provider: text, releasedAt: stamp.nullable() }),
    price: z.object({ currency: text, input: price, output: price, cached: price, inputCny: price, outputCny: price, cachedCny: price,
      officialUrl: url.nullable(), note: text.nullable() }).nullable(),
    access: z.object({ domestic: z.boolean(), weightsUrl: url.nullable() }),
  })),
  boards: z.array(z.object({
    board: z.object({ key: z.enum(["overall", "coding", "reasoning", "professional", "knowledge"]), name: text, description: text, howToRead: text,
      sourceCount: number.int().nonnegative(), operatorCount: number.int().nonnegative() }),
    entries: z.array(entry).max(1000), filterEntries: z.array(entry).max(1000),
    pending: z.array(z.object({ slug, score: number, sources: number.int().nonnegative(), reason: text })).max(1000),
  })).length(5),
}).superRefine((value, ctx) => {
  if (new Set(value.boards.map(b => b.board.key)).size !== 5) ctx.addIssue({ code: "custom", message: "duplicate board" });
  for (const board of value.boards) {
    const entries = [...board.entries, ...board.filterEntries, ...board.pending];
    if (new Set(entries.map(e => e.slug)).size !== entries.length) ctx.addIssue({ code: "custom", message: "duplicate model in board" });
    for (const e of entries) if (value.models[e.slug]?.model.slug !== e.slug) ctx.addIssue({ code: "custom", message: "missing model" });
  }
});

const context = z.object({ id: text, author: text, relation: text, text: text.nullable(), originalText: text, url });
const post = z.object({ id: text, publishedAt: stamp, stage: text.optional(), text, originalText: text,
  fullText: text.nullable().optional(), fullOriginalText: text.nullable().optional(), context: z.array(context).max(50), url });
// Preserve extra upstream metadata such as estimates, notices and attribution with the private snapshot.
export const resetsSchema: z.ZodType<Resets> = z.object({
  schemaVersion: z.literal(1), timezone: z.literal("Asia/Shanghai"), today: stamp, checkedAt: stamp.nullable(), historyFrom: stamp,
  count: number.int().nonnegative(),
  events: z.array(z.object({
    id: text, type: text, label: text, displayLabel: text, status: text, title: text, scope: text,
    presentation: z.object({ status: text, scopeKnown: z.boolean(), scopeLabel: text.nullable(), kindExplicit: z.boolean(),
      timeInferred: z.boolean(), audienceZh: text.nullable(), productsZh: text.nullable() }).passthrough(),
    createdAt: stamp, updatedAt: stamp, confirmedAt: stamp.nullable(), occurredOn: stamp.nullable(), confirmationBasis: text.nullable(),
    schedule: z.object({ precision: text, from: stamp.nullable(), through: stamp.nullable(), label: text }).passthrough().nullable(),
    posts: z.array(post.passthrough()).max(100), url,
  }).passthrough()).max(2000),
  activities: z.array(post.extend({ eventIds: z.array(text), kind: text, statusChanged: z.boolean(), action: text.nullable() }).passthrough()).max(2000),
  monitor: z.object({ status: text, lastAttemptAt: stamp.nullable(), lastCollectedAt: stamp.nullable(), lastVerifiedAt: stamp.nullable(),
    heldWindowCount: number.int().nonnegative(), pendingCount: number.int().nonnegative(), reviewCount: number.int().nonnegative() }).passthrough(),
  outage: z.unknown(),
}).passthrough().superRefine((value, ctx) => {
  if (value.count !== value.events.length || new Set(value.events.map(e => e.id)).size !== value.events.length)
    ctx.addIssue({ code: "custom", message: "invalid event count or duplicate event" });
});
