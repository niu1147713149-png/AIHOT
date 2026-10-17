# Skills 市场

独立 Skill 目录模块。公开页面为 `/skills`、`/skills/:id`、`/skills/rules`；管理员在 `/admin/skills` 导入、编辑、精选与上下架。复用网站的身份验证、CSRF 和审计日志，匿名访问不触发采集或模型调用。

## 首批资料

`data/seed.json` 包含 2026-10-15 核验的 33 个 Skills，来自 Vercel、Anthropic、HeyGen / HyperFrames 与 Corey Haines 的 5 个公开仓库。每条记录固定版本的 commit、内容 SHA-256、真实 Skill 名、中文用途、示例、依赖、客户端说明和许可入口。17 条有 skills.sh 公开全期榜快照，12 条有本站精选理由。

安装量保留来源显示精度（例如 K、M），不推算精确用户数。GitHub Stars 与 pushed_at 是仓库级指标，多个 Skills 共用。部分 Anthropic 文档技能为专有许可，未知许可显示待核对。客户端入口遵循 Skills CLI 文档，尚未执行安装实测。安装命令指向仓库当前版本，固定 commit 用于核验溯源。

## 初始化与导入

完成 `npm ci`、数据库迁移与 web 构建后，可在后台“加载首批清单 → 预览导入 → 填写理由 → 确认新增”，也可运行：

```bash
node --env-file=.env modules/skills-market/scripts/import.ts
node --env-file=.env modules/skills-market/scripts/import.ts --apply
```

第一个命令只预览。自定义文件通过 `--file=/absolute/path/skills.json` 提供 JSON 数组，字段参照种子文件。单批至多 200 条。重复的 `repo + path` 跳过，不覆盖人工编辑；仓库名不区分大小写，文件路径区分大小写。已有记录可在详情编辑页修改资料与热度快照；没有指标填 `null`。仓库与路径作为身份固定，更换来源需另行导入。

编辑带版本校验，旧表单保存返回 409。下架立即从公开查询排除，公开详情返回 404。导入、编辑均事务写入审计记录。导入摘要只绑定预览内容，不作为身份验证凭据。

## 同步

`COLLECT_ENABLED=true` 且 `SKILLS_MARKET_SYNC_ENABLED=true` 时，worker 每日北京时间 03:23 通过 GitHub 官方 API 更新仓库元数据。使用 ETag、请求超时和 403/429 退避；失败保留最后成功的数据并显示刷新失败状态。匿名请求量为每个仓库每日一次，首批共 5 个仓库。开关默认关闭，本地 worker 无需启动。

本模块没有接入 skills.sh 的 Vercel OIDC API，也没有持续解析网页。安装榜以人工导入快照更新；元数据同步不会更改安装排名、中文介绍或核验 commit。维护者需要在更新来源版本时核对文件并更新核验记录。

## 结构与验证

模块只使用自己的 `skill_catalog`、`skill_metrics`、`skill_source_state` 表，迁移 0087–0089 各一条语句。公开读取经 `packages/backend/src/publication/skills.ts`，前端只访问本站 API。命令生成只允许受约束的仓库和 Skill 名称，不执行来源文件里的 shell 文本。

后端验证位于 `tests/catalog.test.ts`，涵盖导入去重、搜索分页、下架、鉴权与 CSRF、版本冲突、参数边界、ETag 与配额失败保留旧值。浏览器验证位于 `apps/web/tests/skills-market.test.ts`，覆盖桌面、手机、WebKit、安装复制、返回筛选以及后台导入编辑。

检查命令遵循项目根目录 `AGENTS.md`。数据库测试只对 `_test` / `_ci` 结尾的隔离数据库运行，不能连接真实业务库。新增模块无需付费模型调用。
