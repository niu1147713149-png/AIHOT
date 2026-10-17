import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { startWebServer } from "./web-server.ts";

const zh = '<h2 id="sec-1">应用机会</h2><p>这项工具每天节省两小时。</p>';
const original = '<h2 id="sec-1">Application opportunities</h2><p>This tool saves two hours every day.</p>';
const bilingual = '<div class="bilingual-pair"><div class="bilingual-zh" lang="zh-Hans"><h2 id="sec-1">应用机会</h2></div><div class="bilingual-original"><p class="bilingual-heading">Application opportunities</p></div></div>'
  + '<div class="bilingual-pair"><div class="bilingual-zh" lang="zh-Hans"><p>这项工具每天节省两小时。</p></div><div class="bilingual-original"><p>This tool saves two hours every day.</p></div></div>';
const at = "2026-10-14T08:00:00Z";
for (const [name, engine, viewport] of [
  ["desktop", chromium, { width: 1440, height: 900 }],
  ["phone", chromium, { width: 390, height: 844 }],
  ["WebKit phone", webkit, { width: 390, height: 844 }],
] as const) test(`${name}: articles default to parallel reading and retain Chinese/original views`, async () => {
  const api = createServer((req, res) => {
    const url = new URL(req.url!, "http://local");
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "fixture" }));
    if (url.pathname === "/api/site/track") { res.statusCode = 204; return res.end(); }
    if (url.pathname.startsWith("/api/site/items/")) {
      const missing = url.pathname.includes("missing");
      const language = missing || url.pathname.endsWith("/original") ? "original" : url.searchParams.get("language") === "bilingual" ? "bilingual" : "zh";
      const item: SiteItemDetail = {
        id: missing ? "missing" : "bilingual", title: "双语阅读测试", summary: "可核实的应用信息", reason: null, source: { name: "Fixture" },
        publishedAt: at, timelineAt: at, discoveredAt: at, category: null, tags: [], score: null, selected: false,
        channel: "news", x: null, originalTitle: "Bilingual reading test", links: { original: "https://example.org/article" },
        story: null, readingMode: "full", author: null, outline: [{ id: "sec-1", text: "应用机会", level: 2 }], relatedStories: [], topics: [], indexable: false,
        markdownAvailable: false, group: null, hasTranslation: !missing, bodyLanguage: language,
        body: { zh: language === "zh" ? zh : null, original: language === "original" ? original : null,
          ...(language === "bilingual" ? { bilingual } : {}), zhKind: missing ? null : "translation", complete: !missing },
      };
      return res.end(JSON.stringify(item));
    }
    res.statusCode = 404; res.end("{}");
  });
  const web = await startWebServer(api);
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const response = await page.goto(web.origin + "/items/bilingual");
    assert.match(await response!.text(), /bilingual-pair/, "parallel text is server-rendered");
    await expect(page.locator(".bilingual-zh").last()).toContainText("每天节省两小时");
    await expect(page.locator(".bilingual-original").last()).toContainText("saves two hours");
    assert.equal(await page.locator("#sec-1").count(), 1);
    const tabs = page.getByRole("navigation", { name: "正文语言" });
    await tabs.getByRole("link", { name: "中文", exact: true }).click();
    await expect(page.locator(".prose")).toContainText("每天节省两小时");
    await expect(page.locator(".prose")).not.toContainText("saves two hours");
    await tabs.getByRole("link", { name: "原文", exact: true }).click();
    await expect(page.locator(".prose")).toContainText("saves two hours");
    await expect(page.locator(".prose")).not.toContainText("每天节省两小时");
    await tabs.getByRole("link", { name: "中英对照", exact: true }).click();
    await expect(page.locator(".bilingual-pair")).toHaveCount(2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "reading controls must fit on a phone");
    await page.goto(web.origin + "/items/missing");
    await expect(page.getByText("暂未提供中文译文，当前显示原文。")).toBeVisible();
    await expect(page.locator(".prose")).toContainText("saves two hours");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await web.stop();
  }
});
