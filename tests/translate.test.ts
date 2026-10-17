// Full-text translations follow the text: an article corrected while the model was translating the old
// wording is translated again, and a translation of an older revision is never shown as the current one.
// Links and images inside a paragraph survive the model, and the post an X item quotes is translated.
import { gate, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { translateArticle, translatePending } from "@aihot/backend/editorial/translate";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-translate-${T}`;
const URL_ = `https://example.com/translate-${T}`;

// The model: one Chinese sentence per segment. `hold` keeps an answer back while the test revises the text.
let hold: ReturnType<typeof gate<void>> | null = null;
const asked = gate();
const asks = new Map<string, number>();
const seenSegments: string[] = [];
const provider = await stub(async (_hit, req) => {
  const { segments } = JSON.parse(JSON.parse(req.body).messages[1].content) as { segments: string[] };
  seenSegments.push(...segments);
  if (hold) {
    asked.open();
    await hold.promise;
  }
  const t = segments.map((s) => {
    if (s.includes("MIXED-CONTENT")) return "混合内容译文" + (s.match(/⟦\d+⟧/g) ?? []).join("")
      + [...s.matchAll(/<a id="(L\d+)"/g)].map((m) => `<a id="${m[1]}">链接</a>`).join("");
    // A block with a link and an image: the first answer drops the link, the second keeps everything.
    if (s.includes("Neuroglancer")) {
      const n = (asks.get(s) ?? 0) + 1;
      asks.set(s, n);
      return n === 1 ? "解释 Neuroglancer 的文字 ⟦0⟧。" : '解释 <a id="L0">Neuroglancer</a> 的文字 ⟦0⟧。';
    }
    if (s.includes("never keeps")) return "丢了链接。";
    if (s.includes("Introducing")) return "隆重推出 Sonnet 5.5。";
    return s.includes("twenty") ? "价格是二十美元。" : s.includes("ten") ? "价格是十美元。" : "译文";
  });
  return { id: "stub", choices: [{ message: { content: JSON.stringify({ t }) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
const app = await buildApp();

// Discovered "later" than anything else in the test database, so a one-item run takes this article. The
// tag keeps the text unique: identical input would reuse an earlier run's paid answer.
const material = (price: string) =>
  upsertMaterial({
    sourceId: SOURCE, url: URL_, title: `Price update ${T}`, language: "en", bodyText: `The price is ${price} dollars (${T}).`,
    bodyHtml: `<p>The price is ${price} dollars (${T}).</p>`, bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 600_000),
  });

async function detail(id: string) {
  const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body) as { body: { zh: string | null; original: string | null; complete: boolean } };
}

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${SOURCE}, 'Test translate', 'rss', 'T1', 'editorial', true, false, '2100-01-01')`;
});
after(async () => {
  await app.close();
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("a text corrected while its translation was running is translated again, and the old translation is not shown", async () => {
  const { articleId: id } = await material("ten");
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'ai-models', ${`价格更新-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });

  // The model is asked about revision 1; the source corrects the price before it answers.
  hold = gate();
  const running = translatePending({ limit: 1 });
  await Promise.race([asked.promise, running.then(() => assert.fail("the run ended without asking the model"))]);
  const revised = await material("twenty");
  assert.equal(revised.revised, true);
  hold.open();
  hold = null;
  await running;

  const [attempt] = await sql<{ revision: number; outcome: string }[]>`SELECT revision, outcome FROM translation_attempts WHERE article_id = ${id}`;
  assert.deepEqual({ ...attempt }, { revision: 1, outcome: "translated" }, "the attempt is booked on the revision translated");
  const stale = await detail(id);
  assert.equal(stale.body.zh, null, "a translation of the old wording is not shown");
  assert.ok(stale.body.original?.includes("twenty"));

  // The corrected material waits for its own analysis and identity decision before another paid
  // translation. Install that completed current-revision fixture, as the processing chain does.
  assert.equal((await sql`SELECT selected FROM publications WHERE article_id=${id}`)[0]!.selected, false);
  await sql`UPDATE analyses SET input_revision=2 WHERE article_id=${id}`;
  await sql`UPDATE articles SET processing_state='analyzed',grouping_status='complete',grouped_at=now() WHERE id=${id}`;
  await publishArticle(id);
  await translatePending({ limit: 1 });
  const [tr] = await sql<{ revision: number }[]>`SELECT revision FROM translations WHERE article_id = ${id}`;
  assert.equal(tr?.revision, 2, "the corrected text is translated on the next run");
  const current = await detail(id);
  assert.ok(current.body.zh?.includes("二十美元") && current.body.complete, "the page shows the translation of the corrected text");
});

test("links and images inside a paragraph survive the translation, or the paragraph stays in the original", async () => {
  // Google's fly-brain post lost its link to the Neuroglancer docs; a GPU price post lost two charts.
  const html = `<p>Explaining <a href="https://neuroglancer.dev/docs">Neuroglancer</a> in text ${T} <img src="https://example.com/chart-${T}.png" alt="B200 prices"></p>` +
    `<p>A paragraph the model <a href="https://example.com/kept">never keeps</a> whole ${T}.</p>`;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `${URL_}-links`, title: `Links ${T}`, language: "en", bodyText: `Explaining Neuroglancer. ${T}`, bodyHtml: html,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 1_200_000),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'ai-models', ${`链接-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  await translatePending({ limit: 1 });
  const [tr] = await sql<{ body_html: string; complete: boolean }[]>`SELECT body_html, complete FROM translations WHERE article_id = ${id}`;
  assert.ok(tr!.body_html.includes('<a href="https://neuroglancer.dev/docs">Neuroglancer</a>'), tr!.body_html);
  assert.ok(tr!.body_html.includes(`chart-${T}.png`), "the chart stays");
  assert.ok(tr!.body_html.includes('<a href="https://example.com/kept">never keeps</a>'), "a paragraph that loses its link stays in the original");
  assert.equal(tr!.complete, false);
  const receipts = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject LIKE ${`article:${id}@1#%`}`;
  assert.ok(receipts.length >= 2, "the initial batch and fallback/retry batches are retained");
  assert.ok(receipts.every((receipt) => receipt.status === "completed"), "every paid batch covered by the committed translation is completed");
});

test("translation storage and receipt completion commit together, then reuse the saved answer", async () => {
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `${URL_}-receipt`, title: `Receipt ${T}`, language: "en",
    bodyText: `Receipt lifecycle ${T}.`, bodyHtml: `<p>Receipt lifecycle ${T}.</p>`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 1_500_000),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'ai-models', ${`回执-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });

  await sql.unsafe(`CREATE FUNCTION fail_translation_receipt() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
    IF NEW.status = 'completed' AND NEW.purpose = 'translate_body' THEN RAISE EXCEPTION 'receipt commit interrupted'; END IF;
    RETURN NEW; END $body$`);
  await sql`CREATE TRIGGER fail_translation_receipt BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION fail_translation_receipt()`;
  const before = provider.hits();
  try {
    await assert.rejects(translateArticle(id), /receipt commit interrupted/);
  } finally {
    await sql`DROP TRIGGER fail_translation_receipt ON receipts`;
    await sql`DROP FUNCTION fail_translation_receipt()`;
  }
  assert.equal(provider.hits(), before + 1);
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id}`).length, 0, "translation write rolls back with receipt completion");
  const [received] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject = ${`article:${id}@1#0`}`;
  assert.equal(received!.status, "received");

  const retried = await translateArticle(id);
  assert.equal(retried.status, "translated");
  assert.equal(provider.hits(), before + 1, "retry reuses the already received provider answer");
  const [completed] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject = ${`article:${id}@1#0`}`;
  assert.equal(completed!.status, "completed");
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id}`).length, 1);
});

test("the post a selected X post quotes is translated once and shown with the item", async () => {
  const tweetId = `7${Date.now()}`;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `https://x.com/bcherny/status/8${Date.now()}`, title: `Sonnet ${T}`, language: "en", bodyText: "Try it!", bodyStatus: "ok",
    via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 1_800_000),
    xPost: { tweetId: `8${Date.now()}`, authorName: "Boris", handle: "bcherny", text: "Try it!", quoted: { authorName: "Anthropic", handle: "AnthropicAI", text: `Introducing Claude Sonnet 5.5 ${T}`, url: `https://x.com/AnthropicAI/status/${tweetId}` } },
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'ai-models', ${`引用-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  const run = await translatePending({ limit: 1 });
  assert.ok(run.quotes >= 1);
  const [q] = await sql<{ text_zh: string; origin: string }[]>`SELECT text_zh, origin FROM quote_translations WHERE tweet_id = ${tweetId}`;
  assert.deepEqual({ ...q }, { text_zh: "隆重推出 Sonnet 5.5。", origin: "model" });
  const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
  const item = JSON.parse(res.body) as { x: { quoted: { text: string; translation: string | null } } };
  assert.deepEqual([item.x.quoted.text, item.x.quoted.translation], [`Introducing Claude Sonnet 5.5 ${T}`, "隆重推出 Sonnet 5.5。"]);
  await translatePending({ limit: 1 });
  const receipts = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_quoted' AND subject = ${`quote:${tweetId}`}`;
  assert.equal(receipts.length, 1, "translated once");
  assert.equal(receipts[0]!.status, "completed");
});

test("historical non-selected full-text items are translated, while summary-only and withdrawn items are not", async () => {
  const ids: string[] = [];
  for (const visibility of ["public", "summary-only", "withdrawn"]) {
    const { articleId: id } = await upsertMaterial({ sourceId: SOURCE, url: `${URL_}-old-${visibility}`, title: `Archive ${T}`, language: "en",
      bodyText: `Historical English article ${T}.`, bodyHtml: `<p>Historical English article ${T}.</p>`, bodyStatus: "ok", via: "fetch",
      discoveredAt: new Date("2020-01-01"), publishedAt: new Date("2020-01-01") });
    await publishArticle(id);
    await sql`UPDATE publications SET visibility=${visibility}, selected=false WHERE article_id=${id}`;
    ids.push(id);
  }
  const run = await translatePending({ limit: 100, concurrency: 2 });
  assert.ok(run.done.some(r => r.articleId === ids[0] && r.status === "translated"));
  assert.equal((await sql`SELECT count(*) AS n FROM translations WHERE article_id IN ${sql(ids.slice(1))}`)[0]!.n, 0);
  assert.equal((await translateArticle(ids[1]!)).status, "skipped");
  assert.equal((await translateArticle(ids[2]!)).status, "skipped");
});

test("a partial long translation resumes beyond the old 60K cap and includes the final paragraph", async () => {
  const paragraph = `Long English paragraph ${T} ${"full text ".repeat(220)}.`;
  const html = Array.from({ length: 30 }, (_, i) => `<p>${paragraph} Paragraph ${i}.</p>`).join("");
  assert.ok(html.length > 60000);
  const { articleId: id } = await upsertMaterial({ sourceId: SOURCE, url: `${URL_}-long`, title: `Long article ${T}`, language: "en",
    bodyHtml: html, bodyText: paragraph.repeat(30), bodyStatus: "ok", via: "fetch", discoveredAt: new Date(), publishedAt: new Date() });
  await publishArticle(id);
  await sql`INSERT INTO translations (article_id,lang,revision,body_html,body_text,complete,origin) VALUES (${id},'zh',1,${html},'部分译文',false,'model')`;
  await sql`INSERT INTO translation_attempts (article_id,revision,attempts,outcome) VALUES (${id},1,1,'partial')`;
  const run = await translatePending({ limit: 100 });
  assert.ok(run.done.some(r => r.articleId === id && r.status === "translated"));
  const [tr] = await sql`SELECT body_html,complete FROM translations WHERE article_id=${id}`;
  assert.equal(tr!.complete, true);
  assert.equal((tr!.body_html.match(/<p>译文<\/p>/g) ?? []).length, 30);
  const calls = provider.hits();
  await translatePending({ limit: 100 });
  assert.equal(provider.hits(), calls, "complete translations are not charged again");
});

test("instructions around nested code and lists and non-Latin paragraphs are all translated", async () => {
  const html = '<ol><li>MIXED-CONTENT install <a href="https://example.com/sdk">the SDK</a> using <code>setup.py</code>.'
    + '<pre><code>print("English code stays")</code></pre>MIXED-CONTENT restart the server.'
    + '<ul><li>MIXED-CONTENT nested instructions.</li></ul>MIXED-CONTENT final step.</li></ol>'
    + '<p>ندعم أيضاً الطوابع الزمنية على مستوى الكلمات في عمليات التفريغ النصي.</p>';
  const { articleId: id } = await upsertMaterial({ sourceId: SOURCE, url: `${URL_}-mixed`, title: `Mixed ${T}`, language: "en",
    bodyHtml: html, bodyText: "English instructions and Arabic paragraphs.", bodyStatus: "ok", via: "fetch" });
  await publishArticle(id);
  const result = await translateArticle(id);
  assert.equal(result.status, "translated");
  const [tr] = await sql`SELECT body_html FROM translations WHERE article_id=${id}`;
  assert.equal((tr!.body_html.match(/混合内容译文/g) ?? []).length, 4);
  assert.ok(tr!.body_html.includes('print("English code stays")'));
  assert.ok(tr!.body_html.includes('href="https://example.com/sdk"'));
  assert.ok(tr!.body_html.includes("setup.py"));
  assert.ok(tr!.body_html.includes("<p>译文</p>"));
  assert.ok(!tr!.body_html.includes("ندعم"));
});

test("repairing skipped inline instructions preserves existing Chinese and requests only missing text", async () => {
  const html = '<p>Already translated paragraph.</p><ol><li>MIXED-CONTENT start the app.<pre><code>npm start</code></pre></li></ol>';
  const { articleId: id } = await upsertMaterial({ sourceId: SOURCE, url: `${URL_}-repair`, title: `Repair ${T}`, language: "en",
    bodyHtml: html, bodyText: "Already translated paragraph. Start the app.", bodyStatus: "ok", via: "fetch" });
  await publishArticle(id);
  const held = html.replace('Already translated paragraph.', '这段中文已经翻译过，必须保留。');
  await sql`INSERT INTO translations (article_id,lang,revision,body_html,body_text,complete,origin)
    VALUES (${id},'zh',1,${held},'已有中文',true,'model')`;
  const before = seenSegments.length;
  assert.equal((await translateArticle(id, { untranslatedOnly: true })).status, "translated");
  const asked = seenSegments.slice(before);
  assert.ok(asked.length > 0);
  assert.ok(asked.every(s => !s.includes('这段中文') && !s.includes('Already translated paragraph')));
  const [tr] = await sql`SELECT body_html,complete FROM translations WHERE article_id=${id}`;
  assert.ok(tr!.body_html.includes('这段中文已经翻译过，必须保留。'));
  assert.ok(tr!.body_html.includes('混合内容译文'));
  assert.ok(tr!.body_html.includes('<code>npm start</code>'));
  assert.equal(tr!.complete, true);
});
