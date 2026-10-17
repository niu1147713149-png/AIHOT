import { stub } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import Fastify from "fastify";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { ideaNews, readIdeas } from "@aihot/backend/publication/ideas";
import { registerIdeas } from "../api/routes.ts";
import { generateIdeas } from "../backend/generate.ts";
import { ideasScheduleEnabled, scheduleIdeas } from "../backend/jobs.ts";
import { responseSchema } from "../backend/schema.ts";
import module from "../server.ts";

const date = "2026-01-06", source = "ai-ideas-test", app = Fastify();
installModules([module]); registerIdeas(app);
let count = 0;
beforeEach(async () => {
  config.devAdmin = null; config.modelCallsEnabled = true;
  await sql`DELETE FROM ai_idea_editions`;
  await sql`DELETE FROM articles WHERE source_id = ${source}`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode) VALUES (${source}, '测试来源', 'rss', 'T1', 'editorial') ON CONFLICT DO NOTHING`;
  process.env.LLM_MODEL = "fixture-model"; process.env.LLM_API_KEY = "test-key"; process.env.LLM_EXTRA_JSON = "{}";
});
after(async () => { await app.close(); await stopBoss(); await closeDb(); });
async function add(at = "2026-01-06T03:00:00Z") {
  const id = `idea-article-${++count}`, url = `https://example.org/${id}`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,timeline_at,discovered_at)
    VALUES (${id},${source},${id},${url},'表格模型新增批处理',${at},${at})`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,selected,eligible,visible_after,channel,category)
    VALUES (${id},${source},'表格模型新增批处理','据官方公告，支持表格抽取的批处理功能。',${url},${at},${at},${at},true,true,${at},'news','ai-models')`;
  return id;
}
function idea(id: string) {
  return { title: "为小店做进货单整理", category: "automation", audience: "需要手录进货单的小店（待验证）", problem: "录单时间多，需访谈核实", proposal: "交付一份可复核的进货表格",
    whyNow: "新闻提及表格抽取的批处理能力", firstStep: "找一位店主了解录单流程", validation: ["取得允许使用的脱敏样本", "与人工录入逐项对比"],
    successSignal: "建议标准：店主愿意提供第二批样本", stopSignal: "错误太多且人工复核更慢则暂停", effort: "粗估需一天制作样例，API 成本待核算", monetization: "按批整理收费的假设", uncertainties: ["中文准确率与数据处理许可"], sourceIds: [id] };
}
async function provider(answer: () => unknown | Promise<unknown>) {
  const server = await stub(async () => ({ choices: [{ message: { content: JSON.stringify(await answer()) } }], usage: { prompt_tokens: 100, completion_tokens: 150 } }));
  process.env.LLM_BASE_URL = `${server.url}/v1`;
  return server;
}

test("Beijing boundaries, public scope and future release gate define the daily inputs", async () => {
  const inside = await add("2026-01-05T16:00:00Z"), end = await add("2026-01-06T15:59:59Z");
  await add("2026-01-05T15:59:59Z"); await add("2026-01-06T16:00:00Z");
  const privateId = await add(), pending = await add(), ineligible = await add();
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${privateId}`;
  await sql`UPDATE publications SET visible_after = '2999-01-01' WHERE article_id = ${pending}`;
  await sql`UPDATE publications SET eligible = false WHERE article_id = ${ineligible}`;
  assert.deepEqual((await ideaNews(date)).map(n => n.id).sort(), [inside, end].sort());
});

test("generation persists paid receipts, reuses unchanged inputs and public reads never invoke a model", async () => {
  const id = await add(), server = await provider(() => ({ ideas: [idea(id)] }));
  try {
    assert.equal((await generateIdeas(date)).status, "ready");
    const first = await readIdeas(date);
    assert.equal(first.ideas.length, 1); assert.equal(first.ideas[0].sources[0].id, id);
    assert.equal(first.sourceCount, 1);
    const [row] = await sql`SELECT receipt_id FROM ai_idea_editions WHERE date = ${date}`;
    assert.ok(row.receipt_id > 0);
    assert.equal((await generateIdeas(date)).reused, true);
    config.modelCallsEnabled = false;
    const response = await app.inject(`/api/site/ideas?date=${date}`);
    assert.equal(response.statusCode, 200); assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.json().receiptId, undefined); assert.equal(server.hits(), 1);
    await sql`UPDATE publications SET summary = '已更正：暂不支持表格处理' WHERE article_id = ${id}`;
    const corrected = await readIdeas(date);
    assert.equal(corrected.status, "outdated"); assert.equal(corrected.hiddenCount, 1); assert.deepEqual(corrected.ideas, []);
    assert.ok(!JSON.stringify(corrected).includes("进货单"));
    await sql`DELETE FROM articles WHERE id = ${id}`;
    assert.equal((await readIdeas(date)).ideas.length, 0);
  } finally { await server.close(); }
});

test("empty days do not call a provider or silently substitute another day's news", async () => {
  await add(); config.modelCallsEnabled = false;
  assert.equal((await generateIdeas("2026-01-07")).status, "empty");
  const result = await readIdeas("2026-01-07");
  assert.equal(result.date, "2026-01-07"); assert.equal(result.currentSourceCount, 0); assert.deepEqual(result.ideas, []);
  assert.ok(result.sourceDates.includes(date));
});

test("only supplied source IDs are accepted; malformed output cannot become public", async () => {
  const id = await add();
  assert.equal(responseSchema([id]).safeParse({ ideas: [idea("fabricated-id")] }).success, false);
  assert.equal(responseSchema([id]).safeParse({ ideas: Array(6).fill(idea(id)) }).success, false);
  assert.equal(responseSchema([id]).safeParse({ ideas: [idea(id), idea(id)] }).success, false);
  // Real output included five distinct risks; retain the information instead of discarding a valid edition.
  assert.equal(responseSchema([id]).safeParse({ ideas: [{ ...idea(id), uncertainties: Array(5).fill("待核验的限制条件") }] }).success, true);
  assert.equal(responseSchema([id]).safeParse({ ideas: [{ ...idea(id), uncertainties: Array(9).fill("待核验的限制条件") }] }).success, false);
  const server = await provider(() => ({ ideas: [idea("fabricated-id")] }));
  try {
    await assert.rejects(generateIdeas(date));
    const result = await readIdeas(date);
    assert.equal(result.status, "failed"); assert.deepEqual(result.ideas, []);
    const response = await app.inject(`/api/site/ideas?date=${date}`);
    assert.ok(!response.body.includes("test-key")); assert.ok(!response.body.includes("error"));
  } finally { await server.close(); }
});

test("concurrent work is serialized and news changed during inference is not published", async () => {
  const id = await add();
  let finish!: () => void, entered!: () => void;
  const wait = new Promise<void>(resolve => finish = resolve), seen = new Promise<void>(resolve => entered = resolve);
  const server = await provider(async () => { entered(); await wait; return { ideas: [idea(id)] }; });
  try {
    const generating = generateIdeas(date); await seen;
    assert.equal((await generateIdeas(date)).status, "running");
    await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${id}`;
    finish(); assert.equal((await generating).status, "failed");
    assert.equal((await readIdeas(date)).ideas.length, 0); assert.equal(server.hits(), 1);
  } finally { finish(); await server.close(); }
});

test("authentication, CSRF, date validation and queue admission do not perform model work in HTTP", async () => {
  const id = await add(), server = await provider(() => ({ ideas: [idea(id)] }));
  try {
    assert.equal((await app.inject("/api/admin/ideas")).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/ideas/generate", payload: { date, reason: "访客点击生成" } })).statusCode, 401);
    config.devAdmin = { displayName: "Ideas Editor" };
    const payload = { date, reason: "测试生成任务" }, headers = { "x-csrf-token": "dev" };
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/ideas/generate", payload })).statusCode, 403);
    for (const bad of ["2026-02-30", "2026-1-6", "2999-01-01", "invalid"]) {
      assert.equal((await app.inject(`/api/site/ideas?date=${bad}`)).statusCode, 400);
      assert.equal((await app.inject({ method: "POST", url: "/api/admin/ideas/generate", headers, payload: { ...payload, date: bad } })).statusCode, 400);
    }
    config.modelCallsEnabled = false;
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/ideas/generate", headers, payload })).statusCode, 409);
    config.modelCallsEnabled = true;
    const response = await app.inject({ method: "POST", url: "/api/admin/ideas/generate", headers, payload });
    assert.equal(response.statusCode, 202); assert.equal(response.json().queued, true);
    const duplicate = await app.inject({ method: "POST", url: "/api/admin/ideas/generate", headers, payload });
    assert.equal(duplicate.json().queued, false);
    assert.equal((await readIdeas(date)).status, "queued"); assert.equal(server.hits(), 0);
    assert.equal((await sql`SELECT count(*) AS n FROM audit_log WHERE action = 'ideas.generate'`)[0].n, 1);
  } finally { await server.close(); }
});

test("the daily schedule requires both explicit switches", async () => {
  const before = process.env.AI_IDEAS_DAILY_ENABLED;
  try {
    process.env.AI_IDEAS_DAILY_ENABLED = "false"; assert.equal(ideasScheduleEnabled(), false);
    assert.deepEqual(await scheduleIdeas(), { skipped: true });
    process.env.AI_IDEAS_DAILY_ENABLED = "TRUE"; assert.equal(ideasScheduleEnabled(), false);
    process.env.AI_IDEAS_DAILY_ENABLED = "true"; assert.equal(ideasScheduleEnabled(), true);
    config.modelCallsEnabled = false; assert.equal(ideasScheduleEnabled(), false);
  } finally { if (before === undefined) delete process.env.AI_IDEAS_DAILY_ENABLED; else process.env.AI_IDEAS_DAILY_ENABLED = before; }
});
