import type { Leaderboard, Model, ResetEvent, Resets } from "../contracts.ts";

export const model = (slug = "sample", input: number | null = 2): Model => ({
  model: { slug, name: "Sample Model", provider: "Example", releasedAt: "2026-10-01" },
  access: { domestic: true, weightsUrl: "https://example.org/weights" },
  price: { currency: "CNY", input, output: 8, cached: 0.5, inputCny: input, outputCny: 8, cachedCny: 0.5, officialUrl: "https://example.org/prices", note: null },
});
export const leaderboard = (): Leaderboard => ({
  run: { id: "sample-run", methodologyVersion: "sample-v1", generatedAt: "2026-10-14T00:00:00Z", fx: null },
  models: { sample: model(), extra: model("extra"), pending: model("pending") },
  boards: (["overall", "coding", "reasoning", "professional", "knowledge"] as const).map(key => ({
    board: { key, name: key, description: "Sample board", howToRead: "Sample method", sourceCount: 3, operatorCount: 2 },
    entries: [{ slug: "sample", rank: 1, score: 65, sourceCount: 3, coverage: 1 }],
    filterEntries: [{ slug: "extra", rank: 31, score: 0, sourceCount: 2, coverage: 0.5 }],
    pending: [{ slug: "pending", score: 60, sources: 1, reason: "insufficient coverage" }],
  })),
});
export const event = (id = "event", at = "2026-10-13T23:00:00Z"): ResetEvent => ({
  id, type: "direct_reset", label: "重置", displayLabel: "形式未明确", title: "重置公告", scope: "", status: "confirmed",
  presentation: { status: "confirmed", scopeKnown: false, scopeLabel: null, kindExplicit: false, timeInferred: false, audienceZh: null, productsZh: null },
  createdAt: at, updatedAt: at, confirmedAt: at, occurredOn: null, confirmationBasis: "source_post", schedule: null,
  posts: [{ id: "post", publishedAt: at, stage: "确认完成", text: "已完成", originalText: "Done", context: [], url: "https://x.com/example/status/1" }],
  url: "https://aihot.news/codex-reset",
});
export const resets = (events: ResetEvent[] = [event()]): Resets => ({
  schemaVersion: 1, timezone: "Asia/Shanghai", today: "2026-10-14", checkedAt: "2026-10-14T01:00:00Z", historyFrom: "2026-10-07T00:00:00+08:00",
  count: events.length, events, activities: [], outage: null,
  monitor: { status: "healthy", lastAttemptAt: "2026-10-14T01:00:00Z", lastCollectedAt: "2026-10-14T01:00:00Z", lastVerifiedAt: "2026-10-14T01:00:00Z", heldWindowCount: 0, pendingCount: 0, reviewCount: 0 },
});

export function pageHtml(value: unknown) {
  const table: unknown[] = [];
  function encode(v: unknown): number {
    if (v === null) return -5;
    const index = table.length; table.push(null);
    if (Array.isArray(v)) table[index] = v.map(encode);
    else if (v && typeof v === "object") table[index] = Object.fromEntries(Object.entries(v).map(([k, item]) => [`_${encode(k)}`, encode(item)]));
    else table[index] = v;
    return index;
  }
  encode({ loaderData: { "leaderboard-boards": value } });
  return `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(table) + "\n")});</script>`;
}
