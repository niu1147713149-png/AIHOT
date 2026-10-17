import { createHash } from "node:crypto";
import type { AiIdea, IdeasEdition, IdeaSource, IdeaStatus } from "@aihot/contracts/ideas";
import { addDays, beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { sql, type Db } from "../db.ts";
import { listedCondition } from "./scope.ts";
import { publicSourceName } from "./rules.ts";

export interface IdeaEvidence extends IdeaSource { hash: string }
interface SourceRow { id: string; title: string; summary: string; source: string; at: Date; url: string; fact: number | null }
function evidence(row: SourceRow): IdeaEvidence {
  const data = { id: row.id, title: row.title, summary: row.summary, source: publicSourceName(row.source), at: row.at.toISOString(), url: row.url };
  return { ...data, hash: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
}
const sourceColumns = sql`p.article_id AS id, p.title, coalesce(p.summary, '') AS summary,
  coalesce(s.name, p.source_id) AS source, p.timeline_at AS at, p.url, p.fact_id AS fact`;

/** A bounded sample from this Beijing calendar day; prefer selected reports, one per fact. */
export async function ideaNews(date: string, db: Db = sql): Promise<IdeaEvidence[]> {
  const rows = await db<SourceRow[]>`SELECT ${sourceColumns} FROM publications p LEFT JOIN sources s ON s.id = p.source_id
    WHERE ${listedCondition(new Date())} AND p.timeline_at <= ${new Date()} AND p.timeline_at >= ${beijingMidnight(date)} AND p.timeline_at < ${beijingMidnight(addDays(date, 1))}
    ORDER BY p.selected DESC, p.score DESC NULLS LAST, p.timeline_at DESC, p.article_id LIMIT 300`;
  const seen = new Set<string>();
  return rows.filter(r => { const key = r.fact === null ? r.id : `fact:${r.fact}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 32).map(evidence);
}

export async function currentIdeaEvidence(ids: string[], db: Db = sql): Promise<IdeaEvidence[]> {
  if (!ids.length) return [];
  return (await db<SourceRow[]>`SELECT ${sourceColumns} FROM publications p LEFT JOIN sources s ON s.id = p.source_id
    WHERE p.article_id = ANY(${ids}::text[]) AND ${listedCondition(new Date())}`).map(evidence);
}

export async function readIdeas(date: string): Promise<IdeasEdition> {
  const [rows, dates, sourceDates, news] = await Promise.all([
    sql`SELECT status, ideas, evidence, source_count, generated_at, updated_at FROM ai_idea_editions WHERE date = ${date}`,
    sql`SELECT date FROM ai_idea_editions WHERE generated_at IS NOT NULL ORDER BY date DESC LIMIT 60`,
    sql`SELECT DISTINCT to_char(p.timeline_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date
      FROM publications p WHERE ${listedCondition(new Date())} AND p.timeline_at <= ${new Date()} ORDER BY date DESC LIMIT 30`,
    ideaNews(date),
  ]);
  const row = rows[0], stored: AiIdea[] = row?.ideas ?? [], hashes: Record<string, string> = row?.evidence ?? {};
  const ids = [...new Set(stored.flatMap(i => i.sourceIds))];
  const sources = new Map((await currentIdeaEvidence(ids)).map(s => [s.id, s]));
  // A correction or withdrawal invalidates its derived proposal too; neither old prose nor citations escape.
  const ideas = stored.filter(i => i.sourceIds.length > 0 && i.sourceIds.every(id => sources.get(id)?.hash === hashes[id] && !!hashes[id]))
    .map(i => ({ ...i, sources: i.sourceIds.map(id => { const { hash: _, ...source } = sources.get(id)!; return source; }) }));
  const hiddenCount = stored.length - ideas.length;
  let status: IdeaStatus = row?.status ?? "missing";
  if (status === "running" && Date.now() - row!.updated_at.getTime() > 15 * 60_000) status = "failed";
  if (hiddenCount && !ideas.length) status = "outdated";
  return { date, today: beijingDate(new Date()), status, ideas, hiddenCount, sourceCount: row?.source_count ?? 0,
    currentSourceCount: news.length, generatedAt: row?.generated_at?.toISOString() ?? null,
    dates: dates.map(r => r.date), sourceDates: sourceDates.map(r => r.date) };
}
