// Public reference data imported by a site module. Routes select a fixed key, never a reader-supplied key.
// Reading a snapshot never collects data or invokes a model. ETags and collector internals stay private.
import { sql } from "../db.ts";

export async function readReferenceSnapshot<T>(key: string, sourceUrl: string) {
  const [row] = await sql`SELECT data, source_url, checked_at, changed_at, last_attempt_at, next_fetch_at, error
    FROM ai_tool_snapshots WHERE key = ${key}`;
  const at = (value: unknown) => value instanceof Date ? value.toISOString() : value ? new Date(String(value)).toISOString() : null;
  return {
    data: (row?.data ?? null) as T | null,
    sourceUrl: row?.source_url as string ?? sourceUrl,
    checkedAt: at(row?.checked_at), changedAt: at(row?.changed_at), lastAttemptAt: at(row?.last_attempt_at),
    nextFetchAt: at(row?.next_fetch_at), error: row?.error as string ?? null,
  };
}
