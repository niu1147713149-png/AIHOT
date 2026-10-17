import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import { bilingualBody } from "@aihot/backend/publication/bilingual";

test("parallel reading preserves paragraph order, one outline, links, images and shared code", () => {
  const shared = '<pre><code>const price = 10;</code></pre><p><img src="https://example.org/chart.png"></p>';
  const output = bilingualBody('<h2 id="sec-1">价格变化</h2><p>现在是 <a href="https://example.org">十美元</a>。</p>' + shared,
    '<h2 id="sec-1">Price change</h2><p>It now costs <a href="https://example.org">ten dollars</a>.</p>' + shared);
  const $ = cheerio.load(output);
  assert.equal($('.bilingual-pair').length, 2);
  assert.equal($('#sec-1').length, 1);
  assert.equal($('.bilingual-pair').eq(1).find('.bilingual-zh').text(), '现在是 十美元。');
  assert.equal($('.bilingual-pair').eq(1).find('.bilingual-original').text(), 'It now costs ten dollars.');
  assert.equal($('a[href="https://example.org"]').length, 2);
  assert.equal($('img').length, 1);
  assert.equal($('pre').length, 1);
});

test("different source translation structures remain complete without false paragraph alignment", () => {
  const output = bilingualBody('<p>合并后的两段译文。</p>', '<p>First paragraph.</p><p>Second paragraph.</p>');
  const $ = cheerio.load(output);
  assert.equal($('.bilingual-pair').length, 0);
  assert.equal($('.bilingual-version').length, 2);
  assert.match($.text(), /合并后的两段译文/);
  assert.match($.text(), /First paragraph/);
  assert.match($.text(), /Second paragraph/);
});

test("empty source video placeholders do not break alignment or lose playable media", () => {
  const media = '<p><video src="https://example.org/demo.mp4" poster="https://example.org/poster.png"></video></p>';
  const output = bilingualBody('<h2 id="sec-1">演示</h2><p>图二：运行结果。</p>' + media,
    '<h2 id="sec-1">Demo</h2><p>\n<video width="640" height="360"></video>\n</p><p>Figure 2: Results.</p>' + media);
  const $ = cheerio.load(output);
  assert.equal($('.bilingual-version').length, 0);
  assert.equal($('.bilingual-pair').length, 2);
  assert.equal($('#sec-1').length, 1);
  assert.equal($('.bilingual-pair').eq(1).find('.bilingual-original').text(), 'Figure 2: Results.');
  assert.equal($('video').length, 1);
  assert.equal($('video').attr('src'), 'https://example.org/demo.mp4');
  assert.equal($('video').attr('poster'), 'https://example.org/poster.png');
});
