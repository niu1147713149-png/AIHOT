import { Link, useLoaderData } from "react-router";
import { apiGet, cachedPage, pageHeaders } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { Leaderboard, Snapshot } from "../contracts";
import { External, money, SyncState, ToolLinks } from "./shared";
import { ModelIcon } from "./ModelIcon";

export const handle: Screen = { tab: "models", name: "模型详情" };
export const headers = pageHeaders;
export function meta() { return pageMeta({ title: "模型详情", path: "/leaderboard", noindex: true }); }
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const snapshot = await apiGet<Snapshot<Leaderboard>>("/api/site/ai-tools/leaderboard", { signal: request.signal });
  if (!snapshot.data) throw new Response("模型榜尚未完成同步", { status: 503 });
  const slug = params.slug ?? "";
  if (!snapshot.data.models[slug]) throw new Response("Not found", { status: 404 });
  return cachedPage(0, { snapshot, slug, now: Date.now() });
}
export default function ModelPage() {
  const { snapshot, slug, now } = useLoaderData<typeof loader>();
  const data = snapshot.data!, model = data.models[slug], p = model.price;
  return <><PhoneBar title="模型详情" back={{ to: "/leaderboard", label: "模型榜" }} /><div className="py-5"><ToolLinks />
    <div className="mb-6 flex items-center gap-4"><ModelIcon provider={model.model.provider} size={56} /><div className="min-w-0"><h1 data-page-title="" className="text-2xl font-semibold sm:text-3xl">{model.model.name}</h1><p className="mt-2 text-[13px] text-ink-3">{model.model.provider} · {model.model.releasedAt ?? "发布日期待核验"}</p></div></div>
    <SyncState snapshot={snapshot} now={now} maxAge={8 * 3600000} sourceAt={data.run.generatedAt} />
    <section className="mb-8"><h2 className="mb-4 text-lg font-semibold">各项能力</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{data.boards.map(b => {
      const entry = [...b.entries, ...b.filterEntries].find(e => e.slug === slug), pending = b.pending.find(e => e.slug === slug);
      return <div key={b.board.key} className="rounded-card border border-line p-4"><p className="text-sm text-ink-3">{b.board.name}</p><p className="my-3 text-3xl font-semibold tabular-nums text-accent">{(entry?.score ?? pending?.score)?.toFixed(1) ?? "—"}</p><p className="text-xs text-ink-4">{entry ? `第 ${entry.rank} 名 · ${entry.sourceCount} 项评测` : pending ? "暂不排名" : "当前快照未列出"}</p>{pending && <p className="mt-2 text-xs leading-5 text-ink-4">{pending.reason}</p>}</div>;
    })}</div><p className="mt-4 text-sm text-ink-3">评分来自 AIHOT 的第三方评测汇总；未列出的成绩不视为零分。</p></section>
    <section className="mb-8 rounded-card border border-line p-5"><h2 className="mb-4 text-lg font-semibold">API 价格</h2><div className="grid grid-cols-3 gap-4">{[["输入", p?.inputCny], ["输出", p?.outputCny], ["缓存命中", p?.cachedCny]].map(([label, value]) => <div key={String(label)}><p className="text-sm text-ink-3">{label}</p><p className="my-2 text-xl font-semibold tabular-nums">{money(value as number | null | undefined)}</p><p className="text-xs text-ink-4">人民币 / 百万 Token</p></div>)}</div>
      {p?.officialUrl && <p className="mt-5 text-sm"><External href={p.officialUrl}>官方价格与适用条件</External></p>}{p?.note && <p className="mt-3 text-sm text-ink-3">{p.note}</p>}
      <p className="mt-3 text-xs leading-6 text-ink-4">{data.run.fx ? `外币换算参考 ${data.run.fx.asOf}，${data.run.fx.sourceName}：1 美元 = ${data.run.fx.rate} 元。` : "汇率信息未提供。"}此处不是 JarlessAPI 实际渠道报价；不含订阅、缓存写入及存储费用。</p></section>
    <section className="mb-8"><h2 className="mb-3 text-lg font-semibold">访问与证据</h2><p className="text-sm leading-7 text-ink-3">来源标记：{model.access.domestic ? "国产模型" : "海外模型"}。国内可用地区、开户条件和商用许可，请以厂商说明为准。</p><div className="mt-3 flex flex-wrap gap-5 text-sm">{model.access.weightsUrl && <External href={model.access.weightsUrl}>开放权重与许可证</External>}<External href={`https://aihot.news/leaderboard/${slug}`}>原始评测证据与完整资料</External><Link to="/leaderboard/rules" className="text-accent">评分方法</Link></div></section>
    <Link to="/leaderboard" className="text-sm text-accent">← 返回模型榜</Link>
  </div></>;
}
