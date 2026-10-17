import { Form, Link, isRouteErrorResponse, useLoaderData, useNavigation, useRevalidator, useRouteError, type LoaderFunctionArgs } from "react-router";
import { IDEA_CATEGORIES, IDEA_STATUS_LABELS, type IdeasEdition } from "@aihot/contracts/ideas";
import { beijingDate } from "@aihot/contracts/time";
import { cachedPage, loadOr404, pageHeaders } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { IconSparkles } from "@aihot/web/components/icons";
import "./ideas.css";

export const handle: Screen = { tab: "me", name: "创意集市" };
export const headers = pageHeaders;
export function meta() { return pageMeta({ title: "创意集市", path: "/ideas" }); }
export async function loader({ request }: LoaderFunctionArgs) {
  const date = new URL(request.url).searchParams.get("date");
  return cachedPage(0, { edition: await loadOr404<IdeasEdition>(`/api/site/ideas${date ? `?date=${encodeURIComponent(date)}` : ""}`, { signal: request.signal }) });
}
export function ErrorBoundary() {
  const error = useRouteError(), reload = useRevalidator(), badDate = isRouteErrorResponse(error) && error.status === 400;
  return <section className="ideas-page ideas-empty" role="alert"><h1>{badDate ? "这个日期不可用" : "创意集市暂时无法加载"}</h1>
    <p>{badDate ? "请选择不晚于今天的有效日期。" : "请稍后重新加载，已生成的创意仍会保留。"}</p>
    <Link className="ideas-link" to="/ideas">返回今天</Link>{!badDate && <button className="ideas-button" disabled={reload.state !== "idle"} onClick={() => reload.revalidate()}>重新加载</button>}</section>;
}
function EmptyEdition({ edition: e }: { edition: IdeasEdition }) {
  const waiting = e.status === "queued" || e.status === "running";
  const title = e.status === "outdated" ? "新闻依据有变，这期创意待更新" : waiting ? "这一期创意正在准备中" : e.status === "failed" ? "这一期暂未生成完成"
    : !e.currentSourceCount ? "这一天还没有可用新闻" : e.status === "empty" ? "这一天暂未发现适合尝试的创意" : "有新闻了，创意还在准备中";
  const description = e.status === "outdated" ? "相关报道已更正或撤回，旧推演已隐藏。" : waiting ? "生成任务由后台处理，可以稍后刷新查看。"
    : e.status === "failed" ? "可先阅读往期，后台修复后会继续生成。" : !e.currentSourceCount ? "先看看最近一期，或浏览已有 AI 动态。这里不会用旧新闻替代当天资料。"
    : e.status === "empty" ? "资料不足时保持留白。先读新闻，也许你能发现更合适的切口。" : "完成当日分析后会列在这里，可先读新闻或查看往期。";
  const recent = e.dates.find(d => d !== e.date), newsDate = e.sourceDates.find(d => d !== e.date);
  return <section className="ideas-empty"><IconSparkles size={28} /><h2>{title}</h2><p>{description}</p>
    <div className="ideas-empty-links">{recent && <Link className="ideas-button ideas-primary" to={`/ideas?date=${recent}`}>查看最近一期 · {recent}</Link>}
      {!recent && newsDate && <Link className="ideas-link" to={`/ideas?date=${newsDate}`}>最近有新闻 · {newsDate}</Link>}
      <Link className="ideas-link" to="/all">浏览 AI 动态 ↗</Link></div></section>;
}
export default function Ideas() {
  const { edition: e } = useLoaderData<typeof loader>(), navigation = useNavigation(), reload = useRevalidator();
  const busy = navigation.state !== "idle" || reload.state !== "idle";
  return <><PhoneBar title="创意集市" /><div className="ideas-page">
    <header className="ideas-header"><div className="ideas-eyebrow"><IconSparkles size={16} /> AI 灵感 <span>国内业务 · 个人与小团队</span></div>
      <h1 data-page-title="">创意集市</h1><p>从今天的 AI 新闻里，发现值得尝试的新想法。</p></header>
    <div className="ideas-datebar"><Form method="get" key={e.date} className="ideas-dateform">
      <label htmlFor="ideas-date">新闻日期</label><input className="ideas-date" id="ideas-date" type="date" name="date" defaultValue={e.date} max={e.today} required />
      <button className="ideas-button" type="submit" disabled={busy}>查看</button></Form>
      <div className="ideas-date-actions">{e.date !== e.today && <Link className="ideas-link" to="/ideas">回到今天</Link>}
        <button className="ideas-refresh" disabled={busy} onClick={() => reload.revalidate()}>刷新内容</button></div></div>
    <div className="ideas-meta" role="status">{busy ? "正在加载这一天的创意…" : <><span>{e.date === e.today ? "今天" : "往期"} · {e.date}（北京时间）</span>
      <span>{e.ideas.length ? `${e.ideas.length} 个创意 · 参考 ${e.sourceCount} 条新闻` : IDEA_STATUS_LABELS[e.status]}</span></>}</div>
    {e.dates.length > 0 && <nav className="ideas-archive" aria-label="往期创意">{e.dates.slice(0, 7).map(date => <Link key={date} className="ideas-date-chip" aria-current={date === e.date ? "page" : undefined} to={`/ideas?date=${date}`}>{date.slice(5)}</Link>)}</nav>}
    <p className="ideas-note">依据本站采集的新闻摘要生成，每条附具体出处。创意、目标客户与收费方式是 AI 推演，尚未经市场验证。</p>
    {e.hiddenCount > 0 && <p className="ideas-notice" role="status">{e.hiddenCount} 个创意的新闻依据已变更，暂时隐藏，等待重新分析。</p>}
    {e.ideas.length > 0 && ["queued", "running", "failed"].includes(e.status) && <p className="ideas-notice" role="status">{IDEA_STATUS_LABELS[e.status]}，以下为上次生成且依据仍有效的创意。</p>}
    {e.ideas.length ? <ol className="ideas-list">{e.ideas.map((idea, index) => <li key={`${e.date}-${index}`}>
      <article className={`idea-card${index === 0 ? " idea-first" : ""}`}>
        <div className="idea-top"><span className="idea-rank">{String(index + 1).padStart(2, "0")}</span><span className="idea-category">{IDEA_CATEGORIES[idea.category]}</span>{index === 0 && <span className="idea-priority">优先看看</span>}</div>
        <h2>{idea.title}</h2><p className="idea-audience"><span>服务谁</span>{idea.audience}</p><p className="idea-proposal">{idea.proposal}</p>
        <section className="idea-origin"><h3>为什么提出这个创意 <span>AI 归纳</span></h3><p>{idea.whyNow}</p>
          <ul aria-label="创意的新闻来源">{idea.sources.map(source => <li key={source.id}><span>{source.source} · {beijingDate(source.at)}</span>
            <a className="ideas-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>)}</ul></section>
        <div className="idea-firststep"><span>今天第一步</span><p>{idea.firstStep}</p></div>
        <details className="idea-details"><summary>验证方案与新闻依据</summary><div className="idea-detail-body">
          <section><h3>待验证的问题</h3><p>{idea.problem}</p></section>
          <section><h3>先做一个小实验</h3><ol className="idea-steps">{idea.validation.map((step, n) => <li key={n}>{step}</li>)}</ol>
            <dl className="idea-signals"><div><dt>继续的信号</dt><dd>{idea.successSignal}</dd></div><div><dt>停下的信号</dt><dd>{idea.stopSignal}</dd></div></dl></section>
          <div className="idea-pair"><section><h3>投入粗估</h3><p>{idea.effort}</p></section><section><h3>收费假设</h3><p>{idea.monetization}</p></section></div>
          <section><h3>还需要确认</h3><ul className="idea-uncertainties">{idea.uncertainties.map((risk, n) => <li key={n}>{risk}</li>)}</ul></section>
          <section className="idea-sources"><h3>新闻依据 · {idea.sources.length} 条</h3><ul>{idea.sources.map(source => <li key={source.id}>
            <Link className="ideas-link" to={`/items/${encodeURIComponent(source.id)}`}>{source.title}</Link><p className="idea-source-meta">{source.source} · {beijingDate(source.at)} · <a href={source.url} target="_blank" rel="noopener noreferrer">阅读原文 ↗</a></p>
            <p className="idea-source-summary">{source.summary}</p></li>)}</ul></section>
        </div></details>
      </article></li>)}</ol> : <EmptyEdition edition={e} />}
    {e.generatedAt && <footer className="ideas-footer">生成于 {new Date(e.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间） · 新闻日期按本站动态时间归档</footer>}
  </div></>;
}
