# 业务角色增量升级预检

本次只开发、隔离测试、生成制品和做只读预检，未升级线上应用。

## 部署基线与维护分支

2026-11-24 通过 Sealos Console 核对 `ns-qkq5nbch` 的 Deployment 和运行中 Pod：

| 组件 | 当前镜像 | Deployment resourceVersion | 就绪副本 |
| --- | --- | --- | --- |
| Server | `tinet-acr.tinetcloud.com/public/iflytek/skillhub-server:v0.2.23` | `313088596` | 2/2 |
| Web | `tinet-acr.tinetcloud.com/public/iflytek/skillhub-web:v0.2.23` | `313086552` | 2/2 |

两份镜像的 OCI revision 都是 `2fe1a44059f51c1fa2e72ea3f1f3d59942e1e8be`，
与上游 `v0.2.23` annotated tag 的 peeled commit 相同；该基线已包含 Suite。
证据边界和 registry digest 见 [功能说明](business-roles.md)。
保留 `baseline/deployed-v0.2.23` 指针，PR 合入 `company/v0.2.23` 维护分支。
工作分支 `feat/business-role-filter` 使用独立 Herdr worktree，未修改部署仓和其他工作目录。

## 制品与验证

`.github/workflows/company-images.yml` 从维护分支合并提交构建 Server/Web，输出
`ghcr.io/raymondtc/skillhub-{server,web}:v0.2.23-company-<merge SHA 前12位>`，
同时输出完整 SHA 标签与 digest artifact。两个镜像均构建 `linux/amd64`、`linux/arm64`，
OCI revision 指向完整合并提交。企业镜像同步后须核对实际地址、平台清单及 revision。
具体合并 SHA、镜像 digest 和云效流水线回执在发布准备记录中补充，不能只用标签作为验收依据。

隔离验证覆盖：后端全量 2,428 项（0 失败、0 错误、2 项条件跳过），前端 1,097 项单元测试，
类型检查、Lint、生产构建，以及 Chromium 真实登录、Skill/Suite 多值设置、去重、清空、取消、
精确筛选、14 条结果的两页展示、URL 恢复、私有收藏、越权读写和移动端布局。
浏览器使用独立本机 PostgreSQL/Redis 与存储，公开 fixture 状态只在带任务标签的一次性数据库中构造。
CLI 的实际构建产物到 HTTP/PostgreSQL 的角色读写回归已通过；CLI 全量仍有一项在未修改基线上
也能复现的下载大小测试失败，详见 PR 验证说明。

## 发现的升级阻塞

线上 Web 不是单纯的镜像运行：Console 实际工作负载包含以下配置。

- `compatible-web-assets` emptyDir 覆盖 `/usr/share/nginx/html/assets`。
- `retain-v022-assets` initContainer 从 `v0.2.22-custom-de25f68e825b` 复制旧资源。
- `add-v023-assets` initContainer 从官方 `v0.2.23` 复制当前资源。
- 两者都运行 `cp -a /usr/share/nginx/html/assets/. /shared-assets/`。
- `skillhub-web-assets` ConfigMap 挂载两个钉钉 logo、`login-assets-fix.js` 和 Nginx 模板。

因此只更新 Web 主容器会使新 index 引用的资源不在挂载目录中，不能直接升级。
最小可选衔接是保留旧资源兼容 initContainer 和所有现有挂载，把 `add-v023-assets` 的镜像
与 Web 主容器一起指向同一份新 Web 镜像；也可增加最后执行的新镜像资源复制 initContainer。
这只是准备方案，本次不应用任何修改。后续需从 Console 核对实际 ConfigMap 内容及登录修复脚本
与新资源的兼容性，并隔离验证同样的挂载、Nginx 配置和钉钉登录流程。
当前 CLI 的 image-only upgrade 只更新主容器，无法完成该 initContainer 联动，预览通过不等于可发布。

`skillhub-pg` 和 `skillhub-redis` 均为 Running、2 副本；该状态不证明备份可恢复。
本次没有读取线上数据库内容或凭据，也没有执行线上迁移。正式升级前须核对备份完成时间及恢复路径。

## 后续执行顺序与回退

1. 重新核对实际镜像、resourceVersion、数据库备份和 Console 配置，解决上面的 Web 挂载兼容问题。
2. 先升级 Server 并验证健康与新 API，再以联动配置升级 Web；本次仅准备 preview，不执行。
3. 验收旧资源 `[]`、管理者双资源设置/清空、单角色筛选分页及普通用户越权拒绝；验证既有登录、
   下载、发布与 Suite 成员快照流程。业务角色与平台、namespace RBAC 独立。
4. 回退 Server/Web 到表内旧镜像，并恢复 Web 资源复制 initContainer 的旧镜像。
   新增的两张 `company_*` 关联表保持不动，旧应用忽略这些表；回退不删除业务角色数据。

迁移使用 `R__company_business_roles.sql`，只做幂等的新增表和索引，不占用上游 `V` 编号。
已验证旧 V75 数据升级、重复执行 DDL，以及后续模拟上游 V76，未修改 Flyway history 或启用 outOfOrder。

## 集成方对接回执

稳定契约见 [API 与 CLI 说明](business-roles.md)：
`GET/PUT /api/v1/{skills|suites}/{namespace}/{slug}/business-roles`，
PUT `{"businessRoles":["sales","customer-support"]}`，空数组清空；
返回 `data.businessRoles` 和 `data.canManageBusinessRoles`。
现有 `/api/v1/resources` 增加单值 `businessRole` 精确筛选，先来源权限和角色筛选再分页、计数。
候选键接口是只读发现 facet，不是角色管理目录。
当前发布门槛为 Web 挂载兼容性验证和生产备份核验，未授权也未执行线上升级。
