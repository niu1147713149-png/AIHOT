# AIVANE 上游同步与定制交付

日期：2026-10-14。上游为 `KKKKhazix/AIHOT`，同步目标为个人 fork `niu1147713149-png/AIHOT` 的 `main`。

## 合并范围

从上次基线 `931a4eb` 合并至 `e57da5a4f151892a217529744cd68803aec580df`，共 8 个上游提交，保留合并历史，没有代码冲突。新增精选“只看未读”筛选，补入 SelectBench 金标一致性、额度等待恢复、当前模型告警和地址、图片、材料安全边界修复。

本次提交还包含此前在本地完成的 AIVANE 品牌、网站图标与分享字标、模型榜及性价比图、17 个厂商图标、Tibo 监控与日历，以及模块测试和操作说明。模型榜与监控的来源和使用范围见 [ai-tools 模块](../modules/ai-tools/README.md)。本站国内应用取向、21 个信源、已有接口标识与模型配置继续使用现有设置。

`.env`、密钥、数据库、抓取快照、测试日志和设计草稿不属于源码提交。源码检查未发现本地凭据或高置信度密钥格式；生成目录加入共享忽略规则。

## 验证

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test`，隔离数据库 | 770 / 770 通过 |
| Web 构建和生产 Docker 镜像 | 通过 |
| `node --test apps/web/tests/*.test.ts` | 55 / 56 通过；新增 6 项未读筛选测试全部通过 |
| `node --test modules/ai-tools/tests/web.browser.ts` | 3 / 3 通过 |
| `node scripts/smoke.ts --base http://localhost:3080` | 30 / 30 通过 |
| 数据库迁移历史与在线安全 | 在 Git 暂存树的 LF 导出中通过；现有迁移没有修改 |
| 本地接口与内容 | 模型榜、Tibo 页面及两个数据接口均为 HTTP 200；首页含 AIVANE 与未读筛选；已有文章的中文全文仍有 2555 字符 |

仍存在先前已复现的 WebKit 滚动恢复失败：`apps/web/tests/navigation-performance.test.ts:285` 的 `deep reading returns to its anchor, including folded dates`。本次保留原测试和滚动实现，没有通过跳过测试掩盖失败；它仍属于路线图 RD-02。这里记录的是本地检查，不代表 GitHub Actions 的运行结果。

Windows 的 CRLF 工作副本会让迁移检查将换行差异视为历史 SQL 被修改，因此使用 `git -c core.autocrlf=false checkout-index` 导出的暂存文件运行原检查。未修改历史迁移，也未关闭检查规则。

## 本地运行与恢复

本地 api、worker、web 使用镜像 `aihot-app:upstream-e57da5a-20261014`，端口为 `127.0.0.1:3080`。更新前保存的镜像为 `aihot-app:before-upstream-e57da5a-20261014`；数据库和私有配置备份在本机忽略目录 `.data/upstream-sync-20261014/backup/`。工作区改动另存 Git stash，标记为 `AIVANE customization before upstream sync 2026-10-14`。

日志位于本机 `.data/upstream-sync-20261014/`。备份与日志不会上传；本次是本地更新和源码同步，不涉及公网网站发布。
