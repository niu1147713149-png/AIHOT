import { useMemo, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage, pageHeaders } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { Sheet } from "@aihot/web/components/ui/Sheet";
import { IconFilter, IconInfo } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { Leaderboard, Snapshot } from "../contracts";
import { boardEntries, frontier, scenarioCost } from "../data";
import { button, Empty, External, field, formatTime, money, SyncState, ToolLinks } from "./shared";
import { ModelIcon } from "./ModelIcon";
import { CostChart } from "./CostChart";

export const handle: Screen = { tab: "models", name: "模型榜" };
export const headers = pageHeaders;
export function meta() { return pageMeta({ title: "模型榜", path: "/leaderboard", noindex: true }); }
export async function loader({ request, params }: { request: Request; params: { category?: string } }) {
  const category = params.category ?? "overall";
  if (!["overall", "coding", "reasoning", "professional", "knowledge"].includes(category)) throw new Response("Not found", { status: 404 });
  return cachedPage(0, { snapshot: await apiGet<Snapshot<Leaderboard>>("/api/site/ai-tools/leaderboard", { signal: request.signal }), category, now: Date.now() });
}

export default function LeaderboardPage() {
  const { snapshot, category, now } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const domestic = params.get("domestic") === "1", open = params.get("open") === "1", query = params.get("q") ?? "";
  const costView = params.get("view") === "cost";
  const sort = params.get("sort") ?? "rank";
  const descending = params.has("direction") ? params.get("direction") === "desc" : ["newest", "evidence"].includes(sort);
  const [filtersOpen, setFiltersOpen] = useState(false), [scoreOpen, setScoreOpen] = useState(false);
  const [cache, setCache] = useState(0.5), [output, setOutput] = useState(0.25);
  const [customCost, setCustomCost] = useState(false);
  const scenarios: Record<string, { cached: number; input: number; output: number; label: string; ratio: string }> = {
    overall: { cached: 0.7, input: 0.2, output: 0.1, label: "一般用量", ratio: "7 : 2 : 1" },
    coding: { cached: 0.97, input: 0.02, output: 0.01, label: "编程 Agent 长时间工作", ratio: "97 : 2 : 1" },
    reasoning: { cached: 0, input: 0.25, output: 0.75, label: "攻克难题，思考算作输出", ratio: "0 : 1 : 3" },
    professional: { cached: 0.7, input: 0.2, output: 0.1, label: "多步骤的文件工作", ratio: "7 : 2 : 1" },
    knowledge: { cached: 0, input: 0.75, output: 0.25, label: "一问一答", ratio: "0 : 3 : 1" },
  };
  const scenario = scenarios[category];
  function change(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true, preventScrollReset: true }); }
  function sortBy(key: string) {
    const next = new URLSearchParams(params);
    next.set("sort", key);
    next.set("direction", sort === key ? descending ? "asc" : "desc" : ["newest", "evidence"].includes(key) ? "desc" : "asc");
    setParams(next, { replace: true, preventScrollReset: true });
  }
  const data = snapshot.data, board = data?.boards.find(b => b.board.key === category);
  const entries = useMemo(() => board && data ? boardEntries(board, data.models, domestic, open, query) : [], [board, data, domestic, open, query]);
  const rows = entries.map(e => ({ ...e, model: data!.models[e.slug], cost: customCost ? scenarioCost(data!.models[e.slug], 1, output, cache)
    : scenarioCost(data!.models[e.slug], scenario.cached + scenario.input, scenario.output, scenario.cached / (scenario.cached + scenario.input)) }));
  rows.sort((a, b) => {
    const direction = descending ? -1 : 1;
    if (sort === "rank") return (a.rank - b.rank) * direction;
    if (sort === "newest") return (a.model.model.releasedAt ?? "").localeCompare(b.model.model.releasedAt ?? "") * direction || a.rank - b.rank;
    const value = (r: typeof a) => sort === "evidence" ? r.sourceCount : sort === "cached" ? r.model.price?.cachedCny : sort === "input" ? r.model.price?.inputCny : sort === "output" ? r.model.price?.outputCny : r.cost;
    const av = value(a), bv = value(b);
    if (av == null || bv == null) return av == null ? bv == null ? a.rank - b.rank : 1 : -1;
    return (av - bv) * direction || a.rank - b.rank;
  });
  const points = rows.flatMap(e => e.cost === null ? [] : [{ slug: e.slug, name: e.model.model.name, cost: e.cost, score: e.score, rank: e.rank, model: e.model }]);
  const edge = frontier(points);
  const pending = board?.pending.filter(e => { const m = data!.models[e.slug]; return (!domestic || m.access.domestic) && (!open || !!m.access.weightsUrl) && `${m.model.name} ${m.model.provider}`.toLowerCase().includes(query.trim().toLowerCase()); }) ?? [];

  const labels: Record<string, string> = { overall: "综合", coding: "编程", reasoning: "科研", professional: "专业办公", knowledge: "知识问答" };
  const filterCount = Number(domestic) + Number(open) + Number(!!query);
  const chip = "inline-flex h-11 lg:h-8 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[13px] text-ink-2 transition-colors hover:border-ink-4";
  const filterControls = <><Filter checked={domestic} onClick={() => change("domestic", domestic ? "" : "1")}>国产模型</Filter><Filter checked={open} onClick={() => change("open", open ? "" : "1")}>开源模型</Filter></>;
  function sortHeader(key: string, label: string, price = false) {
    return <th scope="col" aria-sort={sort === key ? descending ? "descending" : "ascending" : "none"} className={`hidden px-3 py-2.5 text-left font-medium lg:table-cell ${price ? "w-[12%]" : "w-[9%]"}`}>
      <button type="button" onClick={() => sortBy(key)} className={`group/sort inline-flex items-start gap-1 text-left hover:text-ink ${sort === key ? "text-accent" : ""}`}><span>{label}{price && <span className="block text-[10.5px] font-normal text-ink-4">人民币 / 百万 Token</span>}</span><span aria-hidden="true" className={`mt-[3px] text-[9px] ${sort === key ? "" : "opacity-0 group-hover/sort:opacity-40"}`}>{sort === key && descending ? "▼" : "▲"}</span></button>
    </th>;
  }
  return <div className="pb-10">
    <PhoneBar title="模型榜" large actions={<Link to="/leaderboard/rules" className="flex h-11 items-center gap-1 px-3 text-[14px] text-accent"><IconInfo size={17} /> 怎么算</Link>} />
      <header className="hidden items-end justify-between gap-3 pb-4 pt-1 lg:flex">
        <div><p className="mono text-[11px] font-semibold tracking-[0.16em] text-accent">{SITE.name}</p><h1 className="mt-1.5 text-[24px] font-semibold leading-[1.3]">AI 模型排行榜</h1></div>
        <div className="flex gap-2"><External className={chip} href="https://aihot.news/leaderboard/sources">评测来源</External><Link to="/leaderboard/rules" className={chip}>排序怎么算 →</Link></div>
      </header>
      {!data || !board ? <Empty>模型榜正在等待首次同步。可先查看 <External href="https://aihot.news/leaderboard">来源榜单</External>。</Empty> : <>
        <div className="bleed lg:mx-0 lg:px-0"><div className="scrollbar-none max-w-full overflow-x-auto"><nav aria-label="模型榜分类" className="inline-flex w-max gap-0.5 rounded-full bg-bg-sunk p-0.5 ring-1 ring-inset ring-line-soft lg:p-[3px] dark:bg-bg-muted/60">{data.boards.map(b => <Link key={b.board.key} aria-current={b.board.key === category ? "page" : undefined}
          className={`inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors lg:h-9 ${b.board.key === category ? "bg-surface text-ink shadow-[var(--shadow-thumb)] ring-1 ring-line dark:bg-raised" : "text-ink-3 hover:text-ink"}`} to={`${b.board.key === "overall" ? "/leaderboard" : `/leaderboard/category/${b.board.key}`}${params.size ? `?${params}` : ""}`}>{labels[b.board.key]}</Link>)}</nav></div></div>
        <div className="mt-3 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between"><p className="text-[13.5px] text-ink-2">{board.board.description}</p><p className="num shrink-0 text-[12px] text-ink-4">{board.board.sourceCount} 项评测<span className="mx-2">·</span>{board.board.operatorCount} 家机构<span className="mx-2">·</span>{formatTime(data.run.generatedAt)} 更新</p></div>
        <section className="card mt-3 overflow-hidden" aria-labelledby="lb-board-title">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 lg:px-[22px]">
          <h2 id="lb-board-title" className="text-[16px] font-bold">{labels[category]}榜<span className="mono ml-2 text-[11px] font-normal tracking-wide text-ink-4">{rows.length} 个模型</span></h2>
          <div className="flex items-center gap-2 lg:gap-3"><div role="group" aria-label="筛选模型（可多选）" className="hidden items-center gap-2 lg:flex">{filterControls}</div>
            <button aria-haspopup="dialog" onClick={() => setFiltersOpen(true)} className={`${chip} ${filterCount ? "text-accent" : ""}`}><IconFilter size={16} className="lg:hidden" /><span className="lg:hidden">筛选{filterCount ? ` ${filterCount}` : ""}</span><span className="hidden lg:inline">搜索{query ? " · 1" : ""}</span></button>
            <div aria-label="查看方式" className="inline-flex gap-0.5 rounded-full bg-bg-sunk p-0.5 ring-1 ring-inset ring-line-soft lg:p-[3px]">{[[false, "榜单"], [true, "斩杀线"]].map(([value, label]) => <button key={String(label)} className={`h-11 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium lg:h-7 ${costView === value ? "bg-surface text-ink shadow-[var(--shadow-thumb)] ring-1 ring-line dark:bg-raised" : "text-ink-3 hover:text-ink"}`} aria-pressed={costView === value} onClick={() => change("view", value ? "cost" : "")}>{label}</button>)}</div>
          </div>
        </div>
        {query && <div className="border-t border-line px-4 py-2 text-xs text-ink-3">搜索：{query}<button onClick={() => change("q", "")} className="ml-3 text-accent">清除</button></div>}
        {costView && <section aria-label="性价比比较" className="border-t border-line p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[13px] leading-6 text-ink-3">斩杀线上是各价位评分最高的模型。{customCost ? "当前按自定义用量计算总成本。" : <>按{scenario.label}折算：缓存命中 : 输入 : 输出 = <b className="mono whitespace-nowrap font-semibold text-ink-2">{scenario.ratio}</b>。</>}</p><button className="text-[12px] text-accent" aria-expanded={customCost} onClick={() => setCustomCost(!customCost)}>{customCost ? "恢复默认场景" : "自定义场景"}</button></div>
          {customCost && <div className="mt-4 flex flex-wrap gap-5 text-sm"><label>缓存命中率 {Math.round(cache * 100)}%<input aria-label="缓存命中率" type="range" min="0" max="100" step="10" value={cache * 100} onChange={e => setCache(Number(e.target.value) / 100)} className="ml-3 max-w-full align-middle" /></label><label>输出量（百万 Token） <select aria-label="输出量" className={field} value={output} onChange={e => setOutput(Number(e.target.value))}><option value="0.1">0.1</option><option value="0.25">0.25</option><option value="0.5">0.5</option><option value="1">1</option></select></label><p className="w-full text-xs text-ink-4">自定义场景输入固定为 100 万 Token，显示此次用量的总成本。</p></div>}
          <CostChart points={points} edge={edge} custom={customCost} />
          <p className="mt-3 text-[12px] leading-6 text-ink-4">{rows.length - points.length > 0 && `${rows.length - points.length} 个模型因价格缺失未参与。`}未计缓存写入、存储、订阅和渠道折扣；官方价为零的模型以零元展示。</p>
        </section>}
        {!costView && (!rows.length ? <Empty>没有符合筛选条件的模型。</Empty> : <table className="w-full table-fixed border-collapse text-[14px]">
          <caption className="sr-only">当前展示 {rows.length} 个模型，可按列重排；名次来自原榜</caption>
          <thead className="bg-[rgba(28,39,51,0.04)] text-[12px] text-ink-4 dark:bg-white/[0.03]"><tr className="border-y border-line">
            <th scope="col" className="w-[60px] py-2.5 pl-4 pr-1 text-left font-medium max-[360px]:w-[46px] max-[360px]:pl-3 lg:w-[86px] lg:pl-[22px] lg:pr-3"><button onClick={() => sortBy("rank")} className={sort === "rank" ? "text-accent" : ""}>名次</button></th>
            <th scope="col" className="px-2 py-2.5 text-left font-medium lg:px-3">模型</th>
            {sortHeader("newest", "上线日期")}{sortHeader("evidence", "评测证据")}{sortHeader("cached", "缓存价格", true)}{sortHeader("input", "输入价格", true)}{sortHeader("output", "输出价格", true)}
            <th scope="col" className="w-[104px] py-1 pl-0 pr-2 text-right font-medium max-[360px]:w-[78px] lg:w-[11%] lg:py-2.5 lg:pl-3 lg:pr-[22px]"><button aria-haspopup="dialog" onClick={() => setScoreOpen(true)} className="inline-flex h-11 items-center gap-1 whitespace-nowrap text-accent lg:h-auto">来源评分 <span aria-hidden="true" className="inline-flex size-3.5 items-center justify-center rounded-full border text-[9px]">i</span></button></th>
          </tr></thead><tbody>{rows.map(e => <tr key={e.slug} data-slug={e.slug} className="group border-b border-line transition-colors last:border-b-0 hover:bg-accent-softer lg:h-[65px]">
            <td className="py-2.5 pl-4 pr-1 align-middle max-[360px]:pl-3 lg:py-3 lg:pl-[22px] lg:pr-3"><span className="mono text-[13px] text-ink-4">{String(e.rank).padStart(2, "0")}</span></td>
            <td className="px-2 py-2.5 lg:px-3 lg:py-3"><span className="flex items-center gap-3 max-[360px]:gap-2"><ModelIcon provider={e.model.model.provider} /><span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2"><Link to={`/leaderboard/${e.slug}`} className="text-[15px] font-[650] leading-[21px] text-ink transition-colors group-hover:text-accent">{e.model.model.name}</Link>{e.model.access.weightsUrl && <External href={e.model.access.weightsUrl} className="whitespace-nowrap text-[10.5px] text-accent">开源权重</External>}</span>
              <small className="hidden text-[12px] leading-[18px] text-ink-4 lg:block">{e.model.model.provider}</small><small className="block truncate text-[12px] leading-[18px] text-ink-4 lg:hidden">{e.model.model.provider}{e.model.model.releasedAt && <> · {shortDate(e.model.model.releasedAt)}上线</>}</small>
            </span></span></td>
            <td className="mono hidden px-3 py-3 text-[12px] text-ink-3 lg:table-cell"><time dateTime={e.model.model.releasedAt ?? undefined}>{e.model.model.releasedAt ?? "待核验"}</time></td>
            <td className="hidden px-3 py-3 lg:table-cell"><span className="num block text-[13px] text-ink-2">{e.sourceCount} 项评测</span><span className="block text-[11px] leading-[17px] text-ink-4">覆盖 {Math.round(e.coverage * 100)}%</span></td>
            {[e.model.price?.cachedCny, e.model.price?.inputCny, e.model.price?.outputCny].map((p, i) => <td key={i} className="mono hidden px-3 py-3 text-[14.5px] font-medium text-ink lg:table-cell">{p == null ? <span className="font-sans text-[12px] font-normal text-ink-4">待核验</span> : money(p)}</td>)}
            <td className="py-2.5 pl-2 pr-3 text-right align-middle sm:pr-4 lg:py-3 lg:pl-3 lg:pr-[22px]"><strong className="mono block text-[24px] font-semibold leading-7 tracking-[-0.025em] text-accent lg:text-[22px]">{e.score.toFixed(1)}</strong><small className="block text-[11px] leading-[17px] text-ink-4 lg:hidden">覆盖 {Math.round(e.coverage * 100)}%</small></td>
          </tr>)}</tbody></table>)}
        <div className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-4 lg:px-[22px]"><p>{board.board.howToRead}</p><p>评分来自 AIHOT，筛选后保留原榜评分与名次。评分不是正确率；价格不参与排名。</p></div>
        </section>
        {pending.length > 0 && <section className="card mt-3 overflow-hidden"><div className="px-4 py-3 lg:px-[22px]"><h2 className="text-[16px] font-bold">暂不排名<span className="mono ml-2 text-[11px] font-normal tracking-wide text-ink-4">{pending.length} 个模型</span></h2><p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">这些模型已有评分，但评测覆盖尚不足以稳定排名；评测补齐后由来源更新名次。</p></div><ul className="divide-y divide-line border-t border-line">{pending.map(e => <li key={e.slug}><Link to={`/leaderboard/${e.slug}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent-softer lg:px-[22px]"><ModelIcon provider={data.models[e.slug].model.provider} size={28} /><span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-[650] group-hover:text-accent">{data.models[e.slug].model.name}</span><small className="block text-[12px] text-ink-4">{e.reason} · {e.sources} 项评测</small></span><span className="mono text-[18px] font-semibold text-ink-2">{e.score.toFixed(1)}</span></Link></li>)}</ul></section>}
        <div className="mt-5 grid gap-5 text-[12.5px] leading-6 text-ink-3 sm:grid-cols-2"><section><h2 className="mb-1 font-semibold text-ink-2">如何看这张榜</h2><p>参照组的平均水平为 50 分，每 15 分约是一个标准差。未测的评测不补分，也不扣分。</p><Link to="/leaderboard/rules" className="text-accent">了解计算方法 →</Link></section><section><h2 className="mb-1 font-semibold text-ink-2">关于价格</h2><p>厂商官网 API 价格，按每百万 Token 展示。{data.run.fx && `美元报价按 ${data.run.fx.asOf.slice(0, 10)} 汇率折算。`}缓存价格指命中后的输入价格，缓存写入、存储及订阅费用另计。</p></section></div>
        <p className="mt-4 text-[12px] leading-6 text-ink-4">包含原榜前 30 名及来源提供的额外筛选条目。国产标记不等于已核实国内可购买；开源权重的商用条件以许可证为准。</p>
      </>}
      <div className="mt-5"><SyncState snapshot={snapshot} now={now} maxAge={8 * 3600000} sourceAt={data?.run.generatedAt} /><ToolLinks /></div>
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="筛选模型" centered><div className="space-y-5 p-5"><input aria-label="搜索模型" className={`${field} w-full min-w-0`} placeholder="搜索模型、厂商" value={query} onChange={e => change("q", e.target.value)} /><div className="flex flex-wrap gap-2">{filterControls}</div><label className="block text-sm text-ink-3">榜单排序<select aria-label="榜单排序" className={`${field} mt-2 w-full`} value={sort} onChange={e => sortBy(e.target.value)}><option value="rank">原榜名次</option><option value="newest">上线日期</option><option value="evidence">评测证据</option><option value="cached">缓存价格</option><option value="input">输入价格</option><option value="output">输出价格</option><option value="cost">场景成本</option></select></label><button className={`${button} w-full bg-accent text-white`} onClick={() => setFiltersOpen(false)}>查看结果</button></div></Sheet>
      <Sheet open={scoreOpen} onClose={() => setScoreOpen(false)} title="来源评分" centered><div className="p-5 text-sm leading-7 text-ink-3"><p>AIHOT 将第三方评测换算到同一能力刻度：50 分是参照组模型的平均水平，每 15 分约为一个标准差。评分不是正确率；价格不参与排序。</p><Link to="/leaderboard/rules" className="mt-3 inline-block text-accent" onClick={() => setScoreOpen(false)}>查看评分与价格说明 →</Link></div></Sheet>
  </div>;
}

function Filter({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={checked} onClick={onClick} className={`inline-flex h-11 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full border pl-2 pr-3.5 text-[13px] font-medium transition-colors lg:h-8 ${checked ? "border-accent bg-accent/10 text-accent" : "border-line-strong bg-surface text-ink-2 hover:border-ink-4"}`}><span aria-hidden="true" className={`inline-flex size-4 items-center justify-center rounded-full border text-[10px] ${checked ? "border-accent bg-accent text-white" : "border-line-strong"}`}>{checked ? "✓" : ""}</span>{children}</button>;
}
function shortDate(date: string) { const [, month, day] = date.split("-"); return `${Number(month)}月${Number(day)}日`; }
