import { useState, type FormEvent } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import type { AdminSkill, SkillData } from "@aihot/contracts/skills";
import { SKILL_CATEGORIES } from "@aihot/contracts/skills";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Button, Card, Field, Input, Textarea, Select } from "@aihot/web/features/admin/ui";
import { UnsavedChanges } from "./unsaved";
import "./skills.css";

export async function loader({ request, params }: LoaderFunctionArgs) { return adminGet<AdminSkill>(request, `/api/admin/skills/${encodeURIComponent(params.id!)}`); }
export default function AdminSkillPage() { const item = useLoaderData<typeof loader>(); return <Editor key={`${item.id}:${item.revision}`} item={item} />; }
function Editor({ item }: { item: AdminSkill }) {
  const action = useAdminAction(), [data, setData] = useState(item.data), [status, setStatus] = useState(item.status), [reason, setReason] = useState("");
  const { title, summary, category, tasks, example, dependencies, recommendation, ...source } = item.data;
  const [sourceJson, setSourceJson] = useState(JSON.stringify(source, null, 2));
  const [metricJson, setMetricJson] = useState(JSON.stringify(item.metric, null, 2)), [dirty, setDirty] = useState(false), [error, setError] = useState("");
  function field<K extends keyof SkillData>(key: K, value: SkillData[K]) { setData(d => ({ ...d, [key]: value })); setDirty(true); }
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const extra = JSON.parse(sourceJson), metric = JSON.parse(metricJson);
      if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("来源资料需要 JSON 对象。");
      const next = { ...extra, title: data.title, summary: data.summary, category: data.category, tasks: data.tasks.filter(s => s.trim()), example: data.example, dependencies: data.dependencies.filter(s => s.trim()), recommendation: data.recommendation };
      if (reason.trim().length < 2) { setError("请填写修改理由（至少 2 个字）。"); return; }
      const result = await action.run<AdminSkill>("PATCH", `/api/admin/skills/${item.id}`, { data: next, metric, status, revision: item.revision, reason }, { success: "Skill 已保存" });
      if (result) setDirty(false); else setError("保存未完成。若条目版本已变更，请先保留当前输入，再重新加载。其他错误请按提示修正。");
    } catch (e) { setError(e instanceof SyntaxError ? "来源资料或热度快照的 JSON 格式不正确。" : e instanceof Error ? e.message : "输入无效"); }
  }
  return <AdminPage title={`编辑 · ${item.data.title}`} subtitle={`${item.repo} / ${item.path}`} actions={<Link to="/admin/skills" className="sm-link text-sm">返回目录</Link>}>
    <UnsavedChanges dirty={dirty} /><form onSubmit={save}><Card title="中文资料与发布状态"><div className="sm-form-grid">
      <Field label="中文名称"><Input aria-label="中文名称" required maxLength={100} value={data.title} onChange={e => field("title", e.target.value)} /></Field>
      <Field label="用途分类"><Select aria-label="用途分类" value={data.category} onChange={e => field("category", e.target.value as SkillData["category"])}>{Object.entries(SKILL_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <div className="sm-form-wide"><Field label="中文用途简介"><Textarea aria-label="中文用途简介" required maxLength={500} value={data.summary} onChange={e => field("summary", e.target.value)} /></Field></div>
      <Field label="适合任务（每行一项）"><Textarea aria-label="适合任务" required value={data.tasks.join("\n")} onChange={e => field("tasks", e.target.value.split("\n"))} /></Field>
      <Field label="使用依赖（每行一项）"><Textarea aria-label="使用依赖" value={data.dependencies.join("\n")} onChange={e => field("dependencies", e.target.value.split("\n"))} /></Field>
      <div className="sm-form-wide"><Field label="使用示例"><Textarea aria-label="使用示例" required maxLength={2000} value={data.example} onChange={e => field("example", e.target.value)} /></Field></div>
      <Field label="精选理由" hint="填写即加入本站精选；留空取消精选。"><Textarea aria-label="精选理由" maxLength={500} value={data.recommendation} onChange={e => field("recommendation", e.target.value)} /></Field>
      <Field label="发布状态"><Select aria-label="发布状态" value={status} onChange={e => { setStatus(e.target.value as typeof status); setDirty(true); }}><option value="published">上架 · 公开可见</option><option value="hidden">下架 · 公开不可见</option></Select></Field>
    </div></Card><Card className="mt-6" title="来源、安装与核验资料"><p className="sm-muted mb-4">编辑原名、作者、许可、客户端说明、原文与核验版本。安装命令由仓库和名称生成。仓库与路径作为条目标识固定；更换来源请新建导入。</p>
      <Field label="来源资料 JSON"><Textarea aria-label="来源资料 JSON" value={sourceJson} onChange={e => { setSourceJson(e.target.value); setDirty(true); }} rows={16} spellCheck={false} className="font-mono text-xs" /></Field>
      <div className="mt-5"><Field label="热度快照 JSON" hint="没有已核验数据填 null。保留来源、指标、窗口、名次和读取日期。"><Textarea aria-label="热度快照 JSON" value={metricJson} onChange={e => { setMetricJson(e.target.value); setDirty(true); }} rows={8} spellCheck={false} className="font-mono text-xs" /></Field></div>
    </Card><Card className="mt-6"><Field label="修改理由"><Input aria-label="修改理由" required minLength={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：核对新版文档并补充依赖说明" /></Field>
      {error && <p className="mt-3 text-sm text-hot" role="alert">{error}</p>}<div className="mt-4 flex flex-wrap items-center gap-4"><Button type="submit" tone="primary" busy={action.busy}>保存修改</Button><span role="status" className="sm-muted">{action.pending ? "正在保存…" : dirty ? "有未保存修改" : `已保存 · 版本 ${item.revision}`}</span></div></Card></form>
  </AdminPage>;
}
