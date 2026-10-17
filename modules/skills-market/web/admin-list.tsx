import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import type { AdminSkill, SkillPreview } from "@aihot/contracts/skills";
import { SKILL_CATEGORIES } from "@aihot/contracts/skills";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Badge, Button, Card, Field, Input, Textarea, Select, Empty } from "@aihot/web/features/admin/ui";
import { UnsavedChanges } from "./unsaved";
import { dateLabel } from "./shared";

export async function loader({ request }: LoaderFunctionArgs) { return adminGet<{ items: AdminSkill[] }>(request, "/api/admin/skills"); }
export default function AdminSkills() {
  const { items } = useLoaderData<typeof loader>(), action = useAdminAction();
  const [q, setQ] = useState(""), [status, setStatus] = useState("");
  const [json, setJson] = useState(""), [preview, setPreview] = useState<SkillPreview | null>(null), [reason, setReason] = useState("");
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [dirty, setDirty] = useState(false);
  const rows = items.filter(i => (!status || i.status === status) && `${i.data.title} ${i.data.name} ${i.repo}`.toLowerCase().includes(q.toLowerCase()));
  async function loadSeed() {
    setLoading(true); setError("");
    try { const res = await fetch("/api/admin/skills/seed"); if (!res.ok) throw new Error(`读取清单失败（${res.status}）`);
      setJson(JSON.stringify(await res.json(), null, 2)); setPreview(null); setDirty(true);
    } catch (e) { setError(e instanceof Error ? e.message : "读取失败"); }
    finally { setLoading(false); }
  }
  async function inspect() {
    setError(""); setPreview(null);
    try { const result = await action.run<SkillPreview>("POST", "/api/admin/skills/preview", JSON.parse(json), { revalidate: false });
      if (result) setPreview(result); else setError("预览未完成，请根据提示修正 JSON 后重试。");
    } catch { setError("JSON 格式不正确，请检查逗号、引号与数组结构。"); }
  }
  async function confirmImport() {
    if (!preview || reason.trim().length < 2) { setError("请填写导入理由（至少 2 个字）。"); return; }
    const result = await action.run<{ added: number; skipped: number }>("POST", "/api/admin/skills/import", { entries: JSON.parse(json), digest: preview.digest, reason }, { success: "Skills 导入完成" });
    if (result) { setPreview(null); setJson(""); setDirty(false); setReason(""); setError(""); }
    else setError("导入失败，内容已保留，可重新预览后重试。");
  }
  return <AdminPage title="Skills 市场" subtitle="维护中文资料、安装来源与发布状态。重复导入会跳过已有条目。" actions={<Link to="/skills" className="sm-link text-sm">查看公开目录 ↗</Link>}>
    <UnsavedChanges dirty={dirty} />
    <Card title={`目录 · ${items.length} 条`}><div className="mb-5 flex flex-wrap gap-3"><Input aria-label="搜索管理目录" placeholder="搜索名称、介绍标题或仓库" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
      <Select aria-label="发布状态筛选" value={status} onChange={e => setStatus(e.target.value)} className="max-w-40"><option value="">全部状态</option><option value="published">已上架</option><option value="hidden">已下架</option></Select></div>
      {rows.length ? <ul className="divide-y divide-line">{rows.map(i => <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><Link className="font-medium text-sm text-ink hover:underline" to={`/admin/skills/${i.id}`}>{i.data.title}</Link><p className="sm-name mt-1">{i.repo} · {i.data.name}</p></div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3"><span>{SKILL_CATEGORIES[i.data.category]}</span>{i.data.recommendation && <Badge tone="accent">精选</Badge>}
          <Badge tone={i.status === "published" ? "ok" : "muted"}>{i.status === "published" ? "已上架" : "已下架"}</Badge><span>{dateLabel(i.updatedAt)}</span><Link className="sm-link" to={`/admin/skills/${i.id}`}>编辑</Link></div>
      </li>)}</ul> : <Empty>没有匹配的条目。可调整筛选或在下方导入。</Empty>}</Card>
    <Card className="mt-6" title="导入 Skills" right={<Button busy={loading} disabled={action.busy || !!json} onClick={loadSeed}>加载首批清单</Button>}>
      <p className="sm-muted mb-4">粘贴 JSON 数组，或加载已核验的首批清单。先预览将要新增的条目，再确认导入。完整格式见模块 data/seed.json。</p>
      <Field label="导入 JSON"><Textarea aria-label="导入 JSON" rows={8} value={json} onChange={e => { setJson(e.target.value); setPreview(null); setDirty(!!e.target.value); setError(""); }} spellCheck={false} className="font-mono text-xs" /></Field>
      <div className="mt-4 flex gap-3"><Button busy={action.busy} disabled={!json.trim() || loading} onClick={inspect}>预览导入</Button><Button disabled={action.busy || loading || !json} onClick={() => { setJson(""); setPreview(null); setDirty(false); setError(""); }}>清空输入</Button></div>
      {error && <p role="alert" className="mt-3 text-sm text-hot">{error}</p>}
      {preview && <div className="mt-6 border-t border-line pt-4"><h3 className="text-sm font-semibold">预计新增 {preview.added} 条，跳过 {preview.skipped} 条重复记录</h3>
        <ul className="my-4 max-h-72 overflow-auto text-xs">{preview.rows.map((r, index) => <li className="py-1.5 break-all" key={`${r.id}-${index}`}>{r.duplicate ? "跳过" : "新增"} · {r.name} · {r.repo} / {r.path}</li>)}</ul>
        <Field label="导入理由"><Input aria-label="导入理由" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="例如：补充已核验的首批公开 Skills" /></Field>
        <Button className="mt-4" tone="primary" busy={action.busy} disabled={!preview.added} onClick={confirmImport}>确认新增 {preview.added} 条</Button></div>}
    </Card>
  </AdminPage>;
}
