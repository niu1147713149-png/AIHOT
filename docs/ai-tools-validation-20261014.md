# 本地模型榜与重置监控验收

日期：2026-10-14。实现和运行说明见 [ai-tools 模块](../modules/ai-tools/README.md)。

本文件记录首版功能验收；同日后续的图标、布局、图表与日历更新，以及当前镜像和最新检查结果，见 [界面对齐验收](ai-tools-fidelity-20261014.md)。

## 已交付

- 本地模型榜 `/leaderboard`：五类排名、国产 / 开放权重筛选、搜索与排序、模型资料、人民币参考价格、场景成本和斩杀线。
- Tibo 重置监控 `/codex-reset`：北京时间日历、日期与类型筛选、中英文原帖、引用上下文、来源核验状态、近 90 天统计。
- 桌面侧栏、手机底栏及“我的”入口；浅色、深色和手机布局。
- 本地公开快照与后台同步，页面读取不触发外部采集或模型调用。原始详细评测通过来源链接查看，没有独立重算 AIHOT 评分。

首次真实同步得到 67 个模型、5 类榜单、45 条重置 / 发卡事件。计数是当时快照，之后随来源更新。原站 9 条“推断完成”的历史记录单独标注，不计作已确认事件或当前等待确认预告。

## 验证结果

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test`，独立 Docker 测试数据库 | 755 / 755 通过 |
| 网页生产构建、Docker 生产镜像构建 | 通过 |
| `node --test apps/web/tests/*.test.ts` | 49 / 50 通过；剩余项见下文 |
| `node --test modules/ai-tools/tests/web.browser.ts` | 2 / 2 通过 |
| `node scripts/smoke.ts --base http://localhost:3080` | 30 / 30 通过 |
| 新页面与两个只读接口 | 真实数据正常返回；榜单、分类、规则、模型详情、监控和日期详情均为 HTTP 200 |
| 实际浏览器交互 | 搜索、国产 / 权重筛选、分类、成本参数、模型详情、日历、类型和语言切换正常 |
| 390px 手机布局 | 两页文档宽度均为 390px，搜索框 358px；表格在自身容器内横向滚动 |
| 图表直达与刷新 | SSR 提示文字完整，实际浏览器无 hydration 错误 |

保留的已有问题：`apps/web/tests/navigation-performance.test.ts:285` 的 `deep reading returns to its anchor, including folded dates` 在 WebKit 中失败。此前已在未定制上游复现，本次未修改该导航实现；仍归入路线图 RD-02。

## 本地运行

镜像 `aihot-app:tools-20261014` 已用于 api、worker、web；数据库健康，setup 成功退出。只通过 `127.0.0.1:3080` 暴露网页端口。迁移 `0086_ai_tool_snapshots.sql` 创建新表，种子脚本报告 21 个既有信源、0 个新增。

已开启 `AI_TOOLS_SYNC_ENABLED=true`，既有模型仍为 `gpt-6.1-sol`。worker 已登记两个定时任务，并观察到近期重置快照从首次同步继续自动更新。榜单至少间隔 6 小时，近期重置至少间隔 10 分钟，完整历史至少间隔 24 小时；需 Docker 和 worker 运行才能继续。

升级前后逐项比对 21 个信源的启用、站内全文及再分发开关，一致。示例文章 `ce8lk6ddiai1row7to9nuqidb` 的中文正文和英文原文均仍可读取。此前个人全文配置保持在数据库中，不随种子脚本覆盖。

数据库、私有配置和信源标志备份保存在本机忽略目录 `.data/model-tools-20261014/backup/`；旧运行镜像保留为 `aihot-app:before-ai-tools-20261014`。测试日志在 `.data/model-tools-20261014/`，截图在本地忽略的 `output/playwright/`。临时预览进程、调试服务和隔离测试数据库已清理，未推送仓库或公开发布。
