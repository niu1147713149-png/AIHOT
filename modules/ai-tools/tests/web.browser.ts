// Run after the web production build: node --test modules/ai-tools/tests/web.browser.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "../../../apps/web/tests/web-server.ts";
import { event, leaderboard, resets } from "./fixtures.ts";

let web: WebServer, browser: Browser;
const resetData = resets([event(), { ...event("inferred"), status: "announced", confirmedAt: null,
  presentation: { ...event().presentation, status: "likely_completed" } }]);
resetData.activities = [{ ...event().posts[0], text: `https://example.org/${"long-link".repeat(30)}`,
  eventIds: [], kind: "discussion", statusChanged: false, action: null }];
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/site/meta") return res.end('{"changelogVersion":"fixture"}');
  if (req.url === "/api/site/track") { res.statusCode = 204; return res.end(); }
  if (req.url === "/api/site/ai-tools/leaderboard" || req.url === "/api/site/ai-tools/codex-reset") {
    const now = new Date().toISOString();
    return res.end(JSON.stringify({ data: req.url.endsWith("leaderboard") ? leaderboard() : resetData,
      sourceUrl: "https://example.org/reference", checkedAt: now, changedAt: now, lastAttemptAt: now,
      nextFetchAt: now, error: null, historyCheckedAt: now, historyError: null }));
  }
  res.statusCode = 404; res.end('{}');
});
before(async () => {
  const started = await Promise.allSettled([
    startWebServer(api, { NODE_ENV: "production" }).then(w => { web = w; }),
    chromium.launch({ channel: "chromium" }).then(b => { browser = b; }),
  ]);
  for (const result of started) if (result.status === "rejected") throw result.reason;
});
after(async () => { await browser?.close(); await web?.stop(); });

test("a direct cost-chart visit includes server tooltips and hydrates without replacing the page", async () => {
  const context = await browser.newContext(), page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    const response = await page.goto(`${web.origin}/leaderboard?view=cost`);
    assert.match(await response!.text(), /<title>Sample Model · ¥1\.55 · 65 分<\/title>/);
    await page.getByRole("button", { name: "榜单", exact: true }).click();
    await expect(page.getByRole("region", { name: "性价比比较" })).toBeHidden();
    await page.getByRole("button", { name: "斩杀线", exact: true }).click();
    await expect(page.getByRole("region", { name: "性价比比较" })).toBeVisible();
    await page.getByRole("button", { name: "自定义场景", exact: true }).click();
    await page.getByRole("slider", { name: "缓存命中率" }).fill("80");
    await expect(page.getByText("缓存命中率 80%", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /模型评分与场景成本/ }).locator("title")).toHaveText("Sample Model · ¥2.8 · 65 分");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("mobile tools keep search usable, wrap raw links and distinguish inferred historical resets", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    await page.goto(`${web.origin}/leaderboard`);
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    const search = page.getByRole("textbox", { name: "搜索模型" });
    assert.ok((await search.boundingBox())!.width > 300);
    await page.getByRole("button", { name: "查看结果", exact: true }).click();
    await page.getByRole("navigation", { name: "AI 工具" }).getByRole("link", { name: "Tibo 重置监控", exact: true }).click();
    await expect(page.getByText("当前没有等待生效的重置", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "最近记录", exact: true }).click();
    await expect(page.getByText("来源推断完成 · 未确认", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate<number>("document.documentElement.scrollWidth - innerWidth")).toBe(0);
    await page.getByRole("button", { name: "查看英文", exact: true }).click();
    await expect(page.getByRole("button", { name: "查看中文", exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test("filters preserve source ranks, chart icons open details, and calendar dates can be changed with the keyboard", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
  try {
    await page.goto(`${web.origin}/leaderboard`);
    await page.getByRole("button", { name: "国产模型", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    assert.match(await page.locator("tbody").innerText(), /31/);
    await page.getByRole("button", { name: "名次", exact: true }).click();
    await expect(page.locator("tbody tr").first()).toHaveAttribute("data-slug", "extra");
    await page.getByRole("button", { name: "斩杀线", exact: true }).click();
    await page.getByRole("button", { name: /Sample Model，第 1 名/ }).click();
    const detail = page.getByRole("region", { name: "模型价格详情" });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("link", { name: "查看模型详情 →" })).toHaveAttribute("href", "/leaderboard/sample");
    await page.keyboard.press("Escape");
    await expect(detail).toBeHidden();
    await page.goto(`${web.origin}/codex-reset/history/2026-10-14`);
    const day = page.locator('[data-day="2026-10-14"]');
    await day.focus(); await day.press("ArrowLeft");
    await expect(page).toHaveURL(/\/history\/2026-10-13$/);
    await expect(page.locator('[data-day="2026-10-13"]')).toBeFocused();
    await expect(page.getByRole("region", { name: "当天记录" }).getByText("这一天没有记录", { exact: true })).toBeVisible();
  } finally { await context.close(); }
});
