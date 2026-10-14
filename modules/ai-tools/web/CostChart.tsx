import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Model } from "../contracts";
import { ModelIcon } from "./ModelIcon";
import { money } from "./shared";

interface Point { slug: string; name: string; cost: number; score: number; rank: number; model: Model }
export function CostChart({ points, edge, custom }: { points: Point[]; edge: Set<string>; custom: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(780), [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  const small = width < 640, height = small ? 340 : 460, left = small ? 30 : 40, right = width - 22, bottom = height - 46;
  const sortedEdge = points.filter(p => edge.has(p.slug)).sort((a, b) => a.cost - b.cost);
  const positive = points.filter(p => p.cost > 0).map(p => p.cost), floor = Math.min(0.01, ...positive) / 3;
  const min = Math.log10(points.length ? Math.min(...points.map(p => p.cost || floor)) : 1) - (small ? 0.12 : 0.3);
  const max = Math.log10(positive.length ? Math.max(...positive) : 1) + 0.1;
  const low = (points.length ? Math.min(...points.map(p => p.score)) : 50) - 2, high = (points.length ? Math.max(...points.map(p => p.score)) : 65) + 2.2;
  const x = (cost: number) => left + (Math.log10(cost || floor) - min) / (max - min) * (right - left);
  const y = (score: number) => 30 + (high - score) / (high - low) * (bottom - 30);
  const plotted: Array<Point & { cx: number; cy: number; size: number }> = [];
  // Small horizontal offsets keep close scores selectable; leader lines preserve the true cost.
  for (const p of [...sortedEdge, ...points.filter(p => !edge.has(p.slug)).sort((a, b) => b.score - a.score)]) {
    const size = edge.has(p.slug) ? small ? 26 : 32 : small ? 20 : 22, cy = y(p.score), tx = x(p.cost);
    let cx = tx;
    for (let n = 1; n <= 10 && plotted.some(q => Math.abs(q.cx - cx) < (q.size + size) / 2 + 3 && Math.abs(q.cy - cy) < (q.size + size) / 2 + 3); n++) {
      cx = Math.max(left, Math.min(right, tx + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * (size + 4)));
    }
    plotted.push({ ...p, cx, cy, size });
  }
  const stair = sortedEdge.map((p, i) => i ? `H${x(p.cost)} V${y(p.score)}` : `M${x(p.cost)},${y(p.score)}`).join(" ");
  const labels: Array<{ slug: string; name: string; cost: number; score: number; x: number; y: number; w: number; h: number; align: "left" | "right" }> = [];
  if (!small) for (const p of plotted.filter(p => edge.has(p.slug)).sort((a, b) => b.score - a.score)) {
    const w = Math.min(205, Math.max(p.name.length * 7, 105)), h = 30, gap = p.size / 2 + 8;
    const candidates = [
      { x: p.cx - gap - w, y: p.cy - h / 2, align: "right" as const },
      { x: p.cx + gap, y: p.cy - h / 2, align: "left" as const },
      { x: p.cx - w / 2, y: p.cy - gap - h, align: "left" as const },
      { x: p.cx - w / 2, y: p.cy + gap, align: "left" as const },
    ].map(c => ({ ...c, w, h }));
    const penalty = (box: typeof candidates[number]) => (box.x < left || box.x + w > right || box.y < 18 || box.y + h > bottom ? 1e6 : 0)
      + labels.reduce((sum, label) => sum + overlap(box, label) * 4, 0)
      + plotted.reduce((sum, icon) => sum + overlap(box, { x: icon.cx - icon.size / 2 - 3, y: icon.cy - icon.size / 2 - 3, w: icon.size + 6, h: icon.size + 6 }), 0);
    candidates.sort((a, b) => penalty(a) - penalty(b));
    labels.push({ ...p, ...candidates[0] });
  }
  const selected = plotted.find(p => p.slug === active), better = selected && !edge.has(selected.slug) ? sortedEdge.filter(p => p.cost <= selected.cost && p.score >= selected.score).at(-1) : null;
  const ticks = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000].filter(v => Math.log10(v) >= min && Math.log10(v) <= max);
  return <>
    <div ref={container} className="relative mt-3" style={{ height }} onKeyDown={e => { if (e.key === "Escape") setActive(null); }}>
      {!points.length ? <p className="py-12 text-center text-sm text-ink-3">当前筛选下没有价格完整的模型。</p> : <>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="模型评分与场景成本散点图，横轴为人民币成本的对数刻度，纵轴为来源评分" className="absolute inset-0 size-full text-ink-4">
          {Array.from({ length: Math.ceil((high - low) / 5) }, (_, i) => Math.ceil(low / 5) * 5 + i * 5).filter(v => v <= high).map(v => <g key={v}><line x1={left} x2={right} y1={y(v)} y2={y(v)} className="stroke-line-soft" /><text x={left - 8} y={y(v) + 4} textAnchor="end" className="mono fill-ink-4 text-[11px]">{v}</text></g>)}
          {ticks.map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1="30" y2={bottom} className="stroke-line-soft" /><text x={x(v)} y={bottom + 18} textAnchor="middle" className="mono fill-ink-4 text-[11px]">¥{v}</text></g>)}
          {points.some(p => p.cost === 0) && <text x={x(0)} y={bottom + 18} textAnchor="middle" className="mono fill-ink-4 text-[11px]">¥0</text>}
          <text x="0" y="14" className="fill-ink-4 text-[11.5px]">来源评分 ↑</text><text x={right} y={height - 4} textAnchor="end" className="fill-ink-4 text-[11.5px]">{custom ? "场景总成本（¥）→" : "价格（¥ / 百万 Token）→"}</text>
          {!!sortedEdge.length && <><path d={`${stair} L${x(sortedEdge.at(-1)!.cost)},${bottom} H${x(sortedEdge[0].cost)} Z`} className="fill-accent-softer" /><path d={stair} fill="none" className="stroke-accent" strokeWidth="2" strokeLinejoin="round" /></>}
          {plotted.map(p => <g key={p.slug}>{p.cx !== x(p.cost) && <line x1={x(p.cost)} x2={p.cx} y1={p.cy} y2={p.cy} className="stroke-ink-4 opacity-40" />}<title>{`${p.name} · ${money(p.cost)} · ${p.score} 分`}</title></g>)}
        </svg>
        {plotted.map(p => <button key={p.slug} aria-label={`${p.name}，第 ${p.rank} 名，评分 ${p.score}，折算价 ${money(p.cost)}`} aria-pressed={active === p.slug}
          onPointerEnter={e => { if (e.pointerType === "mouse") setActive(p.slug); }} onFocus={() => setActive(p.slug)} onClick={() => setActive(p.slug)}
          className={`absolute rounded-[9px] transition-[opacity,filter,transform] focus-visible:outline-2 focus-visible:outline-accent ${edge.has(p.slug) ? "z-[2] shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--accent)]" : "opacity-70 grayscale"} ${active === p.slug ? "z-[4] scale-110 opacity-100 grayscale-0" : active ? "opacity-30" : "hover:scale-110 hover:opacity-100 hover:grayscale-0"}`}
          style={{ left: p.cx - p.size / 2, top: p.cy - p.size / 2, width: p.size, height: p.size }}><ModelIcon provider={p.model.model.provider} size={p.size} /></button>)}
        {labels.map(p => <div key={p.slug} aria-hidden="true" className={`pointer-events-none absolute text-[12px] leading-tight [text-shadow:0_0_4px_var(--surface)] ${active && active !== p.slug ? "opacity-20" : ""}`} style={{ left: p.x, top: p.y, width: p.w, textAlign: p.align }}><strong>{p.name}</strong><span className="mono block text-[11px] text-ink-3">{p.score.toFixed(1)} · {money(p.cost)}</span></div>)}
        {selected && <div role="region" aria-label="模型价格详情" className="absolute z-10 w-[248px] max-w-[calc(100%-8px)] rounded-tile border border-line bg-raised p-3.5 text-[12.5px] text-ink-2 shadow-[var(--shadow-pop)]"
          style={{ left: Math.max(4, Math.min(width - 252, selected.cx + 22)), top: selected.cy > height / 2 ? Math.max(24, selected.cy - 224) : selected.cy + 24 }}>
          <div className="flex items-center gap-2.5"><ModelIcon provider={selected.model.model.provider} size={30} /><div className="min-w-0 flex-1"><b className="block truncate text-[14px]">{selected.name}</b><small className="text-[11px] text-ink-4">{selected.model.model.provider} · 第 {selected.rank} 名</small></div><button aria-label="关闭模型价格详情" className="p-1 text-ink-4" onClick={() => setActive(null)}>×</button></div>
          <dl className="mono mt-3 grid grid-cols-2 gap-y-1"><dt>来源评分</dt><dd className="text-right font-semibold text-accent">{selected.score.toFixed(1)}</dd><dt>折算价</dt><dd className="text-right">{money(selected.cost)}</dd><dt>缓存命中</dt><dd className="text-right">{money(selected.model.price?.cachedCny)}</dd><dt>输入 / 输出</dt><dd className="text-right">{money(selected.model.price?.inputCny)} / {money(selected.model.price?.outputCny)}</dd></dl>
          <p className="mt-2 border-t border-line pt-2 text-accent">{edge.has(selected.slug) ? "在斩杀线上：这个价位里评分最高" : better ? `${better.name} 同价或更便宜，评分更高` : "当前筛选内的可比较模型"}</p><Link to={`/leaderboard/${selected.slug}`} className="mt-2 inline-block text-accent">查看模型详情 →</Link>
        </div>}
      </>}
    </div>
    {!!sortedEdge.length && <section className="mt-2 border-t border-line pt-3.5"><h3 className="text-[14px] font-[650]">斩杀线<span className="ml-2 text-[12.5px] font-normal text-ink-4">{sortedEdge.length} 个模型，从便宜到贵</span></h3><ol className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{sortedEdge.map(p => <li key={p.slug}><Link to={`/leaderboard/${p.slug}`} className="flex items-center gap-2 rounded-control p-2 hover:bg-bg-sunk"><ModelIcon provider={p.model.model.provider} size={28} /><span className="min-w-0"><strong className="block truncate text-[12.5px] font-semibold">{p.name}</strong><span className="mono text-[11px] text-ink-3">{money(p.cost)} · {p.score.toFixed(1)} 分</span></span></Link></li>)}</ol></section>}
  </>;
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}
