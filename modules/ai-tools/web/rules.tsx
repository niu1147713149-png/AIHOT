import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { External, ToolLinks } from "./shared";

export const handle: Screen = { tab: "models", name: "榜单说明" };
export function meta() { return pageMeta({ title: "模型榜说明", path: "/leaderboard/rules", noindex: true }); }
export default function Rules() {
  return <><PhoneBar title="榜单说明" back={{ to: "/leaderboard", label: "模型榜" }} /><div className="max-w-3xl py-5"><ToolLinks /><h1 data-page-title="" className="mb-7 text-3xl font-bold">如何使用模型榜</h1>
    <div className="space-y-7 text-sm leading-8 text-ink-2">
      <section><h2 className="text-lg font-semibold text-ink">分数来自哪里</h2><p>本站读取 AIHOT 公开模型榜，保留来源的评分、名次、方法版本和更新时间。综合榜采用编程 40%、科研 20%、专业办公 20%、知识问答 15%、真人盲选 5% 的能力刻度，50 分是其参照组平均水平，每 15 分约为一个标准差。评分不是正确率，也不是本站实测。</p><p><External href="https://aihot.news/leaderboard/rules">最新完整评分规则</External> · <External href="https://aihot.news/leaderboard/sources">逐项评测来源</External></p></section>
      <section><h2 className="text-lg font-semibold text-ink">名次、筛选和缺测</h2><p>各类榜单使用来源已经计算的成绩。筛选和按价格重排不会改写原榜名次；暂不排名的模型保留原原因。当前快照包含原榜前 30 名和来源提供的额外筛选条目，不构成完整模型目录。没有价格、没有测评和实际零价分别处理。</p></section>
      <section><h2 className="text-lg font-semibold text-ink">价格与斩杀线</h2><p>价格来自榜单整理的厂商官网报价，人民币换算保留来源汇率日期。它不是个人订阅价，也不是本站所用中转服务的渠道报价。</p><p>默认按缓存命中、未缓存输入和输出的比例折算每百万 Token 价格：综合与专业办公为 7:2:1，编程为 97:2:1，科研为 0:1:3，知识问答为 0:3:1。自定义场景输入固定 100 万 Token，图中价格改为此次用量的总成本。</p><p className="rounded-control bg-bg-sunk p-4 font-mono text-xs">场景成本 = 输入量 × [(1 − 缓存命中率) × 输入单价 + 缓存命中率 × 缓存单价] + 输出量 × 输出单价</p><p>数量以百万 Token 计。斩杀线由当前筛选中没有被“价格不高、能力不低，且至少一项更优”的模型替代的点构成。切换领域和缓存比例后重新计算。缺少必要价格的模型不参加比较；缓存写入、存储、长上下文阶梯和渠道折扣没有包含在估算里。</p></section>
      <section><h2 className="text-lg font-semibold text-ink">同步与使用范围</h2><p>后台每 6 小时核对一次榜单，Tibo 近期记录每 10 分钟核对一次、完整历史每日核对。来源没有提供稳定的模型榜公开 API，页面结构变化可能导致同步暂停；此时显示最后成功数据及状态，不生成替代分数。</p><p>榜单和公告用于信息参考，来源数据与标识的权利归原权利人。<External href="https://aihot.news/terms">来源使用规则</External></p></section>
    </div></div></>;
}
