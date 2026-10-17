import { createHash } from "node:crypto";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { modelFor } from "@aihot/backend/editorial/models";
import { chatJson, MODELS } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { currentIdeaEvidence, ideaNews } from "@aihot/backend/publication/ideas";
import { dateSchema, responseSchema } from "./schema.ts";
import { IDEAS_PROMPT_VERSION, IDEAS_SYSTEM } from "./prompt.ts";

/** Worker/CLI only. The session lock also protects a manual run from a scheduled run of the same day. */
export async function generateIdeas(inputDate: string) {
  const date = dateSchema.parse(inputDate), session = await sql.reserve();
  const key = `ai-ideas:${date}`;
  let acquired = false;
  try {
    const [lock] = await session`SELECT pg_try_advisory_lock(hashtext(${key})) AS acquired`;
    acquired = lock.acquired;
    if (!acquired) return { status: "running", reused: true };
    const news = await ideaNews(date), model = await modelFor("ideas");
    const spec = MODELS[model];
    const inputHash = createHash("sha256").update(JSON.stringify({ date, evidence: news.map(s => [s.id, s.hash]), model,
      modelId: spec?.model, extra: spec?.extra, prompt: IDEAS_PROMPT_VERSION })).digest("hex");
    const [last] = await sql`SELECT inputs_hash, generated_at, ideas FROM ai_idea_editions WHERE date = ${date}`;
    if (last?.inputs_hash === inputHash && last.generated_at) {
      const status = last.ideas.length ? "ready" : "empty";
      await sql`UPDATE ai_idea_editions SET status = ${status}, error = NULL, updated_at = now() WHERE date = ${date}`;
      return { status, reused: true };
    }
    await sql`INSERT INTO ai_idea_editions (date, status) VALUES (${date}, 'running')
      ON CONFLICT (date) DO UPDATE SET status = 'running', error = NULL, updated_at = now()`;
    if (!news.length) {
      await sql`UPDATE ai_idea_editions SET status = 'empty', ideas = '[]'::jsonb, evidence = '{}'::jsonb,
        inputs_hash = ${inputHash}, source_count = 0, receipt_id = NULL, generated_at = now(), updated_at = now() WHERE date = ${date}`;
      return { status: "empty", reused: false };
    }
    if (!config.modelCallsEnabled) throw new Error("model_calls_disabled");
    const response = await chatJson({ model, purpose: "ai_ideas", subject: `ideas:${date}`, promptVersion: IDEAS_PROMPT_VERSION,
      system: IDEAS_SYSTEM, user: JSON.stringify({ date, timezone: "Asia/Shanghai", news: news.map(({ hash: _, ...n }) => ({ ...n, summary: n.summary.slice(0, 1600) })) }),
      schema: responseSchema(news.map(n => n.id)), temperature: 0.4, maxTokens: 6500, timeoutMs: 180_000 });
    const result = await sql.begin(async tx => {
      const current = new Map((await currentIdeaEvidence(news.map(n => n.id), tx)).map(n => [n.id, n.hash]));
      if (news.some(n => current.get(n.id) !== n.hash)) {
        await completeReceipt(tx, response.receiptId);
        await tx`UPDATE ai_idea_editions SET status = 'failed', error = '新闻已变更，请重新生成。', updated_at = now() WHERE date = ${date}`;
        return { status: "failed", reused: response.reused };
      }
      const status = response.data.ideas.length ? "ready" : "empty";
      await tx`UPDATE ai_idea_editions SET status = ${status}, ideas = ${sql.json(response.data.ideas)},
        evidence = ${sql.json(Object.fromEntries(news.map(n => [n.id, n.hash])))}, inputs_hash = ${inputHash},
        source_count = ${news.length}, receipt_id = ${response.receiptId}, error = NULL, generated_at = now(), updated_at = now() WHERE date = ${date}`;
      await completeReceipt(tx, response.receiptId);
      return { status, reused: response.reused };
    });
    return result;
  } catch (error) {
    const message = !config.modelCallsEnabled ? "模型调用未开启，请启用后重试。" : "生成未完成，请检查模型回执、预算和配置后重试。";
    await sql`UPDATE ai_idea_editions SET status = 'failed', error = ${message}, updated_at = now() WHERE date = ${date}`;
    throw error;
  } finally {
    try { if (acquired) await session`SELECT pg_advisory_unlock(hashtext(${key}))`; }
    finally { session.release(); }
  }
}
