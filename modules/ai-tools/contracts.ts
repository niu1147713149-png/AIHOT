export type BoardKey = "overall" | "coding" | "reasoning" | "professional" | "knowledge";
export interface Model {
  model: { slug: string; name: string; provider: string; releasedAt: string | null };
  price: { currency: string; input: number | null; output: number | null; cached: number | null;
    inputCny: number | null; outputCny: number | null; cachedCny: number | null; officialUrl: string | null; note: string | null } | null;
  access: { domestic: boolean; weightsUrl: string | null };
}
export interface Entry { slug: string; rank: number; score: number; sourceCount: number; coverage: number }
export interface Board {
  board: { key: BoardKey; name: string; description: string; howToRead: string; sourceCount: number; operatorCount: number };
  entries: Entry[];
  filterEntries: Entry[];
  pending: Array<{ slug: string; score: number; sources: number; reason: string }>;
}
export interface Leaderboard {
  run: { id: string; methodologyVersion: string; generatedAt: string;
    fx: { rate: number; asOf: string; sourceName: string } | null };
  models: Record<string, Model>;
  boards: Board[];
}
export interface PostContext { id: string; author: string; relation: string; text: string | null; originalText: string; url: string }
export interface ResetPost {
  id: string; publishedAt: string; stage?: string; text: string; originalText: string;
  fullText?: string | null; fullOriginalText?: string | null; context: PostContext[]; url: string;
}
export interface ResetEvent {
  id: string; type: string; label: string; displayLabel: string; status: string; title: string; scope: string;
  presentation: { status: string; scopeKnown: boolean; scopeLabel: string | null; kindExplicit: boolean;
    timeInferred: boolean; audienceZh: string | null; productsZh: string | null };
  createdAt: string; updatedAt: string; confirmedAt: string | null; occurredOn: string | null; confirmationBasis: string | null;
  schedule: { precision: string; from: string | null; through: string | null; label: string } | null;
  posts: ResetPost[]; url: string;
}
export interface ResetActivity extends ResetPost { eventIds: string[]; kind: string; statusChanged: boolean; action: string | null }
export interface Resets {
  schemaVersion: number; timezone: string; today: string; checkedAt: string | null; historyFrom: string; count: number;
  events: ResetEvent[]; activities: ResetActivity[];
  monitor: { status: string; lastAttemptAt: string | null; lastCollectedAt: string | null; lastVerifiedAt: string | null;
    heldWindowCount: number; pendingCount: number; reviewCount: number };
  outage: unknown;
}
export interface Snapshot<T> {
  data: T | null;
  sourceUrl: string;
  checkedAt: string | null;
  changedAt: string | null;
  lastAttemptAt: string | null;
  nextFetchAt: string | null;
  error: string | null;
}
export interface ResetResponse extends Snapshot<Resets> { historyCheckedAt: string | null; historyError: string | null }
