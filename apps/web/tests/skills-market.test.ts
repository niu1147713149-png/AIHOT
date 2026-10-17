import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import type { AdminSkill, SkillEntry, SkillImport } from "@aihot/contracts/skills";
import { startWebServer } from "./web-server.ts";

const seed = JSON.parse(readFileSync(new URL("../../../modules/skills-market/data/seed.json", import.meta.url), "utf8")) as SkillImport[];

function fixtureApi() {
  const items: AdminSkill[] = seed.map((s, i) => ({ id: `fixture-${i}`, repo: s.repo, path: s.path, data: s.data as AdminSkill["data"], metric: s.metric as AdminSkill["metric"],
    status: "published", revision: 1, createdAt: "2026-10-15T09:00:00Z", updatedAt: "2026-10-15T09:00:00Z" }));
  const entry = (s: AdminSkill): SkillEntry => ({ ...s, repository: { stars: 1234, pushedAt: s.updatedAt, archived: false }, repositoryCheckedAt: s.updatedAt, repositoryRefreshFailed: false });
  const api = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://fixture"), p = url.pathname;
    res.setHeader("content-type", "application/json");
    const send = (data: unknown, code = 200) => { res.statusCode = code; res.end(JSON.stringify(data)); };
    if (p === "/api/site/meta") return send({ changelogVersion: "fixture" });
    if (p === "/api/site/track") return send({}, 204);
    if (p === "/api/admin/me") return send({ name: "Fixture admin", csrf: "fixture-csrf", dev: false });
    if (p === "/api/admin/nav-counts") return send({});
    if (p === "/api/admin/skills/seed") return send(seed);
    if (p === "/api/admin/skills" && req.method === "GET") return send({ items });
    if (p === "/api/site/skills") {
      const q = url.searchParams.get("q") ?? "", category = url.searchParams.get("category"), sort = url.searchParams.get("sort");
      if (q === "server-error") return send({}, 503);
      const filtered = q === "empty-catalog" ? [] : items.filter(s => s.status === "published" && (!category || s.data.category === category)
        && (sort !== "featured" || s.data.recommendation) && `${s.data.title} ${s.data.name} ${s.data.summary}`.toLowerCase().includes(q.toLowerCase()));
      const page = Number(url.searchParams.get("page") ?? 1);
      return send({ items: filtered.slice((page - 1) * 12, page * 12).map(entry), total: filtered.length, page, pageSize: 12, snapshotAt: "2026-10-15T09:00:00Z" });
    }
    const detail = p.match(/^\/api\/(site|admin)\/skills\/(fixture-\d+)$/);
    if (detail && req.method === "GET") {
      const item = items.find(s => s.id === detail[2]);
      return item && (detail[1] === "admin" || item.status === "published") ? send(detail[1] === "admin" ? item : entry(item)) : send({}, 404);
    }
    if (req.method === "POST" || req.method === "PATCH") {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (req.headers["x-csrf-token"] !== "fixture-csrf") return send({ detail: "CSRF missing" }, 403);
      if (p === "/api/admin/skills/preview") return send({ digest: "a".repeat(64), added: 1, skipped: body.length - 1,
        rows: body.map((s: typeof seed[number], i: number) => ({ id: `preview-${i}`, name: s.data.name, repo: s.repo, path: s.path, duplicate: i > 0 })) });
      if (p === "/api/admin/skills/import") return send({ added: 1, skipped: body.entries.length - 1 });
      if (detail && req.method === "PATCH") {
        const item = items.find(s => s.id === detail[2])!;
        if (item.revision !== body.revision) return send({ detail: "版本冲突" }, 409);
        Object.assign(item, { data: body.data, metric: body.metric, status: body.status, revision: item.revision + 1 });
        return send(item);
      }
    }
    return send({}, 404);
  });
  return { api, items };
}

for (const [name, engine, viewport] of [
  ["desktop", chromium, { width: 1440, height: 1000 }],
  ["phone", chromium, { width: 390, height: 844 }],
  ["WebKit phone", webkit, { width: 390, height: 844 }],
] as const) test(`${name}: Skills search, filters, pagination, installation and return navigation`, async () => {
  const web = await startWebServer(fixtureApi().api), browser = await engine.launch();
  try {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
    const page = await context.newPage(), errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const res = await page.goto(web.origin + "/skills"); assert.match(await res!.text(), /React 性能优化/);
    await expect(page.locator(".sm-card")).toHaveCount(12);
    await page.getByRole("link", { name: "下一页", exact: true }).click(); await expect(page).toHaveURL(/page=2/);
    await page.getByRole("link", { name: "上一页", exact: true }).click();
    await page.getByRole("navigation", { name: "用途分类" }).getByRole("link", { name: "开发编程" }).click();
    await expect(page.locator(".sm-card")).toHaveCount(3);
    await page.locator(".sm-card").first().click();
    await expect(page.locator('[data-testid="install-command"]')).toContainText("--agent codex");
    await page.getByLabel("客户端", { exact: true }).selectOption("claude-code");
    await page.getByLabel("安装范围").selectOption("global");
    await expect(page.locator('[data-testid="install-command"]')).toContainText("--agent claude-code --global");
    await page.getByRole("button", { name: "复制安装命令" }).click();
    await expect(page.getByRole("status")).toContainText("已复制");
    assert.match(await page.evaluate(() => (window as unknown as { copied: string }).copied), /--skill vercel-react-best-practices --agent claude-code --global$/);
    await page.locator(".sm-back").click(); await expect(page).toHaveURL(/category=development/);
    await page.getByRole("navigation", { name: "用途分类" }).getByRole("link", { name: "全部用途" }).click();
    await expect(page.locator(".sm-card")).toHaveCount(12);
    await page.getByLabel("搜索 Skills", { exact: true }).fill("不存在的能力"); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("heading", { name: "没有找到匹配的 Skills" })).toBeVisible();
    await page.getByRole("link", { name: "查看全部 Skills" }).click();
    await page.getByLabel("排序方式").selectOption("featured"); await expect(page).toHaveURL(/sort=featured/);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(web.origin + "/skills/does-not-exist"); await expect(page.getByRole("heading", { name: "这个 Skill 暂不可用" })).toBeVisible();
    await page.goto(web.origin + "/skills?q=server-error"); await expect(page.getByRole("heading", { name: "Skills 暂时无法加载" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
    await page.goto(web.origin + "/more"); await expect(page.getByRole("link", { name: "Skills 市场", exact: true }).last()).toBeVisible();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await web.stop(); }
});

test("Skills admin previews imports, saves edits and confirms unsaved navigation", async () => {
  const { api, items } = fixtureApi(), web = await startWebServer(api), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(web.origin + "/admin/skills");
    await page.getByRole("button", { name: "加载首批清单" }).click();
    await expect(page.getByLabel("导入 JSON", { exact: true })).toContainText("vercel-react-best-practices");
    await page.getByRole("button", { name: "预览导入" }).click();
    await expect(page.getByRole("heading", { name: "预计新增 1 条，跳过 32 条重复记录" })).toBeVisible();
    await page.getByLabel("导入理由", { exact: true }).fill("首批清单浏览器验证");
    await page.getByRole("button", { name: "确认新增 1 条" }).click(); await expect(page.getByLabel("导入 JSON", { exact: true })).toHaveValue("");
    await page.getByRole("link", { name: "React 性能优化", exact: true }).click();
    await page.getByLabel("中文名称", { exact: true }).fill("未保存标题"); await page.getByRole("link", { name: "返回目录", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible(); await page.getByRole("button", { name: "继续编辑" }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await page.getByLabel("中文名称", { exact: true }).fill("React 客户项目优化");
    await page.getByLabel("发布状态", { exact: true }).selectOption("hidden"); await page.getByLabel("修改理由", { exact: true }).fill("下架并更新描述");
    assert.deepEqual(await page.locator("main form").evaluate(form => Array.from(form.querySelectorAll<HTMLInputElement>("input,textarea,select")).filter(e => !e.checkValidity()).map(e => ({ label: e.getAttribute("aria-label"), value: e.value, message: e.validationMessage }))), []);
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已保存 · 版本 2" })).toBeVisible();
    assert.equal(items[0].status, "hidden"); assert.equal(items[0].data.title, "React 客户项目优化");
    await page.goto(web.origin + "/skills/fixture-0"); await expect(page.getByRole("heading", { name: "这个 Skill 暂不可用" })).toBeVisible();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await web.stop(); }
});
