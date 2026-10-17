import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import type { IdeasEdition } from "@aihot/contracts/ideas";
import { startWebServer } from "./web-server.ts";

function fixture() {
  let failed = false, queued = false, posts = 0;
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
    if (path === "/api/admin/me") return send({ name: "Fixture admin", csrf: "fixture-csrf", dev: false });
    if (path === "/api/admin/nav-counts") return send({});
    if (path === "/api/admin/ideas/generate" && req.method === "POST") {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (req.headers["x-csrf-token"] !== "fixture-csrf") return send({}, 403);
      assert.equal(body.date, "2026-01-06"); assert.ok(body.reason.length >= 2);
      queued = true; posts++; return send({ queued: true, date: body.date }, 202);
    }
    if (path === "/api/site/ideas" || path === "/api/admin/ideas") {
      if (failed) return send({}, 503);
      const date = url.searchParams.get("date") ?? "2026-01-07";
      if (date === "bad-date") return send({}, 400);
      const out = date === edition.date ? { ...edition, status: queued ? "queued" : "ready" } : { ...edition, date, status: "missing", ideas: [], generatedAt: null, sourceCount: 0, currentSourceCount: 0 };
      return send(path.startsWith("/api/admin/") ? { edition: out, modelCallsEnabled: true, scheduleEnabled: false, error: null } : out);
    }
    return send({}, 404);
  });
  return { api, fail: (value: boolean) => failed = value, posts: () => posts };
}

for (const [name, engine, width] of [["desktop", chromium, 1440], ["phone", chromium, 390], ["narrow-webkit", webkit, 320]] as const) {
  test(`AI ideas ${name}: dated empty state, history, evidence and validation stay usable`, async () => {
    const f = fixture(), web = await startWebServer(f.api), browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(web.origin + "/ideas");
      await expect(page.getByRole("heading", { name: "这一天还没有可用新闻" })).toBeVisible();
      await page.getByRole("link", { name: "查看最近一期 · 2026-01-06" }).click();
      await expect(page.getByRole("heading", { name: "把进货单变成可复核的表格" })).toBeVisible();
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
      assert.equal(f.posts(), 0); assert.deepEqual(errors, []);
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
