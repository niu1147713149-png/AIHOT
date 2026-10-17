import { Link, isRouteErrorResponse, useRouteError, useRevalidator } from "react-router";
import type { ReactNode } from "react";
import type { SkillEntry } from "@aihot/contracts/skills";
import { SKILL_CATEGORIES } from "@aihot/contracts/skills";
import { IconGrid } from "@aihot/web/components/icons";
import "./skills.css";

export function dateLabel(at: string | null) { return at ? new Date(at).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "暂无"; }
export function External({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="sm-link">{children} ↗</a>;
}
export function SkillMark({ category }: { category: keyof typeof SKILL_CATEGORIES }) {
  return <span className={`sm-mark sm-mark-${category}`} aria-hidden="true"><IconGrid size={21} /></span>;
}
export function SkillStats({ skill }: { skill: SkillEntry }) {
  return <div className="sm-stats">
    <span>{skill.metric ? <><b>{skill.metric.displayValue}</b> 来源累计安装 · #{skill.metric.rank}</> : "来源安装量暂无"}</span>
    <span>仓库 Stars {skill.repository ? skill.repository.stars.toLocaleString("zh-CN") : "暂无"}</span>
  </div>;
}
export function SkillsError() {
  const error = useRouteError(), revalidator = useRevalidator();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return <section className="sm-page sm-empty" role="alert"><h1>{missing ? "这个 Skill 暂不可用" : "Skills 暂时无法加载"}</h1>
    <p>{missing ? "条目可能已下架，或链接不完整。" : "请稍后重试，已保存的资料不会因此丢失。"}</p>
    <Link to="/skills" className="sm-link">返回 Skills 市场</Link>
    {!missing && <button className="sm-button" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>重新加载</button>}
  </section>;
}
