import type { Board, Entry, Model, Resets, ResetEvent } from "./contracts.ts";

export function boardEntries(board: Board, models: Record<string, Model>, domestic = false, open = false, query = ""): Entry[] {
  // The extra entries are supplied specifically for filters, not a complete unfiltered global ranking.
  const entries = domestic || open || query.trim() ? [...board.entries, ...board.filterEntries] : board.entries;
  const q = query.trim().toLowerCase();
  return entries.filter(e => {
    const m = models[e.slug];
    return m && (!domestic || m.access.domestic) && (!open || !!m.access.weightsUrl)
      && (!q || `${m.model.name} ${m.model.provider} ${e.slug}`.toLowerCase().includes(q));
  });
}
export function scenarioCost(model: Model, inputMillion: number, outputMillion: number, cacheRate: number): number | null {
  if (![inputMillion, outputMillion, cacheRate].every(Number.isFinite) || inputMillion < 0 || outputMillion < 0 || cacheRate < 0 || cacheRate > 1) return null;
  const p = model.price;
  if (!p) return null;
  const uncached = inputMillion * (1 - cacheRate), cached = inputMillion * cacheRate;
  if (uncached > 0 && p.inputCny === null || cached > 0 && p.cachedCny === null || outputMillion > 0 && p.outputCny === null) return null;
  return uncached * (p.inputCny ?? 0) + cached * (p.cachedCny ?? 0) + outputMillion * (p.outputCny ?? 0);
}
export function frontier(points: Array<{ slug: string; cost: number; score: number }>): Set<string> {
  return new Set(points.filter(p => !points.some(q => q.cost <= p.cost && q.score >= p.score && (q.cost < p.cost || q.score > p.score))).map(p => p.slug));
}
export const beijingDay = (time: string) => new Date(Date.parse(time) + 8 * 3600000).toISOString().slice(0, 10);
export const eventDay = (e: ResetEvent) => e.occurredOn?.slice(0, 10) ?? beijingDay(e.confirmedAt ?? e.schedule?.through ?? e.schedule?.from ?? e.createdAt);
export const eventActivityAt = (e: ResetEvent) => Math.max(Date.parse(e.createdAt), Date.parse(e.updatedAt), ...e.posts.map(p => Date.parse(p.publishedAt)));
export function mergeResets(history: Resets | null, recent: Resets | null): Resets | null {
  if (!recent) return history;
  if (!history) return recent;
  const boundary = Date.parse(recent.historyFrom);
  const ids = new Set(recent.events.map(e => e.id));
  const events = [...recent.events, ...history.events.filter(e => !ids.has(e.id) && eventActivityAt(e) < boundary)]
    .sort((a, b) => eventActivityAt(b) - eventActivityAt(a));
  const activities = [...recent.activities, ...history.activities.filter(a => Date.parse(a.publishedAt) < boundary)]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { ...recent, historyFrom: history.historyFrom, events, activities, count: events.length };
}
export function resetSummary(data: Resets, today: string) {
  const cutoff = Date.parse(`${today}T00:00:00+08:00`) - 89 * 86400000;
  const confirmed = data.events.filter(e => e.status === "confirmed" && e.presentation.status === "confirmed");
  const resets = confirmed.filter(e => e.type === "direct_reset").sort((a, b) => eventDay(b).localeCompare(eventDay(a)));
  const recent = confirmed.filter(e => Date.parse(`${eventDay(e)}T00:00:00+08:00`) >= cutoff && eventDay(e) <= today);
  const days = [...new Set(recent.filter(e => e.type === "direct_reset").map(eventDay))].sort();
  const intervals = days.slice(1).map((day, i) => (Date.parse(day) - Date.parse(days[i])) / 86400000).sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const medianDays = intervals.length ? intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2 : null;
  // An elapsed announced deadline is still unconfirmed; no guessed next reset and no personal quota inference.
  return { resets: recent.filter(e => e.type === "direct_reset").length, credits: recent.filter(e => e.type === "reset_credit").length, medianDays,
    lastReset: resets[0] ?? null,
    announced: data.events.filter(e => e.status === "announced" && e.presentation.status !== "likely_completed"),
    inferred: data.events.filter(e => e.presentation.status === "likely_completed") };
}
