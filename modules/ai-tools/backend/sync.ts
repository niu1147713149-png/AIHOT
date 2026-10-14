import { sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { parseLeaderboard } from "./parse.ts";
import { resetsSchema } from "./schema.ts";

export const SOURCES = {
  leaderboard: { key: "ai-tools.leaderboard", url: "https://aihot.news/leaderboard", interval: 6 * 3600000, parse: parseLeaderboard },
  history: { key: "ai-tools.reset-history", url: "https://aihot.news/api/v1/codex-resets", interval: 24 * 3600000, parse: (text: string) => resetsSchema.parse(JSON.parse(text)) },
  recent: { key: "ai-tools.reset-recent", url: "https://aihot.news/api/v1/codex-resets/recent", interval: 10 * 60000, parse: (text: string) => resetsSchema.parse(JSON.parse(text)) },
} as const;
export const syncEnabled = () => process.env.AI_TOOLS_SYNC_ENABLED === "true" && process.env.COLLECT_ENABLED === "true"
  && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(config.siteUrl).hostname);

export function retryDelay(value: string | null, now: number, minimum: number) {
  if (!value) return minimum;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(minimum, delay) : minimum;
}

async function boundedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error("response too large");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => {}); }
}

// The row lock and next_fetch_at cover both scheduled work and the explicit local bootstrap script.
// A failed fetch preserves the last good snapshot; an explicit removal clears it. No page calls this.
export async function refresh(source: { key: string; url: string; interval: number; parse: (text: string) => unknown },
  fetcher: typeof fetch = fetch, now = new Date()) {
  return sql.begin(async tx => {
    const [lock] = await tx`SELECT pg_try_advisory_xact_lock(hashtext(${source.key})) AS acquired`;
    if (!lock.acquired) return { key: source.key, status: "busy" };
    const [previous] = await tx`SELECT * FROM ai_tool_snapshots WHERE key = ${source.key}`;
    if (previous?.next_fetch_at && new Date(previous.next_fetch_at).getTime() > now.getTime()) return { key: source.key, status: "not-due" };
    let next = new Date(now.getTime() + source.interval);
    const saveError = async (error: string, clear = false) => {
      await tx`INSERT INTO ai_tool_snapshots (key, source_url, last_attempt_at, next_fetch_at, error)
        VALUES (${source.key}, ${source.url}, ${now}, ${next}, ${error})
        ON CONFLICT (key) DO UPDATE SET last_attempt_at = EXCLUDED.last_attempt_at, next_fetch_at = EXCLUDED.next_fetch_at,
          error = EXCLUDED.error, data = CASE WHEN ${clear} THEN NULL ELSE ai_tool_snapshots.data END,
          etag = CASE WHEN ${clear} THEN NULL ELSE ai_tool_snapshots.etag END`;
      return { key: source.key, status: "error", error };
    };
    try {
      const response = await fetcher(source.url, { headers: { accept: source.key.endsWith("leaderboard") ? "text/html" : "application/json",
        "user-agent": "AI-Opportunity-Radar/1.0 (local personal reference reader)",
        ...(previous?.etag && previous?.data ? { "if-none-match": String(previous.etag) } : {}) },
        redirect: "error", signal: AbortSignal.timeout(30000) });
      next = new Date(now.getTime() + retryDelay(response.headers.get("retry-after"), now.getTime(), source.interval));
      const cache = response.headers.get("cache-control") ?? "";
      if (/\bno-store\b/i.test(cache)) { await response.body?.cancel(); return saveError("来源要求不缓存，已停止展示", true); }
      const age = /(?:^|[, ])max-age=(\d+)/i.exec(cache);
      if (age) next = new Date(Math.max(next.getTime(), now.getTime() + Number(age[1]) * 1000));
      if (response.status === 304) {
        if (!previous?.data) return saveError("来源返回 304，但本地没有有效快照");
        await tx`UPDATE ai_tool_snapshots SET last_attempt_at = ${now}, checked_at = ${now}, next_fetch_at = ${next}, error = NULL WHERE key = ${source.key}`;
        return { key: source.key, status: "unchanged" };
      }
      if (!response.ok) { await response.body?.cancel(); return saveError(`来源返回 HTTP ${response.status}`, [403, 404, 410].includes(response.status)); }
      const data = source.parse(await boundedText(response));
      await tx`INSERT INTO ai_tool_snapshots (key,source_url,data,etag,last_attempt_at,checked_at,changed_at,next_fetch_at,error)
        VALUES (${source.key},${source.url},${tx.json(data as never)},${response.headers.get("etag")},${now},${now},${now},${next},NULL)
        ON CONFLICT (key) DO UPDATE SET source_url=EXCLUDED.source_url,data=EXCLUDED.data,etag=EXCLUDED.etag,
          last_attempt_at=EXCLUDED.last_attempt_at,checked_at=EXCLUDED.checked_at,
          changed_at=CASE WHEN ai_tool_snapshots.data IS DISTINCT FROM EXCLUDED.data THEN EXCLUDED.changed_at ELSE ai_tool_snapshots.changed_at END,
          next_fetch_at=EXCLUDED.next_fetch_at,error=NULL`;
      return { key: source.key, status: "updated" };
    } catch {
      return saveError("同步失败：网络不可用或来源数据格式变化");
    }
  });
}

export async function syncLeaderboard() {
  if (!syncEnabled()) return { status: "disabled" };
  const result = await refresh(SOURCES.leaderboard);
  if ("error" in result) throw new Error(result.error);
  return result;
}
export async function syncResets() {
  if (!syncEnabled()) return { status: "disabled" };
  const history = await refresh(SOURCES.history);
  const recent = await refresh(SOURCES.recent);
  if (history.status === "error" || recent.status === "error") throw new Error("Tibo 记录同步失败，详情见页面同步状态");
  return { history, recent };
}
