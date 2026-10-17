import { useEffect, useState } from "react";
import { Form, Link, redirect, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router";
import type { AdminIdeas } from "@aihot/contracts/ideas";
import { IDEA_STATUS_LABELS } from "@aihot/contracts/ideas";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Badge, Button, Card, Field, Input } from "@aihot/web/features/admin/ui";
import "./ideas.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams, date = params.get("date");
  const result = await adminGet<AdminIdeas>(request, `/api/admin/ideas${date ? `?date=${encodeURIComponent(date)}` : ""}`);
  if (params.get("from") === "public") throw redirect(`/ideas?date=${encodeURIComponent(result.edition.date)}`);
  return result;
}
export default function AdminIdeasPage() {
  const result = useLoaderData<typeof loader>(), e = result.edition, action = useAdminAction(), reload = useRevalidator();
  const [reason, setReason] = useState("结合当天新闻生成 AI 应用创意"), [feedback, setFeedback] = useState("");
  const pending = e.status === "queued" || e.status === "running";
  useEffect(() => { if (!pending) return; const timer = setInterval(() => { if (document.visibilityState === "visible" && reload.state === "idle") void reload.revalidate(); }, 5000); return () => clearInterval(timer); }, [pending, reload]);
  useEffect(() => setFeedback(""), [e.date]);
  async function generate() {
    const r = await action.run<{ queued: boolean }>("POST", "/api/admin/ideas/generate", { date: e.date, reason }, { success: "生成任务已提交" });
    setFeedback(r ? (r.queued ? "任务已排队，worker 处理后会显示结果。" : "该日期已有任务，请稍后刷新。") : "提交失败，请根据提示检查配置后重试。");
  }
  return <AdminPage title="创意集市" subtitle="按北京时间自然日分析新闻，为国内个人与小团队生成最多 5 个可验证的创意。" actions={<Link className="ideas-link text-sm" to={`/ideas?date=${e.date}`}>查看公开页面 ↗</Link>}>
    <Card title="生成与状态" right={<Badge tone={e.status === "ready" ? "ok" : "muted"}>{IDEA_STATUS_LABELS[e.status]}</Badge>}>
      <Form method="get" key={e.date} className="mb-5 flex flex-wrap items-end gap-3"><Field label="新闻日期"><Input aria-label="新闻日期" type="date" name="date" defaultValue={e.date} max={e.today} required /></Field><Button type="submit">查看日期</Button></Form>
      <p className="mb-3 text-sm text-ink-3">可用新闻样本 {e.currentSourceCount} 条 · 最多选取 32 条，优先精选并按事件去重。</p>
      <p className="mb-3 text-sm text-ink-3">每日生成：{result.scheduleEnabled ? "已启用，每晚 21:30（需 worker 运行）" : "未启用"}。相同资料重复执行会复用结果。</p>
      {!result.modelCallsEnabled && <p className="ideas-notice mb-4">模型调用已关闭。启用 MODEL_CALLS_ENABLED 后才可提交生成；日更还需要 AI_IDEAS_DAILY_ENABLED=true。</p>}
      {pending && <p className="ideas-notice mb-4">正在等待后台任务完成；长时间未变化时请检查 worker 是否运行。</p>}
      {result.error && <p role="alert" className="mb-4 text-sm text-hot">{result.error}</p>}
      <Field label="生成理由"><Input aria-label="生成理由" value={reason} onChange={event => setReason(event.target.value)} minLength={2} maxLength={300} /></Field>
      <div className="mt-4 flex flex-wrap gap-3"><Button tone="primary" busy={action.busy} disabled={!result.modelCallsEnabled || !e.currentSourceCount || pending || reason.trim().length < 2} onClick={generate}>{e.generatedAt ? "按当前资料重新生成" : "生成这一天的创意"}</Button>
        <Button disabled={reload.state !== "idle"} onClick={() => reload.revalidate()}>刷新状态</Button></div>
      {feedback && <p role="status" className="mt-4 text-sm text-ink-3">{feedback}</p>}
      {!e.currentSourceCount && <p className="mt-4 text-sm text-ink-3">这一天没有可用新闻。可选择下方有资料的日期，或等待采集完成。</p>}
    </Card>
    <Card title="有新闻的最近日期" className="mt-5"><div className="flex flex-wrap gap-3">{e.sourceDates.length ? e.sourceDates.map(date => <Link className="ideas-link text-sm" key={date} to={`/admin/ideas?date=${date}`}>{date}</Link>) : <p className="text-sm text-ink-3">尚未收录新闻。</p>}</div></Card>
    {e.ideas.length > 0 && <Card title={`当前可见 · ${e.ideas.length} 个创意`} className="mt-5"><ol className="list-decimal space-y-3 pl-5 text-sm">{e.ideas.map((idea, i) => <li key={i}>{idea.title}</li>)}</ol></Card>}
  </AdminPage>;
}
