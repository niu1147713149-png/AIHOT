import { z } from "zod";
import { SKILL_CATEGORIES, SKILL_CLIENTS } from "@aihot/contracts/skills";
import { NAME, REPO } from "../data.ts";

const text = z.string().trim().min(1).max(2000);
const stamp = z.iso.datetime({ offset: true });
const url = z.url().max(1500).refine(s => { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password; }, "需要 HTTPS 地址");
export const repoSchema = z.string().regex(REPO, "需要 owner/repository 格式").refine(s => s === s.trim(), "仓库名不能含空白").transform(s => s.toLowerCase());
const path = z.string().max(500).regex(/^(?:[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)+SKILL\.md$/, "需要仓库内 SKILL.md 路径").refine(s => s === s.trim());
export const skillDataSchema = z.object({
  name: z.string().regex(NAME).refine(s => s === s.trim()), title: text.max(100), summary: text.max(500), originalDescription: text.max(10000),
  category: z.enum(Object.keys(SKILL_CATEGORIES) as [keyof typeof SKILL_CATEGORIES]),
  tasks: z.array(text).min(1).max(12), example: text, dependencies: z.array(text).max(12),
  clients: z.array(z.object({ id: z.enum(Object.keys(SKILL_CLIENTS) as [keyof typeof SKILL_CLIENTS]), note: text }).strict()).min(1).max(2)
    .refine(a => new Set(a.map(c => c.id)).size === a.length, "客户端重复"),
  recommendation: z.string().trim().max(500), author: text.max(150),
  license: z.object({ name: text.max(200), url: url.nullable() }).strict(), homepage: url.nullable(),
  verification: z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/), contentHash: z.string().regex(/^[a-f0-9]{64}$/), checkedAt: stamp, installDocUrl: url }).strict(),
}).strict();
export const metricSchema = z.object({
  source: z.literal("skills.sh"), metric: z.literal("installs"), window: z.literal("all-time"),
  displayValue: z.string().regex(/^\d[\d,.]*[KM]?$/).max(30), rank: z.number().int().positive().max(10_000_000),
  sourceUrl: url.refine(s => new URL(s).hostname === "skills.sh", "热度来源必须是 skills.sh"), observedAt: stamp,
}).strict();
export const repositorySchema = z.object({ stars: z.number().int().nonnegative(), pushedAt: stamp, archived: z.boolean() }).strict();
export const importEntrySchema = z.object({
  repo: repoSchema, path, data: skillDataSchema, metric: metricSchema.nullable(),
  repository: z.object({ data: repositorySchema, checkedAt: stamp }).strict().nullable(),
}).strict();
export const importSchema = z.array(importEntrySchema).min(1).max(200);
export const reasonSchema = z.string().trim().min(2, "请填写修改理由").max(500);
export const editSchema = z.object({
  data: skillDataSchema, metric: metricSchema.nullable(), status: z.enum(["published", "hidden"]),
  revision: z.number().int().positive(), reason: reasonSchema,
}).strict();
export const filterSchema = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.enum(["", ...Object.keys(SKILL_CATEGORIES)] as [string, ...string[]]).default(""),
  client: z.enum(["", "codex", "claude-code"]).default(""),
  sort: z.enum(["hot", "featured", "updated"]).default("hot"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
