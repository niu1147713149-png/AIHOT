import * as cheerio from "cheerio";
import { normalizeBlocks } from "../content/sanitize.ts";

/** Both inputs are already sanitised page bodies. Pair only matching document blocks. */
export function bilingualBody(zh: string, original: string): string {
  // Older source bodies may retain empty media placeholders that translation sanitisation drops.
  // Apply the same block rules before comparing structures; keep all usable media and anchors.
  const chinese = cheerio.load(normalizeBlocks(zh), null, false);
  const english = cheerio.load(normalizeBlocks(original), null, false);
  const left = chinese.root().children().toArray();
  const right = english.root().children().toArray();
  const originals = right.map((el) => english.html(el));
  // Only the Chinese headings own the outline anchors. The original stays visible without
  // duplicate ids or a second competing set of headings in the reader's outline.
  english("[id]").removeAttr("id");
  english("h2,h3,h4,h5").each((_i, node) => {
    english(node).replaceWith(`<p class="bilingual-heading">${english(node).html()}</p>`);
  });
  const pair = (translation: string, source: string) => `<div class="bilingual-pair"><div class="bilingual-zh" lang="zh-Hans">${translation}</div><div class="bilingual-original">${source}</div></div>`;
  // A source-supplied translation may have a different structure. Show complete labelled versions
  // instead of claiming that unrelated paragraphs correspond.
  if (left.length !== right.length || left.some((el, i) => el.name !== right[i]!.name)) {
    return `<section class="bilingual-version" lang="zh-Hans"><p class="bilingual-label">中文译文</p>${chinese.html()}</section><section class="bilingual-version"><p class="bilingual-label">英文原文</p>${english.html()}</section>`;
  }
  return left.map((el, i) => {
    const translation = chinese.html(el);
    const raw = originals[i]!;
    if (translation === raw) return translation; // Shared pictures, code and untranslated blocks.
    const source = cheerio.load(raw, null, false);
    source("[id]").removeAttr("id");
    source("h2,h3,h4,h5").each((_j, node) => { source(node).replaceWith(`<p class="bilingual-heading">${source(node).html()}</p>`); });
    const images = new Set(chinese(el).find("img,video").map((_j, image) => chinese(image).attr("src")).get());
    source("img,video").each((_j, image) => { if (images.has(source(image).attr("src") ?? "")) source(image).remove(); });
    return pair(translation, source.html());
  }).join("");
}
