export const SKILL_CATEGORIES = {
  development: "开发编程", content: "内容创作", design: "设计与视频",
  office: "办公文档", automation: "流程自动化", marketing: "营销与业务研究",
} as const;
export const SKILL_CLIENTS = { codex: "Codex", "claude-code": "Claude Code" } as const;
export type SkillCategory = keyof typeof SKILL_CATEGORIES;
export type SkillClient = keyof typeof SKILL_CLIENTS;
export interface SkillData {
  name: string;
  title: string;
  summary: string;
  originalDescription: string;
  category: SkillCategory;
  tasks: string[];
  example: string;
  dependencies: string[];
  clients: Array<{ id: SkillClient; note: string }>;
  recommendation: string;
  author: string;
  license: { name: string; url: string | null };
  homepage: string | null;
  verification: { commit: string; contentHash: string; checkedAt: string; installDocUrl: string };
}
export interface SkillMetric {
  source: "skills.sh";
  metric: "installs";
  window: "all-time";
  displayValue: string;
  rank: number;
  sourceUrl: string;
  observedAt: string;
}
export interface SkillRepository {
  stars: number;
  pushedAt: string;
  archived: boolean;
}
export interface SkillImport {
  repo: string;
  path: string;
  data: SkillData;
  metric: SkillMetric | null;
  repository: { data: SkillRepository; checkedAt: string } | null;
}
export interface SkillEntry {
  id: string;
  repo: string;
  path: string;
  data: SkillData;
  metric: SkillMetric | null;
  repository: SkillRepository | null;
  repositoryCheckedAt: string | null;
  repositoryRefreshFailed: boolean;
  updatedAt: string;
}
export interface SkillList {
  items: SkillEntry[];
  total: number;
  page: number;
  pageSize: number;
  snapshotAt: string | null;
}
export interface AdminSkill {
  id: string;
  repo: string;
  path: string;
  data: SkillData;
  metric: SkillMetric | null;
  status: "published" | "hidden";
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface SkillPreview {
  digest: string;
  rows: Array<{ id: string; name: string; repo: string; path: string; duplicate: boolean }>;
  added: number;
  skipped: number;
}
