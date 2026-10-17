import { useState } from "react";
import { Link, useLoaderData, useLocation, useNavigate, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { SKILL_CATEGORIES, SKILL_CLIENTS, type SkillClient, type SkillEntry } from "@aihot/contracts/skills";
import { cachedPage, loadOr404, pageHeaders } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { installCommand, sourceUrl } from "../data.ts";
import { dateLabel, External, SkillMark, SkillStats, SkillsError } from "./shared";

export const handle: Screen = { tab: "me", name: "Skill 详情" };
export const headers = pageHeaders;
export const ErrorBoundary = SkillsError;
export function meta({ data }: { data?: { skill: SkillEntry } }) { return pageMeta({ title: data?.skill.data.title ?? "Skill 详情", path: `/skills/${data?.skill.id ?? ""}` }); }
export async function loader({ params, request }: LoaderFunctionArgs) {
  return cachedPage(0, { skill: await loadOr404<SkillEntry>(`/api/site/skills/${encodeURIComponent(params.id!)}`, { signal: request.signal }) });
}
export default function Detail() {
  const { skill } = useLoaderData<typeof loader>();
  return <DetailContent key={skill.id} skill={skill} />;
}
function DetailContent({ skill }: { skill: SkillEntry }) {
  const [params] = useSearchParams(), rawFrom = params.get("from");
  const location = useLocation(), navigate = useNavigate();
  const from = rawFrom === "/skills" || rawFrom?.startsWith("/skills?") ? rawFrom : "/skills";
  const [client, setClient] = useState<SkillClient>(skill.data.clients[0].id), [scope, setScope] = useState<"project" | "global">("project");
  const [copy, setCopy] = useState(""), [copying, setCopying] = useState(false);
  const d = skill.data, command = installCommand(skill.repo, d.name, client, scope);
  async function copyCommand() {
    setCopying(true);
    try { await navigator.clipboard.writeText(command); setCopy("已复制，在你的电脑终端中运行。"); }
    catch { setCopy("无法访问剪贴板，请选中上方命令手动复制。"); }
    finally { setCopying(false); }
  }
  return <><PhoneBar title="Skill 详情" back={{ to: from, label: "Skills 市场" }} /><article className="sm-page">
    <Link to={from} className="sm-back" onClick={e => { if (location.state?.skillsFrom === from && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); navigate(-1); } }}>← 返回 Skills 市场</Link>
    <header className="sm-heading"><div><div className="sm-card-top"><SkillMark category={d.category} /><div><h1 data-page-title="">{d.title}</h1><p className="sm-name mt-1">{d.name}</p></div></div>
      <p className="sm-muted mt-4">{SKILL_CATEGORIES[d.category]} · {d.author}</p></div><span className="sm-tag">独立 Skill</span></header>
    {d.recommendation && <p className="sm-reason"><strong>为什么精选 · </strong>{d.recommendation}</p>}
    <div className="sm-detail-grid"><div className="sm-prose">
      <section><h2>它能帮你做什么</h2><p>{d.summary}</p><ul className="mt-4">{d.tasks.map(t => <li key={t}>{t}</li>)}</ul></section>
      <section><h2>试试这样使用</h2><p className="sm-example">{d.example}</p></section>
      <section><h2>使用前准备</h2><ul>{d.dependencies.map(t => <li key={t}>{t}</li>)}</ul>
        <p className="sm-muted mt-3">在国内使用时，需能访问 GitHub 和 npm；相关客户端、模型与外部服务由你自行配置，费用以服务商为准。</p></section>
      <section><h2>来源与核验</h2><div className="sm-sources"><External href={`https://github.com/${skill.repo}`}>原作者仓库 · {skill.repo}</External>
        <External href={sourceUrl(skill.repo, skill.path, d.verification.commit)}>已核验版本的 SKILL.md</External>
        {skill.metric && <External href={skill.metric.sourceUrl}>skills.sh 榜单来源页</External>}
        {d.homepage && <External href={d.homepage}>项目官网</External>}
        {d.license.url ? <External href={d.license.url}>许可 · {d.license.name}</External> : <span>许可 · {d.license.name}</span>}</div>
        <p className="sm-muted">资料核验 {dateLabel(d.verification.checkedAt)} · 版本 <code>{d.verification.commit.slice(0, 12)}</code></p>
        <details className="mt-3"><summary className="cursor-pointer text-sm">查看原文说明与内容指纹</summary><p className="mt-3 text-sm" lang="en">{d.originalDescription}</p><p className="sm-name mt-3">SHA-256 {d.verification.contentHash}</p></details></section>
    </div><aside><section className="sm-panel"><h2>安装到你的 Agent</h2><p className="sm-muted">只安装当前 Skill，选择你使用的客户端与范围。</p>
      <div className="sm-install-fields"><label>客户端<select aria-label="客户端" className="sm-select" value={client} onChange={e => { setClient(e.target.value as SkillClient); setCopy(""); }}>{d.clients.map(c => <option value={c.id} key={c.id}>{SKILL_CLIENTS[c.id]}</option>)}</select></label>
        <label>安装范围<select aria-label="安装范围" className="sm-select" value={scope} onChange={e => { setScope(e.target.value as typeof scope); setCopy(""); }}><option value="project">当前项目</option><option value="global">全局使用</option></select></label></div>
      <code className="sm-command" data-testid="install-command">{command}</code><button className="sm-button sm-button-primary w-full" onClick={copyCommand} disabled={copying}>复制安装命令</button>
      <p className="sm-muted mt-2 min-h-6" role="status">{copy}</p><p className="sm-muted">{scope === "project" ? "先在终端进入目标项目目录，再运行命令。" : "全局范围会让此 Skill 可供多个项目使用。"}</p>
      <p className="sm-muted mt-3">{d.clients.find(c => c.id === client)?.note}</p>
      <p className="sm-muted mt-3">核验状态：官方安装文档已核对，尚未执行安装实测。命令安装仓库当前版本，可能晚于本站核验版本。</p>
      <p className="mt-3 text-xs"><External href={d.verification.installDocUrl}>查看安装器官方说明</External></p></section>
      <section className="sm-panel"><h2>热度与更新</h2><SkillStats skill={skill} />
        <p className="sm-muted mt-3">安装榜快照 {dateLabel(skill.metric?.observedAt ?? null)}<br />仓库更新 {dateLabel(skill.repository?.pushedAt ?? null)}<br />仓库数据核对 {dateLabel(skill.repositoryCheckedAt)}</p>
        {skill.repositoryRefreshFailed && <p className="sm-muted mt-2">最近刷新未成功，保留上次已核验数据。</p>}
        {skill.repository?.archived && <p className="sm-muted mt-2">该仓库已归档，作者可能不再维护。</p>}
        <Link to="/skills/rules" className="sm-link mt-3 inline-block text-xs">这些数字代表什么</Link></section></aside></div>
  </article></>;
}
