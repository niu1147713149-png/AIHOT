import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLeaderboard } from "../backend/parse.ts";
import { resetsSchema } from "../backend/schema.ts";
import { beijingDay, boardEntries, eventDay, frontier, mergeResets, resetSummary, scenarioCost } from "../data.ts";
import { event, leaderboard, model, pageHtml, resets } from "./fixtures.ts";

test("source HTML is decoded as data and retains rankings, null prices and actual zero scores", () => {
  const value = leaderboard(); value.models.extra.price = null;
  assert.deepEqual(parseLeaderboard(pageHtml(value)), value);
  assert.equal(parseLeaderboard(pageHtml(value)).boards[0].filterEntries[0].score, 0);
  assert.throws(() => parseLeaderboard('<script>globalThis.__executed = true</script>'));
  assert.equal((globalThis as Record<string, unknown>).__executed, undefined);
  assert.throws(() => parseLeaderboard('<script>streamController.enqueue("[{\\\"_1\\\":0},\\\"cycle\\\"]")</script>'), /cyclic/);
  assert.throws(() => parseLeaderboard(pageHtml({ ...value, models: {} })));
  assert.throws(() => parseLeaderboard(pageHtml({ ...value, boards: Array(5).fill(value.boards[0]) })));
  const unsafe = leaderboard(); unsafe.models.sample.price!.officialUrl = "javascript:alert(1)";
  assert.throws(() => parseLeaderboard(pageHtml(unsafe)));
});

test("filtered rows keep their source ranks and pending models never enter the ranking", () => {
  const { boards, models } = leaderboard();
  assert.deepEqual(boardEntries(boards[0], models).map(e => e.rank), [1]);
  assert.deepEqual(boardEntries(boards[0], models, true).map(e => e.rank), [1, 31]);
  assert.equal(boardEntries(boards[0], models, false, false, "extra")[0].score, 0);
  models.extra.access.domestic = false;
  assert.equal(boardEntries(boards[0], models, true).length, 1);
  assert.equal(boardEntries(boards[0], models, false, false, "unknown").length, 0);
});

test("cost uses tokens and cache share; unknown prices are never treated as free", () => {
  assert.equal(scenarioCost(model(), 1, 0.25, 0.5), 3.25);
  assert.equal(scenarioCost(model("free", 0), 1, 0, 0), 0);
  assert.equal(scenarioCost(model("unknown", null), 1, 0, 0), null);
  assert.equal(scenarioCost(model("unknown", null), 1, 0, 1), 0.5);
  assert.equal(scenarioCost(model(), 1, 1, 1.1), null);
  const m = model(); m.price!.cachedCny = null;
  assert.equal(scenarioCost(m, 1, 0, 0), 2);
  assert.equal(scenarioCost(m, 1, 0, 0.1), null);
  assert.deepEqual([...frontier([{slug:"a",cost:1,score:60},{slug:"b",cost:1,score:59},{slug:"c",cost:2,score:70},{slug:"tie",cost:1,score:60}])], ["a", "c", "tie"]);
});

test("recent reset windows replace removals and updates while retaining older history once", () => {
  const old = event("old", "2026-09-01T00:00:00Z"), removed = event("removed"), updated = event("updated");
  const history = resets([old, removed, updated]), recent = resets([{ ...updated, title: "更正" }]);
  const merged = mergeResets(history, recent)!;
  assert.deepEqual(merged.events.map(e => e.id), ["updated", "old"]);
  assert.equal(merged.events[0].title, "更正");
  assert.equal(merged.count, 2);
  assert.equal(mergeResets(null, recent), recent);
});

test("Beijing dates handle midnight and elapsed announcements never become confirmations", () => {
  assert.equal(beijingDay("2026-10-13T16:01:00Z"), "2026-10-14");
  const announced = { ...event("preview"), status: "announced", confirmedAt: null,
    presentation: { ...event().presentation, status: "announced" },
    schedule: { precision: "deadline", from: null, through: "2026-10-12T16:00:00Z", label: "预计" } };
  assert.equal(eventDay(announced), "2026-10-13");
  const summary = resetSummary(resets([event(), announced, { ...event("credit"), type: "reset_credit" }]), "2026-10-14");
  assert.equal(summary.resets, 1); assert.equal(summary.credits, 1); assert.equal(summary.announced.length, 1);
  assert.equal(summary.lastReset?.id, "event");
  const inferred = { ...announced, presentation: { ...announced.presentation, status: "likely_completed" } };
  const historical = resetSummary(resets([inferred]), "2026-10-14");
  assert.equal(historical.inferred.length, 1); assert.equal(historical.announced.length, 0);
  assert.equal(historical.resets, 0); assert.equal(historical.lastReset, null);
  assert.throws(() => resetsSchema.parse(resets([event(), event()])));
});

test("reset intervals use distinct confirmed Beijing dates in the last 90 days", () => {
  const data = resets([
    event("first", "2026-10-01T00:00:00Z"), event("same-day", "2026-10-01T10:00:00Z"),
    event("second", "2026-10-03T00:00:00Z"), event("third", "2026-10-09T00:00:00Z"),
    event("old", "2026-01-01T00:00:00Z"), { ...event("credit", "2026-10-06T00:00:00Z"), type: "reset_credit" },
    { ...event("inferred", "2026-10-05T00:00:00Z"), presentation: { ...event().presentation, status: "likely_completed" } },
  ]);
  assert.equal(resetSummary(data, "2026-10-14").medianDays, 4);
  assert.equal(resetSummary(resets([event()]), "2026-10-14").medianDays, null);
});
