import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import type { IdeasEdition } from "@aihot/contracts/ideas";
import { startWebServer } from "./web-server.ts";

function fixture() {
  let failed = false, signedIn = true, postStatus = 202, posts = 0, identityReads = 0;
  const changes = new Map<string, Partial<IdeasEdition>>();
  const requests: { date: string; reason: string }[] = [];
  const edition: IdeasEdition = {
    date: "2026-01-06", today: "2026-01-07", status: "ready", sourceCount: 2, currentSourceCount: 2, hiddenCount: 0,
    generatedAt: "2026-01-06T13:30:00Z", dates: ["2026-01-06"], sourceDates: ["2026-01-06"],
    ideas: [{ title: "把进货单变成可复核的表格", category: "automation", audience: "每周手录进货单的小店，需访谈确认需求", problem: "录单时间多，需了解实际耗时", proposal: "为店主整理一批进货记录，交付可以人工复核的表格。",
      whyNow: "新闻显示抽取工具新增了批处理功能。", firstStep: "约一位店主聊十分钟，了解录单过程。", validation: ["取得允许使用的脱敏样本。", "比对人工录入耗时和错误。"], successSignal: "建议标准：愿意再提供一批样本", stopSignal: "复核耗时反而更长则暂停", effort: "粗估一天，需表格处理技能，API 费用待核实", monetization: "按批处理收费，需验证付费意愿", uncertainties: ["中文识别效果和数据处理权限"], sourceIds: ["fixture-news"],
      sources: [{ id: "fixture-news", title: "抽取工具支持批处理", summary: "新闻摘要：新增批量表格识别。", at: "2026-01-05T16:30:00Z", source: "测试新闻", url: "https://example.org/news" }] }],
  };
  const api = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://fixture"), path = url.pathname;
    res.setHeader("content-type", "application/json");
    const send = (data: unknown, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (path === "/api/site/meta") return send({ changelogVersion: "fixture" });
    if (path === "/api/site/track") return send({}, 204);
    if (path === "/api/auth/login") {
      res.writeHead(302, { location: `/admin/login?${new URLSearchParams({ return: url.searchParams.get("return") ?? "/admin" })}` });
      return res.end();
    }
    if (path === "/api/auth/options") return send({ password: true, feishu: false });
    if (path === "/api/admin/me") identityReads++;
    if (path.startsWith("/api/admin/") && !signedIn) return send({}, 401);
    if (path === "/api/admin/me") return send({ name: "Fixture admin", csrf: "fixture-csrf", dev: false });
    if (path === "/api/admin/nav-counts") return send({});
    if (path === "/api/admin/ideas/generate" && req.method === "POST") {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (req.headers["x-csrf-token"] !== "fixture-csrf") return send({}, 403);
      assert.ok(["2026-01-06", "2026-01-07"].includes(body.date)); assert.ok(body.reason.length >= 2);
      posts++; requests.push(body);
      if (postStatus !== 202) return send({}, postStatus);
      changes.set(body.date, { ...changes.get(body.date), status: "queued" });
      return send({ queued: true, date: body.date }, 202);
    }
    if (path === "/api/site/ideas" || path === "/api/admin/ideas") {
      if (failed) return send({}, 503);
      const date = url.searchParams.get("date") ?? "2026-01-07";
      if (date === "bad-date") return send({}, 400);
      const out = { ...(date === edition.date ? edition : { ...edition, date, status: "missing", ideas: [], generatedAt: null, sourceCount: 0, currentSourceCount: 0 }), ...changes.get(date) };
      return send(path.startsWith("/api/admin/") ? { edition: out, modelCallsEnabled: true, scheduleEnabled: false, error: null } : out);
    }
    return send({}, 404);
  });
  return { api, fail: (value: boolean) => failed = value, posts: () => posts, requests, identityReads: () => identityReads,
    signIn: (value: boolean) => signedIn = value, respond: (status: number) => postStatus = status,
    change: (date: string, value: Partial<IdeasEdition>) => changes.set(date, { ...changes.get(date), ...value }),
    complete: (date: string) => changes.set(date, { ...edition, date, status: "ready" }) };
}

for (const [name, engine, width] of [["desktop", chromium, 1440], ["phone", chromium, 390], ["narrow-webkit", webkit, 320]] as const) {
  test(`AI ideas ${name}: dated empty state, history, evidence and validation stay usable`, async () => {
    const f = fixture(), web = await startWebServer(f.api), browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(web.origin + "/ideas");
      await expect(page.getByRole("heading", { name: "这一天还没有可用新闻" })).toBeVisible();
      await expect(page.getByRole("button", { name: "AI 生成创意", exact: true })).toBeDisabled();
      await page.getByRole("link", { name: "查看最近一期 · 2026-01-06" }).click();
      await expect(page.getByRole("heading", { name: "把进货单变成可复核的表格" })).toBeVisible();
      await expect(page.getByRole("button", { name: "AI 更新创意", exact: true })).toBeEnabled();
      await expect(page.getByLabel("新闻日期", { exact: true })).toHaveValue("2026-01-06");
      await expect(page.getByText("继续的信号", { exact: true })).not.toBeVisible();
      await expect(page.getByRole("heading", { name: "创意集市", exact: true })).toBeVisible();
      await expect(page.getByText("新闻显示抽取工具新增了批处理功能。", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "抽取工具支持批处理 ↗", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "抽取工具支持批处理 ↗", exact: true })).toHaveAttribute("href", "https://example.org/news");
      const summary = page.locator("summary").filter({ hasText: "验证方案与新闻依据" });
      await summary.focus(); await page.keyboard.press("Enter");
      await expect(page.getByText("继续的信号", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "抽取工具支持批处理", exact: true })).toHaveAttribute("href", "/items/fixture-news");
      await expect(page.getByRole("link", { name: "阅读原文 ↗" })).toHaveAttribute("href", "https://example.org/news");
      await expect(page.locator(".idea-source-meta")).toBeVisible();
      await expect(page.locator(".idea-source-meta")).toContainText("测试新闻 · 2026-01-06");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole("link", { name: "回到今天", exact: true }).click();
      await expect(page.getByRole("heading", { name: "这一天还没有可用新闻" })).toBeVisible();
      await page.getByLabel("新闻日期", { exact: true }).fill("2026-01-06");
      await page.getByRole("button", { name: "查看", exact: true }).click();
      await expect(page.getByRole("heading", { name: "把进货单变成可复核的表格" })).toBeVisible();
      assert.equal(f.posts(), 0); assert.equal(f.identityReads(), 0); assert.deepEqual(errors, []);
    } finally { await browser.close(); await web.stop(); }
  });
}

test("AI ideas errors recover, invalid dates are explained, and admin queues with CSRF feedback", async () => {
  const f = fixture(), web = await startWebServer(f.api), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    f.fail(true); await page.goto(web.origin + "/ideas");
    await expect(page.getByRole("heading", { name: "创意集市暂时无法加载" })).toBeVisible();
    f.fail(false); await page.getByRole("button", { name: "重新加载", exact: true }).click();
    await expect(page.getByRole("heading", { name: "这一天还没有可用新闻" })).toBeVisible();
    await page.goto(web.origin + "/ideas?date=bad-date"); await expect(page.getByRole("heading", { name: "这个日期不可用" })).toBeVisible();
    await page.goto(web.origin + "/admin/ideas?date=2026-01-06");
    await page.getByLabel("生成理由", { exact: true }).fill("验证后台生成流程");
    await page.getByRole("button", { name: "按当前资料重新生成", exact: true }).click();
    await expect(page.getByText("任务已排队，worker 处理后会显示结果。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "按当前资料重新生成", exact: true })).toBeDisabled();
    assert.equal(f.posts(), 1);
  } finally { await browser.close(); await web.stop(); }
});

for (const [name, engine, width] of [["desktop", chromium, 1440], ["phone", chromium, 390], ["narrow-webkit", webkit, 320]] as const) {
  test(`AI ideas ${name}: public button queues once and refreshes the generated edition`, async () => {
    const f = fixture(); f.change("2026-01-07", { currentSourceCount: 2 });
    const web = await startWebServer(f.api), browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(web.origin + "/ideas");
      await expect(page.getByRole("heading", { name: "有新闻了，生成几个新创意吧" })).toBeVisible();
      const button = page.getByRole("button", { name: "AI 生成创意", exact: true });
      await expect(button).toBeEnabled();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(f.identityReads(), 0); assert.equal(f.posts(), 0);
      // Two immediate clicks exercise the synchronous guard before React commits disabled state.
      await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
      await expect(page.getByRole("button", { name: "正在生成…", exact: true })).toBeDisabled();
      await expect(page.getByText("任务已提交，正在等待 AI 生成；完成后本页会自动更新。", { exact: true })).toBeVisible();
      assert.equal(f.posts(), 1); assert.equal(f.requests[0]?.date, "2026-01-07");
      f.complete("2026-01-07");
      await expect(page.getByRole("heading", { name: "把进货单变成可复核的表格" })).toBeVisible({ timeout: 12000 });
      await expect(page.getByRole("button", { name: "AI 更新创意", exact: true })).toBeEnabled();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(f.posts(), 1); assert.deepEqual(errors, []);
    } finally { await browser.close(); await web.stop(); }
  });
}

test("AI ideas public generation requires sign-in and returns to the selected date without posting", async () => {
  const f = fixture(); f.signIn(false);
  const web = await startWebServer(f.api), browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(web.origin + "/ideas?date=2026-01-06");
    await page.getByRole("button", { name: "AI 更新创意", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/admin/login");
    const returnTo = new URL(page.url()).searchParams.get("return");
    assert.equal(returnTo, "/admin/ideas?date=2026-01-06&from=public");
    assert.equal(f.posts(), 0);
    f.signIn(true);
    await page.goto(web.origin + returnTo);
    await page.waitForURL(web.origin + "/ideas?date=2026-01-06");
    await expect(page.getByRole("heading", { name: "把进货单变成可复核的表格" })).toBeVisible();
    assert.equal(f.posts(), 0);
    await page.getByRole("button", { name: "AI 更新创意", exact: true }).click();
    await expect(page.getByRole("button", { name: "正在生成…", exact: true })).toBeDisabled();
    assert.equal(f.posts(), 1); assert.equal(f.requests[0]?.date, "2026-01-06");
  } finally { await browser.close(); await web.stop(); }
});

test("AI ideas public generation explains disabled models, submission failures and failed jobs, then retries", async () => {
  const f = fixture(); f.change("2026-01-07", { currentSourceCount: 2 });
  const web = await startWebServer(f.api), browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(web.origin + "/ideas");
    f.respond(409);
    await page.getByRole("button", { name: "AI 生成创意", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("模型服务尚未开启，请在后台配置后重试。");
    f.respond(503);
    await page.getByRole("button", { name: "AI 生成创意", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("生成任务未能提交，请稍后重试。");
    f.respond(202);
    await page.getByRole("button", { name: "AI 生成创意", exact: true }).click();
    await expect(page.getByRole("button", { name: "正在生成…", exact: true })).toBeDisabled();
    f.change("2026-01-07", { status: "failed" });
    await expect(page.getByRole("heading", { name: "这一期暂未生成完成" })).toBeVisible({ timeout: 12000 });
    await page.getByRole("button", { name: "AI 生成创意", exact: true }).click();
    await expect(page.getByRole("button", { name: "正在生成…", exact: true })).toBeDisabled();
    assert.equal(f.posts(), 4);
    // A new date must discard the previous edition's busy/error state and stop its polling.
    await page.getByRole("link", { name: "查看最近一期 · 2026-01-06", exact: true }).click();
    await expect(page.getByRole("button", { name: "AI 更新创意", exact: true })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally { await browser.close(); await web.stop(); }
});
