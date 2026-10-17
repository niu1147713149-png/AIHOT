import type { SkillEntry, SkillList } from "@aihot/contracts/skills";
import { sql } from "../db.ts";

const at = (value: Date | null) => value?.toISOString() ?? null;
function entry(r: Record<string, any>): SkillEntry {
  return { id: r.id, repo: r.repo, path: r.skill_path, data: r.data, metric: r.metric,
    repository: r.repository, repositoryCheckedAt: at(r.checked_at), repositoryRefreshFailed: !!r.error, updatedAt: at(r.updated_at)! };
}
export async function readSkills(f: { q: string; category: string; client: string; sort: string; page: number }): Promise<SkillList> {
  const pageSize = 12;
  const search = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = sql`c.status = 'published'
    AND (${!f.q} OR concat_ws(' ', c.repo, c.data->>'name', c.data->>'title', c.data->>'summary', c.data->>'tasks') ILIKE ${search})
    AND (${!f.category} OR c.data->>'category' = ${f.category})
    AND (${!f.client} OR c.data->'clients' @> ${sql.json([{ id: f.client }])}::jsonb)
    AND (${f.sort !== "featured"} OR c.data->>'recommendation' <> '')`;
  const order = f.sort === "updated" ? sql`COALESCE((s.data->>'pushedAt')::timestamptz, (c.data->'verification'->>'checkedAt')::timestamptz) DESC, c.id`
    : f.sort === "featured" ? sql`c.updated_at DESC, c.id` : sql`(m.data->>'rank')::integer ASC NULLS LAST, c.id`;
  const [rows, [count]] = await Promise.all([
    sql`SELECT c.id, c.repo, c.skill_path, c.data, c.updated_at, m.data AS metric, s.data AS repository, s.checked_at, s.error
      FROM skill_catalog c LEFT JOIN skill_metrics m ON m.skill_id = c.id LEFT JOIN skill_source_state s ON s.repo = c.repo
      WHERE ${where} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(f.page - 1) * pageSize}`,
    sql`SELECT count(*)::integer AS total, max((m.data->>'observedAt')::timestamptz) AS snapshot_at
      FROM skill_catalog c LEFT JOIN skill_metrics m ON m.skill_id = c.id WHERE ${where}`,
  ]);
  return { items: rows.map(entry), total: count.total, page: f.page, pageSize, snapshotAt: at(count.snapshot_at) };
}
export async function readSkill(id: string): Promise<SkillEntry | null> {
  const [row] = await sql`SELECT c.id, c.repo, c.skill_path, c.data, c.updated_at, m.data AS metric, s.data AS repository, s.checked_at, s.error
    FROM skill_catalog c LEFT JOIN skill_metrics m ON m.skill_id = c.id LEFT JOIN skill_source_state s ON s.repo = c.repo
    WHERE c.id = ${id} AND c.status = 'published'`;
  return row ? entry(row) : null;
}
