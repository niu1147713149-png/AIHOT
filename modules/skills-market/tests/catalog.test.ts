import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import Fastify from "fastify";
import seed from "../data/seed.json" with { type: "json" };
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { readSkill, readSkills } from "@aihot/backend/publication/skills";
import { editSkill, importSkills, parseImport, previewImport, readAdminSkill, skillId } from "../backend/catalog.ts";
import { registerSkills } from "../api/routes.ts";
import { installCommand } from "../data.ts";
import { syncEnabled, syncRepository, syncSkills } from "../backend/sync.ts";

const app = Fastify();
registerSkills(app);
const filter = { q: "", category: "", client: "", sort: "hot", page: 1 };
async function add(input: unknown = seed) { const p = await previewImport(input); return importSkills(input, p.digest, "test:skills", "核验目录导入"); }
beforeEach(async () => { config.devAdmin = null; await sql`DELETE FROM skill_catalog`; await sql`DELETE FROM skill_source_state`; });
after(async () => { await app.close(); await closeDb(); });

test("verified seed, import identity, duplicates and audit survive retries", async () => {
  const parsed = parseImport(seed);
  assert.equal(parsed.length, 33);
  assert.equal(new Set(parsed.map(s => skillId(s.repo, s.path))).size, 33);
  const first = parsed[0], second = { ...first, path: "skills/another/SKILL.md" };
  const preview = await previewImport([first, first, second]);
  assert.equal(preview.added, 2); assert.equal(preview.skipped, 1);
  await assert.rejects(importSkills([first], preview.digest, "test", "test"), /重新预览/);
  assert.deepEqual(await add([first, first, second]), { added: 2, skipped: 1 });
  assert.deepEqual(await add([first]), { added: 0, skipped: 1 });
  const [audit] = await sql`SELECT count(*)::integer AS n FROM audit_log WHERE subject = ${`skill:${skillId(first.repo, first.path)}`} AND action = 'skills.import'`;
  assert.equal(audit.n, 1);
});

test("public search, filters and pagination preserve source ranks and exclude withdrawn entries", async () => {
  await add();
  const page1 = await readSkills(filter), page2 = await readSkills({ ...filter, page: 2 });
  assert.equal(page1.total, 33); assert.equal(page1.items.length, 12);
  assert.equal(new Set([...page1.items, ...page2.items].map(s => s.id)).size, 24);
  assert.equal(page1.items[0].data.name, "find-skills"); assert.equal(page1.items[0].metric?.rank, 1);
  assert.equal((await readSkills({ ...filter, q: "React" })).total, 3);
  assert.ok((await readSkills({ ...filter, category: "office" })).items.every(s => s.data.category === "office"));
  assert.ok((await readSkills({ ...filter, sort: "featured" })).items.every(s => s.data.recommendation));
  assert.equal((await readSkills({ ...filter, q: "%" })).total, 0, "SQL wildcards are literal search terms");
  const id = page1.items[0].id, current = (await readAdminSkill(id))!;
  await editSkill(id, { data: { ...current.data, clients: [{ id: "codex", note: "测试兼容说明" }] }, metric: null, status: "hidden", revision: current.revision, reason: "暂时下架" }, "test");
  assert.equal(await readSkill(id), null); assert.equal((await readSkills(filter)).total, 32);
  assert.equal((await app.inject(`/api/site/skills/${id}`)).statusCode, 404);
  const hidden = (await readAdminSkill(id))!;
  await editSkill(id, { data: hidden.data, metric: null, status: "published", revision: hidden.revision, reason: "重新上架" }, "test");
  assert.equal((await readSkills({ ...filter, client: "claude-code" })).total, 32);
  assert.equal((await readSkill(id))?.metric, null);
  assert.equal((await readSkills({ ...filter, page: 999 })).total, 33);
});

test("admin authentication, CSRF, optimistic edits and non-overwriting imports", async () => {
  assert.equal((await app.inject("/api/admin/skills")).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/skills/import", payload: {} })).statusCode, 401);
  config.devAdmin = { displayName: "Skill Editor" };
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/skills/preview", payload: seed })).statusCode, 403);
  const headers = { "x-csrf-token": "dev" };
  const p = await app.inject({ method: "POST", url: "/api/admin/skills/preview", headers, payload: seed });
  assert.equal(p.statusCode, 200); assert.equal(p.json().added, 33);
  const imported = await app.inject({ method: "POST", url: "/api/admin/skills/import", headers, payload: { entries: seed, digest: p.json().digest, reason: "导入核验清单" } });
  assert.equal(imported.statusCode, 200); assert.equal(imported.json().added, 33);
  const id = skillId(seed[0].repo, seed[0].path), current = (await readAdminSkill(id))!;
  const payload = { data: { ...current.data, title: "人工编辑标题" }, metric: current.metric, status: "published", revision: 1, reason: "补充中文标题" };
  assert.equal((await app.inject({ method: "PATCH", url: `/api/admin/skills/${id}`, headers, payload })).statusCode, 200);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/admin/skills/${id}`, headers, payload })).statusCode, 409);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/admin/skills/${id}`, headers, payload: { ...payload, reason: "" } })).statusCode, 400);
  await add(seed);
  assert.equal((await readSkill(id))?.data.title, "人工编辑标题");
  const publicResponse = await app.inject(`/api/site/skills/${id}`);
  assert.equal(publicResponse.headers["cache-control"], "no-store");
  assert.equal(publicResponse.json().revision, undefined);
  assert.equal((await app.inject("/api/site/skills?category=invalid")).statusCode, 400);
  assert.equal((await app.inject("/api/site/skills?page=-1")).statusCode, 400);
});

test("update ordering and latest snapshot compare instants across time zones", async () => {
  const entries = ["2026-10-15T12:00:00+08:00", "2026-10-15T06:00:00Z"].map((at, i) => ({ ...seed[0], repo: `fixture/repo-${i}`,
    repository: { checkedAt: at, data: { stars: 10, pushedAt: at, archived: false } }, metric: { ...seed[0].metric!, observedAt: at } }));
  await add(entries);
  const result = await readSkills({ ...filter, sort: "updated" });
  assert.equal(result.items[0].repo, "fixture/repo-1");
  assert.equal(result.snapshotAt, "2026-10-15T06:00:00.000Z");
});

test("import validation prevents shell tokens, path traversal and unsafe links", () => {
  for (const repo of ["https://evil.example/a", "owner/repo;curl", "../repo", "-x/repo", "owner/repo\nwhoami", "owner/repo\n"]) {
    assert.throws(() => parseImport([{ ...seed[0], repo }]));
    assert.throws(() => installCommand(repo, "safe", "codex", "project"));
  }
  for (const path of ["../SKILL.md", "skills/../SKILL.md", "/tmp/SKILL.md", "skills/name/README.md"]) assert.throws(() => parseImport([{ ...seed[0], path }]));
  for (const name of ["x;whoami", "-y", "$(whoami)", "x y"]) assert.throws(() => installCommand("owner/repo", name, "codex", "project"));
  assert.throws(() => parseImport([{ ...seed[0], data: { ...seed[0].data, homepage: "javascript:alert(1)" } }]));
  assert.equal(installCommand("owner/repo", "safe", "claude-code", "global"), "npx skills add https://github.com/owner/repo --skill safe --agent claude-code --global");
  assert.equal(installCommand("owner/repo", "safe", "codex", "project").includes("--global"), false);
});

test("repository refresh uses conditional requests, backs off and preserves ranking on errors", async () => {
  await add([seed[0]]);
  const repo = seed[0].repo, id = skillId(repo, seed[0].path), before = await readSkill(id);
  await syncRepository(repo, async (url, init) => {
    assert.equal(url, `https://api.github.com/repos/${repo}`); assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify({ full_name: repo, stargazers_count: 40000, pushed_at: "2026-10-15T10:00:00Z", archived: false }), { headers: { etag: '"fixture"' } });
  });
  assert.equal((await readSkill(id))?.repository?.stars, 40000);
  assert.deepEqual((await readSkill(id))?.metric, before?.metric);
  await sql`UPDATE skill_source_state SET next_fetch_at = NULL WHERE repo = ${repo}`;
  await syncRepository(repo, async (_url, init) => { assert.equal(new Headers(init?.headers).get("if-none-match"), '"fixture"'); return new Response(null, { status: 304 }); });
  assert.equal((await readSkill(id))?.repository?.stars, 40000);
  for (const status of [429, 401, 500]) {
    await sql`UPDATE skill_source_state SET next_fetch_at = NULL WHERE repo = ${repo}`;
    await syncRepository(repo, async () => new Response("unavailable", { status, headers: { "retry-after": "7200" } }));
    assert.equal((await readSkill(id))?.repositoryRefreshFailed, true);
    assert.equal((await readSkill(id))?.repository?.stars, 40000);
    const [state] = await sql`SELECT next_fetch_at, last_attempt_at, error FROM skill_source_state WHERE repo = ${repo}`;
    assert.ok(state.next_fetch_at > state.last_attempt_at); assert.equal(state.error, `GitHub HTTP ${status}`);
    await syncRepository(repo, async () => { throw new Error("must not fetch before retry"); });
    assert.equal((await sql`SELECT error FROM skill_source_state WHERE repo = ${repo}`)[0].error, state.error);
  }
  await assert.rejects(syncRepository("owner/repo?secret"));
});

test("sync requires both explicit switches, and public reads never fetch a source", async () => {
  const collect = process.env.COLLECT_ENABLED, enabled = process.env.SKILLS_MARKET_SYNC_ENABLED, originalFetch = globalThis.fetch;
  try {
    await add([seed[0]]);
    globalThis.fetch = async () => { throw new Error("public reads must not fetch"); };
    process.env.COLLECT_ENABLED = "true"; process.env.SKILLS_MARKET_SYNC_ENABLED = "false";
    assert.equal(syncEnabled(), false); await syncSkills();
    assert.equal((await app.inject("/api/site/skills")).statusCode, 200);
    process.env.SKILLS_MARKET_SYNC_ENABLED = "true"; assert.equal(syncEnabled(), true);
    process.env.COLLECT_ENABLED = "TRUE"; assert.equal(syncEnabled(), false); await syncSkills();
  } finally { globalThis.fetch = originalFetch; if (collect === undefined) delete process.env.COLLECT_ENABLED; else process.env.COLLECT_ENABLED = collect;
    if (enabled === undefined) delete process.env.SKILLS_MARKET_SYNC_ENABLED; else process.env.SKILLS_MARKET_SYNC_ENABLED = enabled; }
});
