import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import { apiGet, cachedPage, pageHeaders } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { ResetEvent, ResetPost, ResetResponse } from "../contracts";
import { beijingDay, eventDay, resetSummary } from "../data";
import { Empty, External, field, formatTime, SyncState, ToolLinks } from "./shared";
import "./reset.css";

export const handle: Screen = { tab: "me", name: "Tibo 重置监控" };
export const headers = pageHeaders;
export function meta() { return pageMeta({ title: "Tibo 重置监控", path: "/codex-reset", noindex: true }); }
export async function loader({ request, params }: { request: Request; params: { date?: string } }) {
  const date = params.date;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Response("Not found", { status: 404 });
  return cachedPage(0, { snapshot: await apiGet<ResetResponse>("/api/site/ai-tools/codex-reset", { signal: request.signal }), date: date ?? null, now: Date.now() });
}
export default function ResetPage() {
  const { snapshot, date, now } = useLoaderData<typeof loader>();
  return <ResetView snapshot={snapshot} date={date} now={now} />;
}
function confirmed(e: ResetEvent) { return e.status === "confirmed" && e.presentation.status === "confirmed"; }
function dayLabel(day: string) { return `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`; }
function eventLabel(e: ResetEvent) { return e.type === "reset_credit" ? "发重置卡" : e.type === "direct_reset" ? "额度重置" : e.displayLabel; }

function ResetView({ snapshot, date, now }: { snapshot: ResetResponse; date: string | null; now: number }) {
  const today = beijingDay(new Date(now).toISOString()), selected = date ?? today, data = snapshot.data;
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [kind, setKind] = useState("all"), [language, setLanguage] = useState<"zh" | "original">("zh");
  const keyboardDate = useRef<string | null>(null), calendar = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => { setMonth(selected.slice(0, 7)); }, [selected]);
  useEffect(() => {
    if (keyboardDate.current === selected) {
      const link = calendar.current?.querySelector<HTMLAnchorElement>(`[data-day="${selected}"]`);
      if (link) { link.focus({ preventScroll: true }); keyboardDate.current = null; }
    }
  }, [selected, month]);
  const stats = data ? resetSummary(data, today) : null;
  const lastDay = stats?.lastReset ? eventDay(stats.lastReset) : null;
  const events = data?.events.filter(e => eventDay(e) === selected && (kind === "all" || e.type === kind)) ?? [];
  const activities = data?.activities.filter(a => beijingDay(a.publishedAt) === selected) ?? [];
  const old = !data?.monitor.lastVerifiedAt || now - Date.parse(data.monitor.lastVerifiedAt) > 30 * 60000;
  const attention = !!data && (old || data.monitor.status !== "healthy" || !!data.outage);
  const allDays = [...new Set([...(data?.events.map(eventDay) ?? []), ...(data?.activities.map(a => beijingDay(a.publishedAt)) ?? [])])].sort();
  const minMonth = (allDays[0] ?? today).slice(0, 7), maxMonth = [...allDays, today].sort().at(-1)!.slice(0, 7);
  const [year, m] = month.split("-").map(Number), firstDay = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate(), cells = Math.ceil((firstDay + days) / 7) * 7;
  const monthly = data?.events.filter(e => eventDay(e).startsWith(month) && confirmed(e)) ?? [];
  const featured = stats?.announced[0] ?? stats?.lastReset;
  const featuredPost = featured?.posts.find(p => /确认|confirm/i.test(p.stage ?? "")) ?? featured?.posts[0];
  function moveMonth(offset: number) { setMonth(new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7)); }
  function selectDay(day: string) { setMonth(day.slice(0, 7)); navigate(`/codex-reset/history/${day}`, { preventScrollReset: true }); }
  function onCalendarKey(e: KeyboardEvent<HTMLAnchorElement>, day: string) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in step)) return;
    const next = new Date(Date.parse(`${day}T12:00:00Z`) + step[e.key] * 86400000).toISOString().slice(0, 10);
    if (next.slice(0, 7) < minMonth || next.slice(0, 7) > maxMonth) return;
    e.preventDefault(); keyboardDate.current = next; selectDay(next);
  }
  return <div className="reset-watch pb-8"><PhoneBar title="Tibo 重置监控" back={{ to: "/more", label: "我的" }} />
    <header className="flex flex-col gap-1 pb-4 pt-3 lg:flex-row lg:items-end lg:justify-between lg:pt-1"><div><h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3]">Tibo 重置监控</h1><p className="mt-1.5 text-[13px] text-ink-3">Codex 额度重置与重置卡发放：什么时候生效、给谁、Tibo 原话</p></div><p className="text-[12px] text-ink-4">全部为北京时间 · UTC+8</p></header>
    {!data || !stats ? <Empty>重置记录正在等待首次同步。可先查看 <External href="https://aihot.news/codex-reset">来源监控页</External>。</Empty> : <>
      <section className="reset-wash grid items-center gap-5 rounded-sheet border border-line-strong p-4 sm:p-6 lg:grid-cols-2 lg:gap-8 lg:p-8">
        <div className="min-w-0"><p className="inline-flex items-center gap-2 text-[13px] font-medium text-ok-ink"><span className="reset-dot shrink-0" aria-hidden="true" />{stats.announced.length ? `有 ${stats.announced.length} 条公告等待确认` : "当前没有等待生效的重置"}</p>
          <h2 className="mt-3 text-[20px] font-[650] leading-[1.25] sm:text-[24px]">{stats.announced[0]?.title ?? (lastDay ? `上一次额度重置：${dayLabel(lastDay)}确认` : "暂无已确认的额度重置")}</h2>
          <p className="mt-2 text-[13px] leading-[1.75] text-ink-4">{stats.announced[0] ? `${stats.announced[0].schedule?.label ?? "生效时间尚未明确"}。预告不等于已完成，以后续确认与账号用量为准。` : "确认帖日期不代表精确到账时间。不预测尚未宣布的下一次重置。Tibo 一旦宣布，这里会显示预计生效时间与原帖。"}</p>
          {attention && <p role="status" className="mt-3 text-[12px] leading-6 text-amber-ink">来源核验需要关注：最近完整核验 {formatTime(data.monitor.lastVerifiedAt)}。待处理 {data.monitor.pendingCount}，待复核 {data.monitor.reviewCount}，暂缓窗口 {data.monitor.heldWindowCount}。</p>}
        </div>
        {featuredPost && <PostCard post={featuredPost} language={language} featured />}
      </section>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">{[["近 90 天额度重置", `${stats.resets} 次`], ["近 90 天发重置卡", `${stats.credits} 次`], ["重置间隔中位数", stats.medianDays === null ? "—" : `${stats.medianDays} 天`], ["上次额度重置", lastDay ? dayLabel(lastDay) : "—"]].map(([label, value]) => <div key={label} className="bg-surface px-4 py-3"><dt className="text-[12px] text-ink-4">{label}</dt><dd className="num mt-1 text-[18px] font-semibold">{value}</dd></div>)}</dl>
      <section className="mt-8" aria-labelledby="calendar-title"><h2 id="calendar-title" className="text-[18px] font-bold">重置日历</h2><p className="mt-1 text-[12.5px] text-ink-3">点日期查看当天的重置、发卡和 Tibo 原帖。</p>
        <div className="mt-4 overflow-hidden rounded-card border border-line-strong bg-surface lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,1fr)] xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
          <div className="px-3 py-[18px] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="num text-[18px] font-[650]">{year} 年 {m} 月</h3><div className="flex items-center gap-0.5"><button className="mr-1 h-8 rounded-full px-3 text-[12px] text-ink-3 hover:bg-bg-sunk" onClick={() => selectDay(allDays.filter(day => day <= today).at(-1) ?? today)}>最近记录</button><button className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-bg-sunk disabled:opacity-35" aria-label="上个月" disabled={month <= minMonth} onClick={() => moveMonth(-1)}>‹</button><button className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-bg-sunk disabled:opacity-35" aria-label="下个月" disabled={month >= maxMonth} onClick={() => moveMonth(1)}>›</button></div></div>
            <p className="num mb-4 mt-3 text-[12px] text-ink-4">本月 <strong className="font-semibold text-ink-3">{monthly.filter(e => e.type === "direct_reset").length}</strong> 次额度重置 · <strong className="font-semibold text-ink-3">{monthly.filter(e => e.type === "reset_credit").length}</strong> 次发重置卡</p>
            <div ref={calendar} aria-label="选择记录日期"><div className="grid h-[26px] grid-cols-7 items-center text-center text-[12px] text-ink-4">{["一", "二", "三", "四", "五", "六", "日"].map(d => <span key={d}>{d}</span>)}</div>
              <div className="mt-1 grid grid-cols-7 gap-[3px] sm:gap-1">{Array.from({ length: cells }, (_, i) => {
                const day = new Date(Date.UTC(year, m - 1, i - firstDay + 1)).toISOString().slice(0, 10);
                const dayEvents = data.events.filter(e => eventDay(e) === day), hasPosts = data.activities.some(a => beijingDay(a.publishedAt) === day);
                const active = dayEvents.find(confirmed) ?? dayEvents[0], status = active ? confirmed(active) ? "confirmed" : active.presentation.status === "likely_completed" ? "inferred" : "announced" : "plain";
                const label = active ? eventLabel(active) : hasPosts ? "相关原帖" : "";
                const tones = { confirmed: "bg-[var(--cal-confirmed)]", inferred: "bg-[var(--cal-inferred)]", announced: "bg-[var(--cal-announced)]", plain: "bg-[var(--cal-plain)]" };
                return <Link to={`/codex-reset/history/${day}`} preventScrollReset key={day} data-day={day} aria-current={selected === day ? "date" : undefined} aria-label={`${day}${day === today ? "，今天" : ""}${label ? `，${label}${status === "inferred" ? "，来源推断未确认" : ""}` : "，无记录"}`} onKeyDown={e => onCalendarKey(e, day)}
                  className={`relative flex min-h-[62px] min-w-0 flex-col items-center gap-1.5 rounded-control border px-0 pb-1.5 pt-2.5 transition-colors sm:min-h-[70px] sm:rounded-tile sm:px-0.5 ${tones[status]} ${selected === day ? "border-accent ring-1 ring-inset ring-accent" : "border-transparent hover:border-line-strong"} ${day.startsWith(month) ? "" : "opacity-[0.38]"}`}>
                  <span className={`num relative text-[13px] font-medium leading-5 ${day > today ? "text-ink-4" : "text-ink"}`}>{Number(day.slice(8))}{day === today && <span aria-hidden="true" className="absolute -right-2 top-0.5 size-1 rounded-full bg-accent" />}</span>
                  {label && <span className={`max-w-full truncate rounded-full px-[3px] text-[10px] font-medium leading-4 sm:px-1.5 sm:text-[11px] ${status === "confirmed" ? "bg-ok-ink/[0.14] text-ok-ink" : status === "announced" ? "bg-amber-ink/10 text-amber-ink" : "bg-bg-sunk text-ink-3"}`}>{label}{dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ""}</span>}
                </Link>;
              })}</div>
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-ink-4"><li><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-ok-ink/30" />已确认生效</li><li><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-ink-4/20" />来源推断 · 未确认</li><li><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-amber-ink/30" />已宣布 · 等待确认</li></ul>
          </div>
          <section aria-label="当天记录" className="min-w-0 border-t border-line bg-[var(--panel-quiet)] p-4 sm:p-6 lg:border-l lg:border-t-0"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[20px] font-semibold">{dayLabel(selected)}{selected === today && <span className="ml-2 text-[12px] font-normal text-accent">今天</span>}</h3><span className="num text-[12px] text-ink-4">{selected.slice(0, 4)}</span></div>
            <div className="my-4 flex flex-wrap items-center gap-2"><select aria-label="记录类型" value={kind} onChange={e => setKind(e.target.value)} className={`${field} min-w-0 text-xs`}><option value="all">全部类型</option><option value="direct_reset">额度重置</option><option value="reset_credit">发重置卡</option></select><button className="h-9 rounded-full px-3 text-[12px] text-accent hover:bg-bg-sunk" onClick={() => setLanguage(language === "zh" ? "original" : "zh")}>{language === "zh" ? "查看英文" : "查看中文"}</button></div>
            <p role="status" className="sr-only">已选择 {selected}，{events.length + activities.length} 条记录。</p>
            <div className="space-y-4">{events.map(e => <EventCard key={e.id} event={e} language={language} now={now} />)}
              {!events.length && !activities.length && <div className="py-10 text-center"><p className="text-[15px] font-medium">这一天没有记录</p><p className="mx-auto mt-2 max-w-64 text-[12.5px] leading-6 text-ink-4">暂未收录这一天的重置或发卡记录。点日历上带标签的日期查看已有记录。</p></div>}
              {activities.map(p => <details key={p.id} className="rounded-card border border-line bg-surface p-4"><summary className="cursor-pointer break-words text-[13px] leading-6"><span className="mr-2 text-[12px] text-ink-4">{formatTime(p.publishedAt)}</span>{(language === "zh" ? p.text : p.originalText).slice(0, 95)}</summary><div className="mt-3"><PostCard post={p} language={language} /></div></details>)}
            </div>
          </section>
        </div>
      </section>
      <section className="mt-6 rounded-card border border-line p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">时间与状态是怎么判断的？</h2><External href="https://aihot.news/codex-reset" className="text-[12px] text-accent">来源与规则</External></div>
        <div className="mt-3 space-y-2 text-[12.5px] leading-[1.8] text-ink-3"><p>时间按来源公布的时区换算为北京时间。预计时间只供参考，以 Tibo 后续确认和你 Codex 中的用量为准。</p><p>已确认、来源推断、等待确认分别标记。来源推断完成的旧记录不计入已确认次数；发重置卡不等于立即恢复额度。</p><p>近 90 天统计仅包含明确确认的记录，间隔中位数按这些重置日期计算，不用于预测下一次重置。{stats.inferred.length > 0 && `另有 ${stats.inferred.length} 条历史记录由来源推断完成，可在日历中查看依据。`}</p><p>本地每 10 分钟核对近期记录，完整历史每天核对。个人额度和重置卡余额请在 Codex 内查看。</p></div>
      </section>
      <footer className="mt-5 text-[12px] leading-6 text-ink-4"><p className={attention ? "text-amber-ink" : "text-ok-ink"}>{attention ? "来源核验需要关注" : "来源监控正常"} · 最近检查 {formatTime(data.checkedAt)}</p><p>最近尝试 {formatTime(data.monitor.lastAttemptAt)} · 最近采集 {formatTime(data.monitor.lastCollectedAt)} · 最近完整核验 {formatTime(data.monitor.lastVerifiedAt)}</p><p>完整历史核对 {formatTime(snapshot.historyCheckedAt)}{snapshot.historyError ? ` · ${snapshot.historyError}` : ""}</p><p>AIHOT 整理的数据 · 非 OpenAI 官方页面</p></footer>
    </>}
    <div className="mt-5"><SyncState snapshot={{ ...snapshot, sourceUrl: "https://aihot.news/codex-reset" }} now={now} maxAge={30 * 60000} sourceAt={data?.checkedAt} /><ToolLinks /></div>
  </div>;
}

function EventCard({ event: e, language, now }: { event: ResetEvent; language: "zh" | "original"; now: number }) {
  const done = confirmed(e), elapsed = !done && e.schedule?.through && Date.parse(e.schedule.through) < now;
  return <article className="min-w-0 rounded-card border border-line bg-surface p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[12px] text-ink-4">{eventLabel(e)}</span><span className={`rounded-full px-2.5 py-1 text-[11px] ${done ? "bg-ok-ink/10 text-ok-ink" : "bg-bg-sunk text-ink-3"}`}>{done ? "来源已确认" : e.presentation.status === "likely_completed" ? "来源推断完成 · 未确认" : elapsed ? "预计时间已过 · 未确认" : "预告 · 未确认"}</span></div>
    <h4 className="text-[15px] font-semibold leading-6">{e.title}</h4><p className="mt-2 text-[12px] leading-6 text-ink-3">{e.presentation.scopeKnown ? e.presentation.scopeLabel ?? e.scope : "适用范围未明确"}{e.presentation.kindExplicit ? "" : " · 重置形式未明确"}</p>
    {e.schedule?.label && <p className="mt-1 text-[12px] leading-6 text-ink-4">{e.schedule.label}{done ? "（此前预告）" : ""}</p>}
    {e.posts[0] && <div className="mt-3"><PostCard post={e.posts[0]} language={language} /></div>}
    {e.posts.length > 1 && <details className="mt-3"><summary className="cursor-pointer text-[12px] text-accent">展开 {e.posts.length - 1} 条预告与后续依据</summary><div className="mt-3 space-y-3">{e.posts.slice(1).map(p => <PostCard key={p.id} post={p} language={language} />)}</div></details>}
  </article>;
}
function PostCard({ post: p, language, featured = false }: { post: ResetPost; language: "zh" | "original"; featured?: boolean }) {
  const [original, setOriginal] = useState(false);
  return <article className={`min-w-0 rounded-card border border-line-strong bg-surface p-4 ${featured ? "sm:px-6" : ""}`}><header className="flex items-center gap-2.5"><img src="/ai-tools-assets/tibo.jpg" alt="" width="36" height="36" loading="lazy" decoding="async" className="size-9 shrink-0 rounded-full bg-bg-sunk object-cover" /><span className="min-w-0 flex-1 leading-tight"><strong className="block text-[13px] font-semibold">Tibo</strong><small className="block text-[12px] text-ink-4">@thsottiaux</small></span><span className="rounded-full bg-bg-sunk px-2 py-0.5 text-[12px] text-ink-4">{p.stage ?? "相关原帖"}</span></header>
    <blockquote className={`mt-3 whitespace-pre-wrap leading-[1.75] text-ink [overflow-wrap:anywhere] ${featured ? "text-[15px] sm:text-[18px]" : "text-[13px]"}`}>{language === "zh" ? p.fullText ?? p.text : p.fullOriginalText ?? p.originalText}</blockquote>
    {p.context.map(c => <div key={`${c.relation}-${c.id}`} className="mt-3 border-l-2 border-line-strong pl-3"><div className="text-[12px] text-ink-4"><External href={c.url}>{c.relation === "quote" ? "引用" : "回复"} @{c.author}</External></div><p className="mt-0.5 whitespace-pre-line text-[13px] leading-[1.75] text-ink-3 [overflow-wrap:anywhere]">{language === "zh" ? c.text ?? c.originalText : c.originalText}</p></div>)}
    <footer className="mt-3 flex items-center justify-between gap-3 text-[12px] text-ink-4"><time className="num" dateTime={p.publishedAt}>{formatTime(p.publishedAt)}</time><External href={p.url}>在 X 查看</External></footer>
    {language === "zh" && <><button type="button" aria-expanded={original} onClick={() => setOriginal(!original)} className="mt-3 flex w-full items-center gap-1 border-t border-line pt-3 text-left text-[12px] text-ink-4 hover:text-ink-2">{original ? "▾" : "▸"} 英文原文</button>{original && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-7 text-ink-3 [overflow-wrap:anywhere]">{p.fullOriginalText ?? p.originalText}</p>}</>}
  </article>;
}
