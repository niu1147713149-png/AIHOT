// Maintenance worker. Stop the regular worker first to avoid overlapping translation schedules.
// Preview is read-only; --apply uses the normal translation receipts, budgets and revision checks.
import { parseArgs } from "node:util";
import { sql, closeDb } from "@aihot/backend/db";
import { translatePending } from "@aihot/backend/editorial/translate";
import { recordRun, shutdownSignal, stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false }, concurrency: { type: "string", default: "4" } } });
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error("concurrency must be an integer from 1 to 12");
installModules(SERVER_MODULES);
process.on("SIGTERM", () => shutdownSignal.abort());
process.on("SIGINT", () => shutdownSignal.abort());
try {
  const [scope] = await sql`SELECT count(*) AS candidates,coalesce(sum(length(a.body_text)),0) AS characters
    FROM publications p JOIN articles a ON a.id=p.article_id
    LEFT JOIN translations tr ON tr.article_id=a.id AND tr.lang='zh'
    WHERE p.visibility='public' AND p.body_mode='full' AND coalesce(a.language,'')<>'zh'
      AND coalesce(a.body_text,'')<>'' AND (a.language='en' OR NOT (left(a.body_text,400) ~ '[一-鿿]'))
      AND (tr.article_id IS NULL OR (tr.origin<>'source' AND (tr.revision<a.revision OR NOT tr.complete)))`;
  console.log(JSON.stringify({ mode: values.apply ? "apply" : "preview", concurrency, ...scope }));
  if (values.apply) {
    // These old terminal skips came from the retired selected-only / short-post rules.
    await sql`DELETE FROM translation_attempts WHERE outcome='skipped' AND reason IN ('short post','not a selected full-text item')`;
    const result = await recordRun("content.translate.backfill", () => translatePending({ limit: 10000, budgetMs: 2 * 60 * 60_000, concurrency }));
    console.log(JSON.stringify({ processed: result.done.length, translated: result.done.filter(r => r.status === "translated").length,
      incomplete: result.done.filter(r => r.status !== "translated").map(r => ({ articleId: r.articleId, status: r.status })), quotes: result.quotes }));
  }
} finally {
  await stopBoss();
  await closeDb();
}
