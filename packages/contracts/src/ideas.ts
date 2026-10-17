/** A proposal inferred from news, never a verified business opportunity. */
export interface AiIdea {
  title: string;
  category: "tool" | "content" | "automation";
  audience: string;
  problem: string;
  proposal: string;
  whyNow: string;
  firstStep: string;
  validation: string[];
  successSignal: string;
  stopSignal: string;
  effort: string;
  monetization: string;
  uncertainties: string[];
  sourceIds: string[];
}
export interface IdeaSource {
  id: string;
  title: string;
  summary: string;
  source: string;
  at: string;
  url: string;
}
export type IdeaStatus = "missing" | "queued" | "running" | "ready" | "empty" | "failed" | "outdated";
export interface IdeasEdition {
  date: string;
  today: string;
  status: IdeaStatus;
  ideas: Array<AiIdea & { sources: IdeaSource[] }>;
  sourceCount: number;
  currentSourceCount: number;
  hiddenCount: number;
  generatedAt: string | null;
  dates: string[];
  sourceDates: string[];
}
export interface AdminIdeas {
  edition: IdeasEdition;
  modelCallsEnabled: boolean;
  scheduleEnabled: boolean;
  error: string | null;
}
export const IDEA_CATEGORIES = { tool: "工具服务", content: "内容创作", automation: "流程自动化" } as const;
export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  missing: "尚未生成", queued: "等待生成", running: "正在生成", ready: "已生成", empty: "暂无合适创意", failed: "生成未完成", outdated: "依据已变更",
};
