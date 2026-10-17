import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify from "fastify";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { readReferenceSnapshot } from "@aihot/backend/publication/reference-snapshots";
import { refresh, retryDelay, syncEnabled, syncLeaderboard, syncResets } from "../backend/sync.ts";
import { registerTools } from "../api/routes.ts";
import { resets } from "./fixtures.ts";

after(closeDb);
test("sync remains enabled at a deployed address and still requires both explicit switches", async () => {
  const originalUrl = config.siteUrl;
  const originalTools = process.env.AI_TOOLS_SYNC_ENABLED;
  const originalCollect = process.env.COLLECT_ENABLED;
  try {
    config.siteUrl = "http://203.0.113.10:13080";
    process.env.AI_TOOLS_SYNC_ENABLED = "true";
    process.env.COLLECT_ENABLED = "true";
    assert.equal(syncEnabled(), true);
    for (const key of ["AI_TOOLS_SYNC_ENABLED", "COLLECT_ENABLED"] as const) {
      for (const value of [undefined, "false", "TRUE"]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
        assert.equal(syncEnabled(), false);
        assert.deepEqual(await syncLeaderboard(), { status: "disabled" });
        assert.deepEqual(await syncResets(), { status: "disabled" });
      }
      process.env[key] = "true";
    }
  } finally {
    config.siteUrl = originalUrl;
    if (originalTools === undefined) delete process.env.AI_TOOLS_SYNC_ENABLED; else process.env.AI_TOOLS_SYNC_ENABLED = originalTools;
    if (originalCollect === undefined) delete process.env.COLLECT_ENABLED; else process.env.COLLECT_ENABLED = originalCollect;
  }
});

test("snapshot refresh handles ETags, polling limits, failures, Retry-After and source removal", async () => {
  const source = { key: "test.snapshot", url: "https://example.org/public", interval: 600000, parse: JSON.parse };
  const start = Date.parse("2026-10-14T00:00:00Z"); let hits = 0;
  const good: typeof fetch = async () => { hits++; return new Response('{"version":1}', { headers: { etag: '"one"' } }); };
  await refresh(source, good, new Date(start));
  assert.equal((await refresh(source, good, new Date(start + 599999))).status, "not-due"); assert.equal(hits, 1);
  const unchanged: typeof fetch = async (_url, init) => { assert.equal(new Headers(init?.headers).get("if-none-match"), '"one"'); return new Response(null, {status:304}); };
  assert.equal((await refresh(source, unchanged, new Date(start + 600000))).status, "unchanged");
  await refresh(source, async () => new Response(null, { status: 429, headers: { "Retry-After": "3600" } }), new Date(start + 1200000));
  const kept = await readReferenceSnapshot<{version:number}>(source.key, source.url);
  assert.equal(kept.data?.version, 1); assert.match(kept.error!, /429/);
  assert.equal(kept.checkedAt, new Date(start + 600000).toISOString());
  assert.equal(kept.nextFetchAt, new Date(start + 4800000).toISOString());
  await refresh(source, async () => new Response('invalid json'), new Date(start + 4800000));
  assert.equal((await readReferenceSnapshot<{version:number}>(source.key, source.url)).data?.version, 1);
  await refresh(source, async () => new Response(null, {status:410}), new Date(start + 5400000));
  assert.equal((await readReferenceSnapshot(source.key, source.url)).data, null);
  assert.equal(retryDelay("Wed, 14 Oct 2026 02:00:00 GMT", start, 600000), 7200000);
});

test("no-store removes the private cache and a concurrent refresh buys only one fetch", async () => {
  const source = { key: "test.concurrency", url: "https://example.org/public", interval: 600000, parse: JSON.parse };
  let release!: () => void, begun!: () => void;
  const wait = new Promise<void>(r => { release = r; }), started = new Promise<void>(r => { begun = r; });
  const running = refresh(source, async () => { begun(); await wait; return new Response('{"value":1}'); });
  await started;
  try { assert.equal((await refresh(source, async () => { throw Error("must not fetch"); })).status, "busy"); } finally { release(); }
  await running;
  await refresh(source, async () => new Response('{}', { headers: { "Cache-Control": "private, no-store" } }), new Date(Date.now() + 700000));
  assert.equal((await readReferenceSnapshot(source.key, source.url)).data, null);
});

test("reader endpoints expose only saved public fields and preserve upstream attention", async () => {
  const payload = resets(); payload.monitor.status = "attention"; payload.monitor.pendingCount = 2;
  await sql`INSERT INTO ai_tool_snapshots (key,source_url,data,etag,checked_at) VALUES
    ('ai-tools.reset-history','https://aihot.news/api/v1/codex-resets',${sql.json(payload as never)},'private-etag',now())`;
  const app = Fastify(); registerTools(app);
  try {
    const res = await app.inject('/api/site/ai-tools/codex-reset');
    assert.equal(res.statusCode,200); assert.equal(res.json().data.monitor.status, "attention");
    assert.equal(res.body.includes("private-etag"),false);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.equal((await app.inject('/api/site/ai-tools/leaderboard')).json().data, null);
  } finally { await app.close(); }
});
