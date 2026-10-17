# Skills 市场本地交付验证

日期：2026-10-15。入口：http://localhost:3080/skills 。后台：http://localhost:3080/admin/skills 。本次只在本地运行，没有发布公网、提交或推送 Git。

## 交付内容

- 33 条已核验的独立 Skills，6 类用途；其中 17 条保留 skills.sh 来源全期榜快照，12 条附精选理由。
- 搜索、分类、客户端筛选、热门/精选/仓库更新排序、分页；详情保留中文用途、任务示例、依赖、原始描述、来源、许可与固定 commit。
- Codex / Claude Code、项目 / 全局安装命令切换与复制；尚未执行第三方 Skill 安装，兼容性说明明确区分安装器支持和技能实测。
- 后台导入预览与确认、去重、资料编辑、精选、上下架、乐观版本校验、CSRF 与审计。未保存离开使用原生模态对话框。
- 桌面工具区、手机“我的”入口；不增加底栏标签。明暗主题、390px 与 320px 页面布局。

## 检查结果

检查使用 Node.js 24.21.0 的 Docker 环境，数据库测试连接新建的独立 PostgreSQL 测试容器，未使用真实资讯数据库。

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | 785 项通过，0 失败；含 7 项 Skills 后端行为测试 |
| `npm run build -w @aihot/web` | 通过；标准 Dockerfile 生产镜像构建通过 |
| `node --test apps/web/tests/*.test.ts` | 63 项中 62 通过，1 项既有失败，见下文 |
| Skills 浏览器测试 | 桌面 Chromium、手机 Chromium、手机 WebKit、后台流程，4 项全部通过 |
| `node scripts/smoke.ts --base http://localhost:3080` | 全部通过 |
| 真实本地页面 | 搜索、详情、原生剪贴板实际读写、返回筛选、手机入口、规则页、匿名管理接口 401、未知详情 404，通过 |
| 真实主题和布局 | 通过站内外观开关切换深色后截图核对；390px 与 320px 无整页横向溢出；手机详情在页面过渡结束后检查高度 |

既有失败：`apps/web/tests/navigation-performance.test.ts:285` 的 `deep reading returns to its anchor, including folded dates`，在 WebKit 中返回阅读锚点的偏移超过期望值。该问题在本次开发前已有记录，本次未扩展范围修改阅读器；不能把 Web 全量测试描述为全部通过。

后端测试覆盖：来源身份与重复导入、编辑不被重导覆盖、发布撤回、搜索与分页、客户端和精选筛选、跨时区排序、管理员鉴权与 CSRF、过期版本冲突、命令/路径/URL 边界、ETag 304、401/429/500 保留旧数据与退避、公开读取不调用外部来源。

## 本地运行与恢复

已迁移 0087–0089，导入 33 条，重启 `aihot-api-1` 与 `aihot-web-1`。数据库健康，网页仍绑定 `127.0.0.1:3080`。本地 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`SKILLS_MARKET_SYNC_ENABLED` 均为 false；worker 保持停止。

生产镜像：`aivane-app:skills-20261015`，同时标记为 compose 使用的 `aihot-app`。回退镜像：`aivane-app:before-skills-20261015`。变更前数据库和配置备份位于忽略目录 `.data/skills-market-20261015/backup/`，不提交到 Git。新增表可随旧应用回退保留，未改写原有资讯内容。

## 核验材料

日志均在 `.data/skills-market-20261015/`：`typecheck.log`、`npm-test.log`、`web-build.log`、`web-tests.log`、`browser-skills.log`、`production-build.log`、`local-migrate.log`、`local-import.log`、`smoke.log`、`local-browser.log`。

已人工查看截图：

- `screenshots/skills-desktop.png`：电脑列表与导航。
- `screenshots/skills-phone-viewport.png`：手机首屏、筛选与底栏。
- `screenshots/skill-detail-phone-settled.png`：手机详情、命令和来源；等待页面过渡完成后截图。
- `screenshots/skills-dark.png`：通过站内开关切换后的深色列表。

## 当前边界

skills.sh 安装榜为 2026-10-15 的人工快照，尚未接入需要 Vercel OIDC 的实时 API；日常 GitHub 仓库同步已实现但本地关闭。许可、客户端限制和关联 Skills 依赖以条目来源为准。真实网页验证没有安装第三方 Skills，也没有触发付费模型请求。
