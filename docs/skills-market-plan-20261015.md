# AIVANE Skills 市场实现方案

日期：2026-10-15（Asia/Shanghai）。状态：用户确认的本地实现已完成，33 条资料已导入，本地服务已启动。未部署公网。实际交付与验证记录见 [QA 报告](../design/product-ui-ux/skills-market-20261015/qa-report.md)。

## 目标与首版范围

在现有网站增加“Skills 市场”：帮助做国内业务的个人和小团队找到值得尝试的 Agent Skill，了解用途、来源和安装方式。首版建议收录 30–50 个经核验的公开条目，中文介绍并保留原名与原文链接，匿名浏览。

用户已确认先在本地实施。首版采用公开独立 Skills、6 类用途、Codex / Claude Code 安装入口和带日期的人工榜单快照；整理了 33 条资料，其中 17 条有来源榜单快照、12 条有精选理由。仓库元数据同步默认关闭，不增加本地模型费用。

## 页面与阅读流程

| 位置 | 内容与行为 |
|---|---|
| `/skills` | 技能列表：中文搜索、用途分类、适用客户端筛选；“来源热门”“本站精选”“最近更新”视图 |
| `/skills/:id` | 中文用途、适合的任务、一个使用示例、适用客户端、依赖、安装命令、作者与来源、数据核验日期 |
| `/skills/rules` | 热度指标的统计范围、数据来源、推荐依据与核验状态说明 |
| 后台 Skills 管理 | 导入预览、编辑中文介绍和分类、维护来源与安装方法、精选及下架 |

桌面入口放在现有“工具”区，与模型榜、Tibo 重置监控并列；手机首版放在“我的 → 工具”，避免增加底栏拥挤。列表到详情、筛选返回位置、深色模式及手机阅读共同验收。

建议按用途分类：开发编程、内容创作、设计与视频、办公文档、流程自动化、营销与业务研究。每个条目补充“适合完成什么任务”，国内访问或使用条件只在已核实时标注。首次展示可优先推荐与内容制作、工具服务、自动化有关的条目。

## 已核实的数据来源

以下均在 2026-10-15 读取了实际页面或官方仓库文件；动态排名与计数不视为固定事实。

| 来源 | 可以取得的资料 | 当前条件 |
|---|---|---|
| [skills.sh](https://skills.sh/) / [榜单说明](https://skills.sh/docs) | 全期榜、24 小时趋势、Hot；Skill 名称、仓库、来源安装量、详情页 | 安装统计来自该生态 CLI 的遥测，不能称为全网用户数；公开页面本次可读 |
| [skills.sh API 文档](https://skills.sh/docs/api) | 榜单、搜索、官方精选、Skill 文件与审计元数据 | API 需要 Vercel OIDC；实测匿名 `GET /api/v1/skills?view=trending&per_page=1` 返回 401。当前 VPS 没有已核验可用的接入身份 |
| [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) | 原始 Skill、用途、作者、许可证与版本 | 作为一手资料；仓库 Stars 只按仓库口径展示 |
| [Anthropic Skills](https://github.com/anthropics/skills) | 编程、设计、办公等原始 Skill 与 Claude 安装说明 | 仓库明确部分文档技能是 source-available，许可需按条目读取，不能统一标为开源可商用 |
| [OpenAI Plugins](https://github.com/openai/plugins) | Codex 官方插件示例，部分包含 Skills | Plugin 与独立 Skill 分开标注；原 `openai/skills` README 已声明弃用并指向该仓库，不能继续当作当前维护入口 |
| [Agent Skills 标准](https://agentskills.io/home) | SKILL.md 结构与生态规范 | 用于格式识别，不提供热门排行 |

首版数据路线：核验后的公开仓库目录作为底稿，人工导入一批公开榜单条目并记录来源名次、指标、统计窗口和读取日期。动态仓库元数据可由 worker 定期读取 GitHub 官方 API，遵守配额和条件请求。榜单快照需明确标注日期，缺少新数据时保持旧快照并显示更新状态。

需要持续同步 skills.sh 安装榜时，再选择其正式身份接入方式；不把一次页面可读当作稳定 API，也不绕过 API 鉴权。若采用公开页面解析，实施前核对来源允许的使用方式，限定少量元数据并测试页面结构变化时的行为。首版不承诺实时榜单。

## 热门指标

- **来源热门**：展示 skills.sh 原有指标和名次，明确区分全期累计、Trending 24h、Hot。官方文档将 Hot 描述为当前小时与昨天同一小时的比较，不能标成周榜。
- **仓库 Stars**：展示 GitHub 仓库关注度。一个仓库的多个 Skills 共享这个指标，它不能冒充每个 Skill 的安装量。
- **本站精选**：按实际用途给出推荐理由，与来源排名分别展示。首版不设没有验证依据的综合“热度分”。

数值应同时带 `source`、`metric`、`window`、`observedAt`；没有数据时显示“暂无”，不写 0。相同 Skill 的多个来源记录合并到同一条目并保留来源证据；不能只凭相同名称合并不同作者的技能。标识使用来源仓库与实际 Skill 路径，域名分发源另存来源类型。

## 安装方式

详情页按已支持的客户端展示命令，例如 Codex、Claude Code；其余客户端只有确认适配后才显示。交互是“选择客户端 → 选择项目/全局范围 → 复制命令 → 本地运行”。网页上的按钮不能直接替访客写入电脑。

已核对的示例是 [vercel-react-best-practices](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices)：来源页安装命令与仓库 `SKILL.md` 的 `name` 一致；CLI 官方文档支持 `--skill` 和 `--agent codex`。

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices --agent codex
```

以上示例为项目范围；全局范围在界面明确选择后增加 `--global`。Node.js、Git、所需账号/API 服务等依赖在条目中说明。命令当前是“官方文档已核验”，本次没有执行安装，不能标成“安装实测通过”。

安装来源优先采用原作者方式；独立 Skill、Claude 插件和 Codex 插件分别展示，不能对所有项目机械拼接同一种命令。对于 npx skills 支持的条目，根据受约束的仓库地址、真实 Skill 名称与客户端白名单生成命令，不能让网页正文中的任意 shell 文本成为默认安装指令。

每个详情至少保留三种外链：原作者仓库、具体 `SKILL.md`、热门榜单来源页；存在官网时补充官网。核验记录保存 commit SHA 或内容哈希，便于判断安装说明对应的版本。许可、客户端兼容性与所需外部服务未知时如实显示，不据安装工具“支持某客户端”推断所有 Skill 在该客户端都能正常工作。

## 当前仓库的实现落点

依照 `AGENTS.md` 和 `docs/architecture.md`，新增独立 `modules/skills-market/` npm workspace。复用模块注册、worker 调度和管理入口，不与 `ai-tools` 模块互相导入。

```text
modules/skills-market/
  package.json
  module.ts                 页面和 API 地址
  server.ts                 HTTP、定时同步、后台入口
  web.tsx                   导航注册
  backend/                  来源适配、导入、规范化、存储
  api/                      公开查询与管理员维护接口
  web/                      列表、详情、规则页、样式
  migrations/               模块自己的表
  tests/                    解析、查询、安装命令与浏览器验证
```

公开查询经 `packages/backend/src/publication/skills.ts` 统一返回可发布数据。前端只调用本站 API，页面访问不触发外部抓取或模型请求。模块同步不能直接复用 `ai_tool_snapshots` 表；该表属于现有模型榜/Tibo 模块，Skills 使用自己的数据表。

建议数据分为：

1. `skill_catalog`：稳定 id、来源类型、repo/path、原名、中文介绍、用途分类、客户端、依赖、官网/仓库/SKILL.md 地址、许可证、安装配置、发布状态、核验版本。
2. `skill_metrics`：条目 id、来源、指标、统计窗口、数值与原名次、采集时间；是否保留历史按首版展示需要决定。
3. `skill_source_state`：各来源上次成功和尝试时间、ETag、下次同步时间、错误摘要。

在 `site/modules/index.ts`、`site/modules/server.ts`、`site/modules/web.ts` 与 `site/package.json` 注册；Dockerfile 加模块依赖清单。新增迁移逐文件单语句，使用新编号。公开页面匿名，管理接口沿用管理员鉴权。

建议默认每天更新 GitHub 元数据；取得正式榜单接入后每 6 小时更新榜单。同步开关遵守现有采集总开关，只有显式启用后运行。30–50 条首版介绍可人工整理；若后续使用模型生成中文说明，仅处理新增或变更条目，复用既有回执与预算，不在读请求中付费。

## 分步交付与验收

| 任务 | 交付物 | 验收重点 |
|---|---|---|
| SM-01 来源与种子清单 | 30–50 条候选，含来源、分类建议、兼容性与安装证据 | 用户确定首批来源及分类；每条可追溯，缺失信息不伪造 |
| SM-02 模块与存储 | 注册、迁移、导入与公开查询 | 同仓库多个 Skill 不混淆；重复来源、撤回、失效地址与空数据可处理 |
| SM-03 列表与详情 | 中文搜索、过滤、排序、详情与安装复制 | 桌面/手机入口可达；复制的是选中客户端及范围对应的单个 Skill 命令 |
| SM-04 同步与管理 | 已确认来源同步、后台编辑及下架 | 更新失败保留旧数据并标日期；401/429 不产生伪数据；页面不直接抓源 |
| SM-05 回归与交付 | 检查结果、迁移与部署说明 | typecheck、npm test、生产构建、Web 测试及 smoke；既有 WebKit 失败单独报告 |

已实施的首版产品选择：采用上述 6 类用途，只收公开独立 Skills，提供 Codex/Claude Code 安装入口，以人工榜单快照保留可追溯热度；目录、详情、安装命令、后台维护和 GitHub 元数据同步均已实现。插件目录与自动安装榜属于后续扩展。

## 本次核验材料

- 当前项目：`docs/architecture.md`、`modules/ai-tools/module.ts`、`modules/ai-tools/web.tsx`、`modules/ai-tools/server.ts`、`apps/web/app/modules.ts`。
- [Skills CLI 官方文档](https://github.com/vercel-labs/skills#readme)：`add`、单技能选择、目标客户端与安装范围。
- [React Skill 原始文件](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md)：真实名称、用途与许可证。
- 网页及仓库文本快照保存在忽略目录 `.data/skills-market-research-20261015/`。这些读取只用于方案核验，没有安装第三方 Skill、创建平台账号或部署新功能。
