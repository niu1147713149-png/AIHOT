import { createHash } from "node:crypto";
import { sql, type Db } from "@aihot/backend/db";
import { audit, Conflict } from "@aihot/backend/audit";
import type { AdminSkill, SkillImport, SkillPreview } from "@aihot/contracts/skills";
import { editSchema, importSchema } from "./schema.ts";

export const skillId = (repo: string, path: string) => `sk-${createHash("sha256").update(`${repo.toLowerCase()}/${path}`).digest("hex").slice(0, 20)}`;
export function parseImport(input: unknown) { return importSchema.parse(input); }
const digestOf = (entries: SkillImport[]) => createHash("sha256").update(JSON.stringify(entries)).digest("hex");
export async function previewImport(input: unknown): Promise<SkillPreview> {
  const entries = parseImport(input);
  const existing = await sql`SELECT id FROM skill_catalog WHERE id IN ${sql(entries.map(e => skillId(e.repo, e.path)))}`;
  const seen = new Set(existing.map(r => r.id));
  const rows = entries.map(e => {
    const id = skillId(e.repo, e.path), duplicate = seen.has(id);
    seen.add(id);
    return { id, name: e.data.name, repo: e.repo, path: e.path, duplicate };
  });
  return { digest: digestOf(entries), rows, added: rows.filter(r => !r.duplicate).length, skipped: rows.filter(r => r.duplicate).length };
}
export async function importSkills(input: unknown, digest: string, actor: string, reason: string) {
  const entries = parseImport(input);
  if (digest !== digestOf(entries)) throw new Conflict("导入内容已改变，请重新预览");
  return sql.begin(async tx => {
    let added = 0;
    for (const entry of entries) {
      const id = skillId(entry.repo, entry.path);
      const rows = await tx`INSERT INTO skill_catalog (id, repo, skill_path, data) VALUES (${id}, ${entry.repo}, ${entry.path}, ${tx.json(entry.data)})
        ON CONFLICT (repo, skill_path) DO NOTHING RETURNING id`;
      if (!rows.length) continue;
      added++;
      if (entry.metric) await tx`INSERT INTO skill_metrics (skill_id, data) VALUES (${id}, ${tx.json(entry.metric)})`;
      await tx`INSERT INTO skill_source_state (repo, data, checked_at)
        VALUES (${entry.repo}, ${entry.repository ? tx.json(entry.repository.data) : null}, ${entry.repository?.checkedAt ?? null}) ON CONFLICT (repo) DO NOTHING`;
      await audit(actor, "skills.import", `skill:${id}`, reason, null, entry, { db: tx });
    }
    return { added, skipped: entries.length - added };
  });
}
const at = (value: Date) => value.toISOString();
export async function listAdminSkills(): Promise<AdminSkill[]> {
  const rows = await sql`SELECT c.*, m.data AS metric FROM skill_catalog c LEFT JOIN skill_metrics m ON m.skill_id = c.id ORDER BY c.updated_at DESC, c.id`;
  return rows.map(r => ({ id: r.id, repo: r.repo, path: r.skill_path, data: r.data, metric: r.metric, status: r.status,
    revision: r.revision, createdAt: at(r.created_at), updatedAt: at(r.updated_at) }));
}
export async function readAdminSkill(id: string, db: Db = sql): Promise<AdminSkill | null> {
  const [r] = await db`SELECT c.*, m.data AS metric FROM skill_catalog c LEFT JOIN skill_metrics m ON m.skill_id = c.id WHERE c.id = ${id}`;
  return r ? { id: r.id, repo: r.repo, path: r.skill_path, data: r.data, metric: r.metric, status: r.status,
    revision: r.revision, createdAt: at(r.created_at), updatedAt: at(r.updated_at) } : null;
}
export async function editSkill(id: string, input: unknown, actor: string) {
  const next = editSchema.parse(input);
  return sql.begin(async tx => {
    await tx`SELECT id FROM skill_catalog WHERE id = ${id} FOR UPDATE`;
    const before = await readAdminSkill(id, tx);
    if (!before || before.revision !== next.revision) throw new Conflict("条目已变更，请重新加载后再保存");
    await tx`UPDATE skill_catalog SET data = ${tx.json(next.data)}, status = ${next.status}, revision = revision + 1, updated_at = now() WHERE id = ${id}`;
    if (next.metric) await tx`INSERT INTO skill_metrics (skill_id, data) VALUES (${id}, ${tx.json(next.metric)}) ON CONFLICT (skill_id) DO UPDATE SET data = EXCLUDED.data`;
    else await tx`DELETE FROM skill_metrics WHERE skill_id = ${id}`;
    const after = await readAdminSkill(id, tx);
    await audit(actor, "skills.edit", `skill:${id}`, next.reason, before, after, { db: tx });
    return after!;
  });
}
