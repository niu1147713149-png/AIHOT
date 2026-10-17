// Full-text Chinese translations: made by the worker for all public full-text items,
// including older and non-selected articles; a page read never translates.
// Bodies are translated block by block (paragraphs, headings, list items, captions, table cells) so the
// sanitised structure stays as it is. Inside a block, images and inline code never reach the model
// (placeholders) and links keep only their text and an id; a block whose answer loses or repeats any of
// them is asked once more, then kept in the original. Each batch is a receipt, so a re-run reuses
// answers already paid for. A translation missing any block is stored as incomplete, never as whole.
// The post a public X post quotes is translated too (once per quoted post, shared by every quote).
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { z } from "zod";
import { sql } from "../db.ts";
import { sanitizeBody, textToHtml } from "../content/sanitize.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { isEmptyOrLinkOnly } from "../content/posts.ts";
import { sha256 } from "../lib/ids.ts";
import { modelFor } from "./models.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { emit } from "../modules.ts";

export const TRANSLATE_PROMPT_VERSION = promptVersion("translate-body", "translate-post");
const BATCH_CHARS = 3500;

const BLOCK = new Set(["p", "h2", "h3", "h4", "h5", "li", "blockquote", "figcaption", "td", "th", "dt", "dd", "caption"]);
const CONTAINER = /^(p|h[2-5]|li|blockquote|figcaption|td|th|dt|dd|caption|ul|ol|table|pre|figure|div)$/;

const Output = z.object({ t: z.array(z.string()) });

class TranslationInterruptedError extends Error {}

const SYSTEM_BODY = promptText("translate-body");

const SYSTEM_POST = promptText("translate-post");

export interface TranslateResult {
  articleId: string;
  status: "translated" | "partial" | "skipped";
  /** The article revision this result is about: the one read and translated, not a later one. */
  revision?: number;
  segments?: number;
  reason?: string;
}

const isChinese = (language: string | null, sample: string) => language === "zh" || (/[一-鿿]/.test(sample.slice(0, 400)) && language !== "en");

/** Leaf text blocks of a sanitised body, in document order, skipping code. */
function segmentsOf($: cheerio.CheerioAPI): Element[] {
  const out: Element[] = [];
  const hasText = (el: Element) => {
    const text = $(el).clone();
    text.find("pre,code").remove();
    return /\p{L}/u.test(text.text());
  };
  const visit = (nodes: AnyNode[]) => {
    for (const node of nodes) {
      if (node.type !== "tag") continue;
      const el = node as Element;
      if (el.name === "pre" || el.name === "code") continue;
      const hasBlockChild = el.children.some((c) => c.type === "tag" && CONTAINER.test((c as Element).name));
      if (BLOCK.has(el.name) && !hasBlockChild) {
        if (hasText(el)) out.push(el);
        continue;
      }
      if (BLOCK.has(el.name) && hasBlockChild) {
        // List items and table cells may have their own instructions before/after nested code or
        // lists. Visiting only child blocks silently skipped these inline runs.
        let inline: AnyNode[] = [];
        const flush = () => {
          if (!inline.length) return;
          $(inline).wrapAll("<span></span>");
          const wrapper = $(inline[0]!).parent();
          if (hasText(wrapper[0] as Element)) out.push(wrapper[0] as Element);
          inline = [];
        };
        for (const child of [...el.children]) {
          if (child.type === "tag" && CONTAINER.test(child.name)) { flush(); visit([child]); }
          else inline.push(child);
        }
        flush();
        continue;
      }
      visit(el.children);
    }
  };
  visit($.root().children().toArray());
  return out;
}

/** For maintenance audits: foreign text still present, with code and link-only text excluded.
 * Proper names may intentionally remain foreign; callers review them rather than assume a failure. */
export function foreignTextBlocks(html: string): Array<{ text: string; inlineRun: boolean }> {
  const $ = cheerio.load(html, null, false);
  return segmentsOf($).flatMap(el => {
    const node = $(el).clone();
    node.find("pre,code").remove();
    const text = collapseWhitespace(node.text());
    return !/[一-鿿]/.test(text) && !isEmptyOrLinkOnly(text) ? [{ text, inlineRun: el.name === "span" }] : [];
  });
}

interface BatchTranslation {
  translated: string[] | null;
  receiptId: number;
}

async function translateBatch(articleId: string, revision: number, index: number, parts: string[], system: string, attemptTag?: string): Promise<BatchTranslation> {
  if (shutdownSignal.signal.aborted) throw new TranslationInterruptedError("worker shutting down");
  const model = await modelFor("translate");
  if (shutdownSignal.signal.aborted) throw new TranslationInterruptedError("worker shutting down");
  const res = await chatJson({
    model,
    purpose: "translate_body",
    subject: `article:${articleId}@${revision}#${index}`,
    promptVersion: TRANSLATE_PROMPT_VERSION,
    system,
    user: JSON.stringify({ segments: parts }),
    schema: Output,
    temperature: 0.2,
    maxTokens: Math.min(8000, Math.ceil(parts.join("").length * 1.2) + 400),
    timeoutMs: 180_000,
    attemptTag,
  });
  return { translated: res.data.t.length === parts.length ? res.data.t : null, receiptId: res.receiptId };
}

/** Translates batches, retaining every paid receipt used before the final body is committed. */
async function translateAll(
  articleId: string, revision: number, parts: string[], system: string, attemptTag?: string,
): Promise<{ translations: Array<string | null>; receiptIds: number[] }> {
  const out: Array<string | null> = new Array(parts.length).fill(null);
  const receiptIds: number[] = [];
  let start = 0;
  let index = 0;
  while (start < parts.length) {
    let end = start;
    let chars = 0;
    while (end < parts.length && (end === start || chars + parts[end]!.length <= BATCH_CHARS)) chars += parts[end++]!.length;
    const batch = parts.slice(start, end);
    const first = await translateBatch(articleId, revision, index++, batch, system, attemptTag);
    receiptIds.push(first.receiptId);
    let done = first.translated;
    if (!done && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const left = await translateBatch(articleId, revision, index++, batch.slice(0, mid), system, attemptTag);
      const right = await translateBatch(articleId, revision, index++, batch.slice(mid), system, attemptTag);
      receiptIds.push(left.receiptId, right.receiptId);
      done = left.translated && right.translated ? [...left.translated, ...right.translated] : null;
    }
    if (done) done.forEach((t, i) => (out[start + i] = t));
    start = end;
  }
  return { translations: out, receiptIds };
}

/** A block as the model sees it: media and inline code as ⟦n⟧, links as <a id="Ln"> with their attributes kept here. */
interface Shielded {
  html: string;
  tokens: string[];
  links: Array<Record<string, string>>;
}

export function shield(inner: string): Shielded {
  const $ = cheerio.load(inner, null, false);
  const tokens: string[] = [];
  for (const node of $("picture, video, img, code").toArray()) {
    if ($(node).parents("picture, video, code").length) continue;
    tokens.push($.html(node));
    $(node).replaceWith(`⟦${tokens.length - 1}⟧`);
  }
  const links: Shielded["links"] = [];
  $("a").each((i, a) => {
    links.push({ ...(a as Element).attribs });
    (a as Element).attribs = { id: `L${i}` };
  });
  return { html: $.html(), tokens, links };
}

/** The translated block with its media, code and links put back; null when the answer lost or repeated any. */
export function unshield(translated: string, s: Shielded): string | null {
  const counts = new Map<number, number>();
  for (const m of translated.matchAll(/⟦(\d+)⟧/g)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1);
  if (counts.size !== s.tokens.length || s.tokens.some((_t, i) => counts.get(i) !== 1)) return null;
  const $ = cheerio.load(translated, null, false);
  const seen = new Set<number>();
  let intact = true;
  $("a").each((_i, a) => {
    const n = /^L(\d+)$/.exec((a as Element).attribs.id ?? "")?.[1];
    const attribs = n === undefined ? undefined : s.links[Number(n)];
    if (!attribs || seen.has(Number(n))) intact = false;
    else {
      seen.add(Number(n));
      (a as Element).attribs = attribs;
    }
  });
  if (!intact || seen.size !== s.links.length) return null;
  return $.html().replace(/⟦(\d+)⟧/g, (_m, n: string) => s.tokens[Number(n)]!);
}

export async function translateArticle(articleId: string, opts: { untranslatedOnly?: boolean } = {}): Promise<TranslateResult> {
  const [row] = await sql<{ revision: number; channel: string; language: string | null; body_html: string | null; body_text: string | null; x_post: { text?: string } | null; title: string; selected: boolean; body_mode: string; visibility: string }[]>`
    SELECT a.revision, p.channel, a.language, a.body_html, a.body_text, a.x_post, p.title, p.selected, p.body_mode, p.visibility
    FROM publications p JOIN articles a ON a.id = p.article_id WHERE p.article_id = ${articleId}`;
  if (!row) return { articleId, status: "skipped", reason: "not published" };
  const result = (r: Omit<TranslateResult, "articleId" | "revision">): TranslateResult => ({ articleId, revision: row.revision, ...r });
  if (row.visibility !== "public" || row.body_mode !== "full") return result({ status: "skipped", reason: "not a public full-text item" });

  if (row.channel === "x") {
    const text = String(row.x_post?.text ?? row.body_text ?? "").trim();
    if (isEmptyOrLinkOnly(text)) return result({ status: "skipped", reason: "no text to translate" });
    if (isChinese(row.language, text)) return result({ status: "skipped", reason: "already Chinese" });
    const translated = await translateAll(articleId, row.revision, [text], SYSTEM_POST);
    const [t] = translated.translations;
    if (!t) return result({ status: "skipped", reason: "translation did not line up" });
    await store(articleId, row.revision, row.title, textToHtml(t), t, true, translated.receiptIds);
    return result({ status: "translated", segments: 1 });
  }

  if (!row.body_html || isChinese(row.language, row.body_text ?? "")) return result({ status: "skipped", reason: "no foreign-language body" });
  let input = row.body_html;
  if (opts.untranslatedOnly) {
    const [current] = await sql<{ body_html: string }[]>`SELECT body_html FROM translations
      WHERE article_id=${articleId} AND lang='zh' AND revision=${row.revision} AND origin='model'`;
    if (!current) return result({ status: "skipped", reason: "no current model translation to repair" });
    input = current.body_html;
  }
  const $ = cheerio.load(input, null, false);
  const blocks = segmentsOf($).filter(el => {
    if (!opts.untranslatedOnly) return true;
    const text = $(el).clone();
    text.find("pre,code").remove();
    return !/[一-鿿]/.test(text.text());
  });
  if (!blocks.length) return result({ status: "skipped", reason: "no translatable text" });
  // Requests still use BATCH_CHARS batching. Long articles continue through every block;
  // their paid batches are reusable after an interrupted run instead of truncating at 60K HTML.
  const chosen = blocks;
  const shielded = chosen.map((el) => shield($(el).html() ?? ""));
  const restore = (answers: Array<string | null>) => answers.map((t, i) => (t === null ? null : unshield(t, shielded[i]!)));
  const first = await translateAll(articleId, row.revision, shielded.map((b) => b.html), SYSTEM_BODY);
  const receiptIds = [...first.receiptIds];
  const translations = restore(first.translations);
  // Blocks whose answer dropped a link or an image are asked once more, on their own receipt.
  const missing = translations.flatMap((t, i) => (t === null ? [i] : []));
  if (missing.length) {
    const again = await translateAll(articleId, row.revision, missing.map((i) => shielded[i]!.html), SYSTEM_BODY, "retry");
    receiptIds.push(...again.receiptIds);
    missing.forEach((i, k) => (translations[i] = again.translations[k] ? unshield(again.translations[k]!, shielded[i]!) : null));
  }
  let done = 0;
  chosen.forEach((el, i) => {
    const t = translations[i];
    if (t) {
      $(el).html(t);
      done += 1;
    }
  });
  if (!done) return result({ status: "skipped", reason: "no batch translated" });
  const complete = done === blocks.length;
  const html = sanitizeBody($.html());
  await store(articleId, row.revision, row.title, html, cheerio.load(html, null, false).root().text().trim(), complete, receiptIds);
  return result({ status: complete ? "translated" : "partial", segments: done });
}

async function store(articleId: string, revision: number, title: string, html: string, text: string, complete: boolean, receiptIds: number[]) {
  // Never over a translation of a later revision (a slow run finishing after a newer one).
  await sql.begin(async (tx) => {
    const changed = await tx`
      INSERT INTO translations (article_id, lang, revision, title, body_html, body_text, complete, origin)
      VALUES (${articleId}, 'zh', ${revision}, ${title}, ${html}, ${text}, ${complete}, 'model')
      ON CONFLICT (article_id, lang) DO UPDATE SET revision = EXCLUDED.revision, title = EXCLUDED.title, body_html = EXCLUDED.body_html,
        body_text = EXCLUDED.body_text, complete = EXCLUDED.complete, origin = 'model', created_at = now()
      WHERE translations.origin <> 'source' AND translations.revision <= EXCLUDED.revision
        AND (translations.revision, translations.title, translations.body_html, translations.body_text, translations.complete, translations.origin)
          IS DISTINCT FROM (EXCLUDED.revision, EXCLUDED.title, EXCLUDED.body_html, EXCLUDED.body_text, EXCLUDED.complete, EXCLUDED.origin)
      RETURNING article_id`;
    if (changed.length) await emit("articleChanged", { id: articleId, kind: "body", reason: "body translation" }, tx);
    for (const receiptId of new Set(receiptIds)) await completeReceipt(tx, receiptId);
  });
}

/** A quoted post worth translating: at least a few letters beyond its links, and not already Chinese. */
function quoteTranslatable(text: string): boolean {
  const words = collapseWhitespace(text.replace(/https?:\/\/\S+/g, " "));
  return words.length >= 10 && (words.match(/\p{L}/gu) ?? []).length >= 2 && !/[一-鿿]/.test(words);
}

/**
 * The posts that public full-text X items quote, translated once per quoted post: the
 * translation of the quoted post's own item is reused when it was collected and translated, else
 * configured translation model translates it. Returns how many were stored.
 */
export async function translateQuotes(opts: { limit?: number; budgetMs?: number } = {}): Promise<number> {
  const started = Date.now();
  const rows = await sql<{ tweet_id: string; text: string; text_hash: string | null; own_zh: string | null }[]>`
    SELECT DISTINCT ON (q.tweet_id) q.tweet_id, a.x_post->'quoted'->>'text' AS text, qt.text_hash,
      (SELECT tr.body_text FROM articles o JOIN translations tr ON tr.article_id = o.id AND tr.lang = 'zh' AND tr.revision >= o.revision
       WHERE o.identity_key = 'x:' || q.tweet_id AND tr.complete AND coalesce(tr.body_text, '') <> '') AS own_zh
    FROM publications p JOIN articles a ON a.id = p.article_id
    CROSS JOIN LATERAL (SELECT substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)') AS tweet_id) q
    LEFT JOIN quote_translations qt ON qt.tweet_id = q.tweet_id
    WHERE p.channel = 'x' AND p.visibility = 'public' AND p.body_mode = 'full'
      AND q.tweet_id IS NOT NULL AND coalesce(a.x_post->'quoted'->>'text', '') <> ''
    ORDER BY q.tweet_id, p.discovered_at DESC`;
  let stored = 0;
  for (const r of rows) {
    if (stored >= (opts.limit ?? 30) || Date.now() - started > (opts.budgetMs ?? 2 * 60_000) || shutdownSignal.signal.aborted) break;
    const hash = sha256(r.text);
    if (r.text_hash === hash || !quoteTranslatable(r.text)) continue;
    let zh = r.own_zh;
    let origin: "reused" | "model" = "reused";
    let receiptId: number | null = null;
    if (!zh) {
      origin = "model";
      try {
        const res = await chatJson({
          model: await modelFor("translate"), purpose: "translate_quoted", subject: `quote:${r.tweet_id}`, promptVersion: TRANSLATE_PROMPT_VERSION,
          system: SYSTEM_POST, user: JSON.stringify({ segments: [r.text] }), schema: Output, temperature: 0.2,
          maxTokens: Math.min(4000, Math.ceil(r.text.length * 1.5) + 200), timeoutMs: 120_000,
        });
        receiptId = res.receiptId;
        zh = res.data.t.length === 1 ? res.data.t[0]!.trim() : null;
      } catch (error) {
        // Switched-off calls or an exhausted budget stop the run; one unusable answer skips its post (its
        // receipt is reused next time, so a retry costs nothing).
        if (/disabled|not configured|budget/i.test((error as Error).message)) throw error;
        continue;
      }
    }
    if (!zh) continue;
    const changed = await sql.begin(async (tx) => {
      const saved = await tx`
        INSERT INTO quote_translations (tweet_id, text_hash, text_zh, origin) VALUES (${r.tweet_id}, ${hash}, ${zh}, ${origin})
        ON CONFLICT (tweet_id) DO UPDATE SET text_hash = EXCLUDED.text_hash, text_zh = EXCLUDED.text_zh, origin = EXCLUDED.origin, created_at = now()
        WHERE (quote_translations.text_hash, quote_translations.text_zh, quote_translations.origin)
          IS DISTINCT FROM (EXCLUDED.text_hash, EXCLUDED.text_zh, EXCLUDED.origin)
        RETURNING tweet_id`;
      if (saved.length) {
        const cited = await tx<{ id: string }[]>`
          SELECT a.id FROM articles a JOIN publications p ON p.article_id = a.id
          WHERE substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)') = ${r.tweet_id}`;
        for (const { id } of cited) await emit("articleChanged", { id, kind: "body", reason: "quoted post translation" }, tx);
      }
      if (receiptId !== null) await completeReceipt(tx, receiptId);
      return saved.length > 0;
    });
    if (changed) stored += 1;
  }
  return stored;
}

/**
 * Every few minutes: public full-text items of any age that lack a complete translation of their
 * current revision, then the posts public X items quote. Stops after a time
 * budget. A translation of an older revision is not shown (items.ts), so a revised item is translated
 * again whatever its age.
 */
export async function translatePending(opts: { limit?: number; budgetMs?: number; concurrency?: number } = {}): Promise<{ done: TranslateResult[]; quotes: number }> {
  const started = Date.now();
  const rows = await sql<{ article_id: string }[]>`
    SELECT p.article_id FROM publications p JOIN articles a ON a.id = p.article_id
    LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = 'zh'
    WHERE p.visibility = 'public' AND p.body_mode = 'full' AND coalesce(a.language, '') <> 'zh'
      AND (tr.article_id IS NULL OR (tr.origin <> 'source' AND (tr.revision < a.revision OR NOT tr.complete)))
      AND NOT EXISTS (SELECT 1 FROM translation_attempts t WHERE t.article_id = p.article_id AND t.revision = a.revision
                      AND (t.outcome IN ('skipped', 'translated') OR t.attempts >= 3))
    ORDER BY p.discovered_at DESC LIMIT ${opts.limit ?? 30}`;
  const done: TranslateResult[] = [];
  let cursor = 0;
  let stopped = false;
  const work = async () => { while (cursor < rows.length) {
    if (stopped || Date.now() - started > (opts.budgetMs ?? 4 * 60_000) || shutdownSignal.signal.aborted) return;
    const r = rows[cursor++]!;
    let outcome: "translated" | "partial" | "skipped" | "failed";
    let reason: string | null = null;
    // The attempt is recorded against the revision actually read: when the text was revised while the
    // model was answering, the new revision still has no attempt and is translated on the next run.
    let revision: number | null = null;
    try {
      const result = await translateArticle(r.article_id);
      done.push(result);
      outcome = result.status;
      reason = result.reason ?? null;
      revision = result.revision ?? null;
    } catch (error) {
      // A deploy stops between paid fragments, never aborts a sent request. Received answers stay
      // in receipts and are reused next run; do not mark an interrupted article terminal/partial.
      if (error instanceof TranslationInterruptedError) { stopped = true; return; }
      const message = (error as Error).message;
      // Switched-off model calls or an exhausted budget: stop this run without counting an attempt.
      if (/disabled|not configured|budget/i.test(message)) { stopped = true; return; }
      done.push({ articleId: r.article_id, status: "skipped", reason: message.slice(0, 200) });
      outcome = "failed";
      reason = message.slice(0, 300);
    }
    await sql`
      INSERT INTO translation_attempts (article_id, revision, attempts, outcome, reason)
      SELECT ${r.article_id}, coalesce(${revision}::int, a.revision), 1, ${outcome}, ${reason} FROM articles a WHERE a.id = ${r.article_id}
      ON CONFLICT (article_id) DO UPDATE SET
        attempts = CASE WHEN translation_attempts.revision = EXCLUDED.revision THEN translation_attempts.attempts + 1 ELSE 1 END,
        revision = EXCLUDED.revision, outcome = EXCLUDED.outcome, reason = EXCLUDED.reason, updated_at = now()`;
  } };
  // The maintenance worker may fill a historical backlog concurrently. Always drain sent requests
  // before returning an error or closing the database; receipts still enforce the shared budget.
  const concurrency = Math.max(1, Math.min(12, Math.floor(opts.concurrency ?? 1)));
  const workers = await Promise.allSettled(Array.from({ length: Math.min(rows.length, concurrency) }, work));
  const failed = workers.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  const budgetMs = opts.budgetMs ?? 4 * 60_000;
  let quotes = 0;
  const left = budgetMs - (Date.now() - started);
  if (left > 0 && !shutdownSignal.signal.aborted) {
    try {
      quotes = await translateQuotes({ budgetMs: left });
    } catch (error) {
      if (error instanceof TranslationInterruptedError || /disabled|not configured|budget/i.test((error as Error).message)) return { done, quotes };
      throw error;
    }
  }
  return { done, quotes };
}
