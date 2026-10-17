import { Form, Link, useLoaderData, useNavigation, useSearchParams, type LoaderFunctionArgs } from "react-router";
import type { SkillList } from "@aihot/contracts/skills";
import { SKILL_CATEGORIES, SKILL_CLIENTS } from "@aihot/contracts/skills";
import { cachedPage, loadOr404, pageHeaders } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { dateLabel, SkillMark, SkillStats, SkillsError } from "./shared";

export const handle: Screen = { tab: "me", name: "Skills 市场" };
export const headers = pageHeaders;
export const ErrorBoundary = SkillsError;
export function meta() { return pageMeta({ title: "Skills 市场", path: "/skills" }); }
export async function loader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams, query = new URLSearchParams();
  for (const key of ["q", "category", "client", "sort", "page"]) if (params.get(key)) query.set(key, params.get(key)!);
  return cachedPage(0, { result: await loadOr404<SkillList>(`/api/site/skills?${query}`, { signal: request.signal }) });
}
export default function Skills() {
  const { result } = useLoaderData<typeof loader>(), [params] = useSearchParams(), navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const link = (key: string, value: string) => { const p = new URLSearchParams(params); p.delete("page"); value ? p.set(key, value) : p.delete(key); return `/skills?${p}`; };
  const from = `/skills${params.size ? `?${params}` : ""}`, pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <><PhoneBar title="Skills 市场" /><div className="sm-page">
    <header className="sm-heading"><div><p className="sm-kicker">AIVANE / SKILLS</p><h1 data-page-title="">把 AI 能力装进工作流</h1>
      <p className="sm-muted mt-3">发现适合个人与小团队的 Skills，了解用途、安装方式和原始来源。</p></div>
      <Link to="/skills/rules" className="sm-link text-sm">收录与榜单说明 ↗</Link></header>
    <Form method="get" className="sm-filters" key={params.toString()} role="search">
      <div className="sm-search"><input className="sm-input" aria-label="搜索 Skills" name="q" defaultValue={params.get("q") ?? ""} maxLength={100} placeholder="搜索用途、名称或作者，例如：视频、React、文案" />
        <button type="submit" className="sm-button sm-button-primary">搜索</button></div>
      <input type="hidden" name="category" value={params.get("category") ?? ""} />
      <select className="sm-select" name="client" aria-label="适用客户端" defaultValue={params.get("client") ?? ""} onChange={e => e.currentTarget.form?.requestSubmit()}>
        <option value="">全部客户端</option>{Object.entries(SKILL_CLIENTS).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select>
      <select className="sm-select" name="sort" aria-label="排序方式" defaultValue={params.get("sort") ?? "hot"} onChange={e => e.currentTarget.form?.requestSubmit()}>
        <option value="hot">来源热门</option><option value="featured">本站精选</option><option value="updated">仓库最近更新</option></select>
    </Form>
    <nav className="sm-chips" aria-label="用途分类"><Link to={link("category", "")} className="sm-chip" aria-current={!params.get("category") ? "true" : undefined}>全部用途</Link>
      {Object.entries(SKILL_CATEGORIES).map(([v, label]) => <Link key={v} to={link("category", v)} className="sm-chip" aria-current={params.get("category") === v ? "true" : undefined}>{label}</Link>)}</nav>
    <div className="sm-results sm-muted"><span role="status">{busy ? "正在更新列表…" : `找到 ${result.total} 个 Skills`}</span>
      <span>安装榜快照 {dateLabel(result.snapshotAt)} · 非实时数据</span></div>
    <div aria-busy={busy}>
      {result.items.length ? <div className="sm-grid">{result.items.map(skill => <Link key={skill.id} to={`/skills/${skill.id}?from=${encodeURIComponent(from)}`} state={{ skillsFrom: from }} className="sm-card">
        <div className="sm-card-top"><SkillMark category={skill.data.category} /><div className="min-w-0"><h2>{skill.data.title}</h2><p className="sm-name">{skill.data.name}</p></div></div>
        <p className="sm-summary">{skill.data.summary}</p><div className="sm-tags"><span className="sm-tag">{SKILL_CATEGORIES[skill.data.category]}</span>
          {skill.data.clients.map(c => <span className="sm-tag" key={c.id}>{SKILL_CLIENTS[c.id]}</span>)}{skill.data.recommendation && <span className="sm-tag sm-featured">本站精选</span>}
          {skill.repository?.archived && <span className="sm-tag">仓库已归档</span>}</div><SkillStats skill={skill} />
        <p className="sm-muted mt-2 text-[11px]">{skill.repo}</p></Link>)}</div>
      : <section className="sm-empty"><h2>{params.size ? "没有找到匹配的 Skills" : "目录正在准备中"}</h2><p>{params.size ? "试试更短的关键词，或查看全部用途。" : "完成首批资料导入后，Skills 会显示在这里。"}</p><Link to="/skills" className="sm-link">查看全部 Skills</Link></section>}
    </div>
    {(pages > 1 || result.page > 1) && <nav className="sm-pagination" aria-label="Skills 分页">{result.page > 1 && <Link to={link("page", String(result.page - 1))} className="sm-button">上一页</Link>}
      <span>第 {result.page} 页 / 共 {pages} 页</span>{result.page < pages && <Link to={link("page", String(result.page + 1))} className="sm-button">下一页</Link>}</nav>}
    <p className="sm-muted mt-5">安装量来自 skills.sh CLI 遥测；Stars 为整个仓库的关注度。客户端标签表示提供安装入口，具体依赖与兼容说明见详情。</p>
  </div></>;
}
