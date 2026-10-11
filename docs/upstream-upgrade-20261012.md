# 2026-10-12 上游同步、fork 与本地验证

已把本地基础从 `8e34e05` 更新到上游 [`931a4eb5edf344b12b9e65f0d039f7c52a2e0792`](https://github.com/KKKKhazix/AIHOT/commit/931a4eb5edf344b12b9e65f0d039f7c52a2e0792)，共 32 个提交、133 个文件。本地服务已使用新版镜像，本站定制已保存到[个人 fork](https://github.com/niu1147713149-png/AIHOT)。

本站代码提交：[`e43fe58`](https://github.com/niu1147713149-png/AIHOT/commit/e43fe58f0e84479ffe176ab3c322b0cb1170cd36)。本记录、原站研究和[二次开发任务](development-roadmap.md)另存为文档提交。新增业务模块仍按任务清单逐批开发。

## 仓库与合并

| 远程 | 地址 | 用途 |
|---|---|---|
| `origin` | `https://github.com/niu1147713149-png/AIHOT.git` | 保存本站定制与开发工作 |
| `upstream` | `https://github.com/KKKKhazix/AIHOT.git` | 获取开源引擎更新 |

更新前保存了 16 个本地改动 / 未跟踪文件、二进制 diff、原提交信息、Git 远程配置和私有环境配置，并保留名为 `AI opportunity radar before upstream upgrade 2026-10-12` 的 stash。工作树先暂存到 stash，再执行快进更新，随后无冲突恢复定制。

本机 Git 的旧代理 `127.0.0.1:10809` 不可用，直连 GitHub 的 Git 传输也多次超时 / 重置。因此先由 GitHub 官方 API 核验主分支完整提交哈希，再通过公开代码中转以该固定哈希执行 `pull --ff-only`。未把中转设为仓库远程，未向中转提供凭据。

fork 创建和本站提交同步使用 GitHub 官方 API。写入时核对登录账号与 fork 归属，对每个提交验证本地与 GitHub 的 tree、commit 哈希完全相同，并要求远程 `main` 从预期父提交快进；不强推。源码远程保留 GitHub 官方地址。后续普通 `fetch / push` 仍需本机 Git 网络连接可用，这次没有修改全局代理配置。

本站合并后保留 AI机会雷达品牌、国内业务取向、21 个 RSS 信源、44 个主题和原有门槛。新版 `NAV.hidden` 合并成功且为空；`industry/wording.ts` 保持空词表，不新增改用词调用。站点的 GitHub 入口改为个人 fork。

上游新增的一项改用词测试把“推荐理由”写死；改为引用 `ITEM_COPY.reasonLabel`，验证每个命中的字段仍然向模型正确命名，从而适配本站的“应用价值”。没有放宽断言、关闭测试或改动共享引擎行为。

## 验证结果

环境：Linux Docker 中 Node.js 24.21.0、PostgreSQL 17，使用全新 `aihot_upgrade_test` 测试实例和内部网络。测试未注入生产 `.env`，模型与外部服务均为本地假服务。Playwright 使用项目配套的 Chromium / WebKit。

| 检查 | 最终结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm run build -w @aihot/web` | 通过 |
| `npm test` | 747/747 通过 |
| `node --test apps/web/tests/*.test.ts` | 49/50 通过，1 项 WebKit 阅读锚点恢复失败 |
| 未定制上游的导航测试对照 | 9/10 通过，同一锚点用例失败 |
| Docker 部署镜像构建 | 通过 |
| `node scripts/smoke.ts --base http://localhost:3080` | 30/30 通过，包含页面、公开接口、RSS 和 MCP |
| 部署后页面读取 | 首页、主题、关于页正常；`/more` 包含阅读字体选项和 fork 链接；未登录访问 `/admin` 正常回到登录页 |

唯一未解决用例：`deep reading returns to its anchor, including folded dates`，位于 `apps/web/tests/navigation-performance.test.ts`。折叠日期、进入长列表文章再返回时，要求恢复原阅读位置，但本站与未定制上游均超出位置误差。该问题已纳入 RD-02；目前不能将网页回归声称为全部通过，也未据此推断所有真实 Safari 设备都会复现。

首轮后端验证因测试镜像继承旧网页产物，导致新版页面元数据测试读取了旧版 HTML；重新构建后复测通过。首轮网页测试另遇到临时端口争用，完整重跑后该问题未复现，未通过修改应用来规避。首轮日志和最终日志均保留。

今后在新检出目录中按以下顺序验收，确保新增页面元数据测试读取当前构建：

```text
npm run typecheck
npm run build -w @aihot/web
npm test                                  # DATABASE_URL 只指向独立 *_test / *_ci 数据库
node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3080
```

## 本地部署与恢复资料

按部署文档完成构建、正常停止 api / worker / web、备份数据库和本地附件、迁移、种子数据补齐及重新启动。worker 使用 Compose 配置的 210 秒退出宽限；没有强杀在途调用。

本次只新增两个索引迁移：

- `0083_publications_selected_source_idx.sql`
- `0085_grouping_decisions_fact_idx.sql`

两条均成功记账；没有改旧迁移，没有重置数据库。seed 结果为 0 个新来源、21 个已有来源。四个常驻服务正在运行，`setup` 以 0 退出是正常状态。

本地入口为 `http://localhost:3080/`，后台为 `/admin`。模型为 `gpt-6.1-sol`，采集与模型处理保持开启，`.env` 与本次备份逐字节一致。没有启用新的付费采集服务或通知；验证没有额外发起真实模型测试。

以下恢复资料只保存在被 Git 忽略的本地目录，不在 fork 中：

```text
.data/upstream-upgrade-20261012-003710/
  manifest.json / files/ / working-tree.patch
  private/.env / private/.git/config
  database-before.dump / database-backup-toc.txt
  files-before.tar.gz / data-backup.json
  runtime-before.json / runtime-after.json
  typecheck-final.log / backend-tests-final.log / web-build.log
  web-tests-final.log / upstream-navigation-tests.log
  production-build.log / migrate.log / deploy.log / smoke.log
```

数据库备份约 12.3 MB，已用 `pg_restore -l` 校验可读取目录。备份时附件目录不存在，附件归档为空；这不代表丢失了数据库中的外部图片引用。旧应用镜像保留为 `aihot-app:before-upstream-20261012`。数据库和文件的 SHA-256 写在本地备份清单中。

本轮专用测试容器、测试数据库及其匿名卷、内部网络和临时检查镜像已清理；生产卷、旧部署镜像、既有浏览器缓存镜像、源码 stash 及本地验证日志继续保留。

需要回退时先核对当前数据与这份备份之后的新增记录。此次只增加索引，回到旧应用镜像通常可以保留新索引，但应先在副本验证；涉及恢复数据库时使用独立空库演练，再安排切换，不执行 `docker compose down -v` 或直接覆盖现有数据。备份可列出不等于本轮已完成全量恢复演练。

## 后续状态

基础更新和 fork 已完成。剩余功能按开发计划执行，优先本地可靠性、大事记、本站 Skill、模型资料和价格表；完整榜单及性价比图依赖可靠的模型 / 评测 / 价格数据。既有 100 条样本仍是待用户确认的 AI 初标，未当作人工金标或用于修改门槛。

尚未设置新的月度金额预算、扩大付费来源或启用宿主登录自启。域名、运营主体和隐私条款继续按此前决定延后。
