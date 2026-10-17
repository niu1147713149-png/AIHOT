# 模型榜与 Tibo 重置监控

为 AIVANE 增加的参考工具，支持本机和服务器部署，入口在桌面侧栏“工具”和手机“我的”，手机底栏另有“模型榜”。使用本站品牌和界面；AIHOT 仅作为明确标注的数据来源。

本机部署与测试结果见 [2026-10-14 验收记录](../../docs/ai-tools-validation-20261014.md)。

## 能做什么

- `/leaderboard`：综合、编程、科研、专业办公、知识问答五类排名；国产、开放权重与名称筛选；按名次、日期、价格、场景成本排序。
- `/leaderboard/:slug`：各分类成绩、评测覆盖、输入 / 输出 / 缓存参考价格、官方链接、权重与原始评测证据链接。
- 榜单“斩杀线”：同款厂商图标、对数价格轴、前沿阶梯、价格浮层和前沿清单。默认按来源的五类场景比例折算每百万 Token 价格；点“自定义场景”后输入固定 100 万 Token，可调输出量与缓存比例，显示本次总成本。缺价格不当作免费，同价同分保留并列。
- `/leaderboard/rules`：评分来源、数据范围、价格和成本计算说明。
- `/codex-reset`、`/codex-reset/history/:date`：最新状态与原帖卡、带事件标签的北京时间日历、当天记录、近 90 天统计与间隔中位数、中英文原帖及上下文。默认选中今天，“最近记录”跳转最近有记录的日期；日期支持方向键切换。预告过期仍不等于完成，来源推断完成也不计入已确认统计。

默认榜单保留来源前 30 名；搜索或筛选时使用来源额外提供的条目，仍显示原榜名次。当前快照中的所有模型不等于所有已发布模型。国产标记不证明国内可开户，开放权重不证明无限制商用。显示价格是来源整理的官方参考价，不是本站模型渠道账单。

## 数据与同步

17 个厂商图标固定保存在 `assets/model-providers/`，由 `brands.ts` 按厂商匹配；新增厂商未匹配时显示首字母。表格、待排名列表、模型详情和斩杀线共用图标组件。文件通过模块静态路由与项目 `sendFile` 发送，限制在清单内，不接受快照中的任意图片地址。来源、获取日期和文件校验值在 `assets/model-providers/sources.json`；Tibo 头像来源在 `assets/tibo-source.json`。这些标识用于辨识来源和厂商，品牌权利归各自所有者，未声明第三方资产属于本仓库许可证。

本轮视觉对照与验证见 [界面对齐记录](../../docs/ai-tools-fidelity-20261014.md)。

| 数据 | 固定来源 | 最短获取间隔 |
|---|---|---|
| 模型榜 | `https://aihot.news/leaderboard` 的公开页面数据 | 6 小时 |
| 重置近期记录 | `https://aihot.news/api/v1/codex-resets/recent` | 10 分钟 |
| 重置完整历史 | `https://aihot.news/api/v1/codex-resets` | 24 小时 |

迁移 `migrations/0086_ai_tool_snapshots.sql` 创建 `ai_tool_snapshots`。模块通过 `site/modules/` 注册路由、导航与 worker 定时任务，API 经 `packages/backend/src/publication/reference-snapshots.ts` 统一读取。页面和前端只读站内 HTTP，不触发抓取或模型请求。

worker 每小时第 7 分钟检查榜单，每 10 分钟检查重置；数据库的下次获取时间避免提前重复请求。请求有 30 秒超时、4 MiB 上限、ETag、来源缓存期限和 Retry-After 处理。来源 HTML 只按数据解码，不执行脚本。完整历史与近期窗口合并时，同步更正和撤回；旧近期响应不覆盖更新的完整历史。

网络错误或格式变化保留最后成功快照并提示；403 / 404 / 410 或 `no-store` 清除对应快照。模型榜超过 8 小时未核对、近期记录超过 30 分钟未核对会提示陈旧；来源核验滞后或监控异常另外显示。页面上的时间和状态在重新打开 / 刷新时更新。

## 启停

默认 `AI_TOOLS_SYNC_ENABLED=false`。按 [部署说明](../../docs/deploy.md) 迁移并启动后，在部署环境的 `.env` 设置：

```dotenv
AI_TOOLS_SYNC_ENABLED=true
COLLECT_ENABLED=true
SITE_URL=http://localhost:3080
PORT=127.0.0.1:3080
```

服务器部署时把 `SITE_URL` 改为读者实际访问的 IP 或域名，端口按部署方式配置；更改地址不会停用同步，无需修改模型配置。重新创建应用容器加载环境变量后，可用下列命令首次填充快照：

```bash
docker compose exec -T api node modules/ai-tools/scripts/sync.ts
```

重复执行会跳过尚未到期的数据。在后台“运行”页检查 `ai-tools.leaderboard` 与 `ai-tools.codex-reset`；若页面无数据，依次核对迁移、两个开关、SITE_URL、worker 状态与来源错误。切勿把重置监控中的日期当作用户账号的额度承诺。

关闭 `AI_TOOLS_SYNC_ENABLED` 并重新创建 api / worker 会停止同步，已存快照仍显示。前台页面和快照接口无需登录，管理后台继续使用原有管理员鉴权；同步开关不承担访问控制。更改 `SITE_URL` 不会删除已缓存数据。

## 范围与验证

本模块不复刻原站私有评分引擎、不批量复制模型原始评测、不独立采集 X、不查询私人额度、不执行重置，也未配置外部通知。来源页面格式变化可能需要更新解析器。读取公开数据不等于获得商业再分发许可。

`tests/data.standalone.test.ts` 使用合成数据验证解析、排名、成本、日期、更正撤回与公告状态；`tests/sync.test.ts` 使用隔离测试库和假 fetch 验证缓存、限频、并发、失败与删除。纳入根目录 `npm test`；不读取生产库和密钥，不请求真实来源。仓库必需检查见 [AGENTS.md](../../AGENTS.md)。

前端构建后运行 `node --test modules/ai-tools/tests/web.browser.ts`，使用本地假 API 和 Chromium 验证斩杀线直达页的 SSR / 客户端一致性、手机搜索面板、长链接换行、历史推断状态、筛选与原榜名次、图表浮层和日历键盘导航。需要与主仓库网页测试相同的 Playwright 浏览器依赖。
