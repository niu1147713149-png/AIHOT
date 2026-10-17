import { sql } from "@aihot/backend/db";
import { repoSchema, repositorySchema } from "./schema.ts";

export const syncEnabled = () => process.env.COLLECT_ENABLED === "true" && process.env.SKILLS_MARKET_SYNC_ENABLED === "true";
export async function syncRepository(rawRepo: string, fetcher: typeof fetch = fetch) {
  const repo = repoSchema.parse(rawRepo);
  const [state] = await sql`SELECT data, etag, next_fetch_at FROM skill_source_state WHERE repo = ${repo}`;
  if (!state || state.next_fetch_at && state.next_fetch_at.getTime() > Date.now()) return;
  await sql`UPDATE skill_source_state SET last_attempt_at = now() WHERE repo = ${repo}`;
  let delaySeconds = 86400;
  try {
    const res = await fetcher(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "AIVANE-skills-market/1.0", ...(state.etag ? { "If-None-Match": state.etag } : {}) },
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (res.status === 304 && state.data) {
      await sql`UPDATE skill_source_state SET checked_at = now(), next_fetch_at = date_trunc('day', now()) + interval '1 day', error = NULL WHERE repo = ${repo}`;
      return;
    }
    if (!res.ok) {
      if (res.status === 429 || res.status === 403) {
        const retry = res.headers.get("retry-after"), reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
        const seconds = retry ? /^\d+$/.test(retry) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000 : (reset - Date.now()) / 1000;
        delaySeconds = Math.min(7 * 86400, Math.max(3600, Number.isFinite(seconds) ? Math.ceil(seconds) : 86400));
      }
      throw new Error(`GitHub HTTP ${res.status}`);
    }
    const body = await res.json() as Record<string, unknown>;
    if (typeof body.full_name !== "string" || body.full_name.toLowerCase() !== repo) throw new Error("仓库标识已变化，需重新核验");
    const data = repositorySchema.parse({ stars: body.stargazers_count, pushedAt: body.pushed_at, archived: body.archived });
    await sql`UPDATE skill_source_state SET data = ${sql.json(data)}, checked_at = now(), next_fetch_at = date_trunc('day', now()) + interval '1 day',
      etag = ${res.headers.get("etag")}, error = NULL WHERE repo = ${repo}`;
  } catch (error) {
    const message = error instanceof Error && /^GitHub HTTP \d+$/.test(error.message) ? error.message : "来源暂不可用或格式变化";
    await sql`UPDATE skill_source_state SET error = ${message}, next_fetch_at = now() + ${delaySeconds} * interval '1 second' WHERE repo = ${repo}`;
  }
}
export async function syncSkills() {
  if (!syncEnabled()) return;
  const repos = await sql`SELECT DISTINCT s.repo FROM skill_source_state s JOIN skill_catalog c ON c.repo = s.repo
    WHERE c.status = 'published' AND (s.next_fetch_at IS NULL OR s.next_fetch_at <= now()) ORDER BY s.repo`;
  for (const { repo } of repos) await syncRepository(repo);
}
