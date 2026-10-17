import { Link } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { External } from "./shared";

export const handle: Screen = { tab: "me", name: "Skills 收录说明" };
export function meta() { return pageMeta({ title: "Skills 收录与榜单说明", path: "/skills/rules" }); }
export default function Rules() {
  return <><PhoneBar title="收录说明" back={{ to: "/skills", label: "Skills 市场" }} /><article className="sm-page max-w-3xl"><Link to="/skills" className="sm-back">← 返回 Skills 市场</Link>
    <header className="sm-heading"><h1 data-page-title="">找到适合你的 Skill</h1></header><div className="sm-prose">
      <section><h2>这里收录什么</h2><p>收录有原始仓库、明确 SKILL.md 和安装入口的公开独立 Skills，围绕个人与小团队的开发、内容、设计视频、办公、自动化和营销任务整理中文介绍。首批是人工核验目录，并非全网索引；插件包与旧版弃用目录暂未收录。</p></section>
      <section><h2>来源热门、精选与最近更新</h2><p>“来源热门”按 skills.sh 全期榜的来源名次排列，保留该页面当时显示的安装量与读取日期。K、M 是来源的舍入显示值。安装统计来自其 CLI 遥测，不是全网安装量、独立用户数或质量评分；没有数据的条目排在有排名条目之后，显示“暂无”。</p>
        <p className="mt-3">“本站精选”按对小团队的任务适用性人工挑选，并逐条写明推荐理由。“仓库最近更新”使用 GitHub 仓库的 pushed_at；同一仓库的 Skills 共享更新时间和 Stars，不代表每个 Skill 都在该日更新。</p></section>
      <section><h2>数据多久刷新</h2><p>首版安装榜是带日期的人工快照。skills.sh 的正式 API 需要 Vercel OIDC，当前没有接入实时安装榜。启用采集与模块同步后，worker 每日核对 GitHub 仓库元数据；本地预览默认关闭。刷新失败保留上次数据及日期，不填入推测数值。</p></section>
      <section><h2>安装与兼容性</h2><p>安装命令由仓库、Skill 名称、目标客户端和范围生成，通过 Skills CLI 安装当前单个 Skill。按钮只复制命令；Node.js、Git 和目标客户端需自行准备。Codex、Claude Code 安装入口遵循安装器文档，具体 Skill 的工具依赖和工作流兼容性仍需验证。</p>
        <p className="mt-3">核验资料保存 commit 与内容哈希；安装命令使用仓库当前版本。首批条目标记为“文档已核验”，没有声称实际执行或安全审计通过。阅读来源与依赖说明后再决定是否安装。</p></section>
      <section><h2>许可与来源</h2><p>中文简介是本站整理，原始 Skill 的权利归原作者。每条保留仓库、固定版本文件和许可证入口。Anthropic 的部分文档技能采用专有或 source-available 条款，不能统一当作 MIT/Apache 许可；没有查明的许可明确标为待核对。</p>
        <p className="mt-3"><External href="https://skills.sh/docs">skills.sh 说明</External> · <External href="https://github.com/vercel-labs/skills#readme">安装器文档</External> · <External href="https://agentskills.io/home">Agent Skills 标准</External></p></section>
    </div></article></>;
}
