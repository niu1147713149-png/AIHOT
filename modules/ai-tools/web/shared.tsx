import { Link } from "react-router";
import type { ReactNode } from "react";
import type { Snapshot } from "../contracts";

export const formatTime = (time: string | null | undefined) => time && Number.isFinite(Date.parse(time))
  ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(time)) : "暂无记录";
export const money = (value: number | null | undefined) => value === null || value === undefined ? "待核验" : `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: value >= 0.1 ? 2 : 4 })}`;
export const button = "rounded-control border border-line px-3 py-2 text-sm hover:bg-bg-sunk focus-visible:outline-2 focus-visible:outline-accent";
export const field = "rounded-control border border-line bg-bg px-3 py-2 text-sm text-ink";

export function External({ href, children, className = "text-accent hover:underline" }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children} ↗</a>;
}
export function ToolLinks() {
  return <nav aria-label="AI 工具" className="mb-6 flex flex-wrap gap-4 text-sm text-ink-3">
    <Link to="/leaderboard" className="hover:text-accent">模型榜</Link>
    <Link to="/codex-reset" className="hover:text-accent">Tibo 重置监控</Link>
    <Link to="/more" className="hover:text-accent">我的</Link>
  </nav>;
}
export function SyncState({ snapshot, now, maxAge, sourceAt }: { snapshot: Snapshot<unknown>; now: number; maxAge: number; sourceAt?: string | null }) {
  const stale = !snapshot.checkedAt || now - Date.parse(snapshot.checkedAt) > maxAge;
  return <div className="mb-6 border-b border-line pb-4 text-xs leading-6 text-ink-3">
    <p>数据来源：<External href={snapshot.sourceUrl}>AIHOT</External> · 本地核对 {formatTime(snapshot.checkedAt)}{sourceAt && <> · 来源更新 {formatTime(sourceAt)}</>}</p>
    {(snapshot.error || stale) && <p role="status" className="text-amber-700 dark:text-amber-400">{snapshot.error ?? "尚未完成同步，或缓存已超过更新周期"}。{snapshot.data ? "以下保留上次成功的数据，请核对来源。" : "后台完成首次同步后会显示数据。"}</p>}
  </div>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-line bg-bg-sunk p-8 text-sm leading-7 text-ink-3">{children}</div>;
}
