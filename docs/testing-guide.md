# VIE Gallery 测试与验收指南

本文档是当前测试入口。所有示例以 Gallery API、UUID 和 `infra/.env` 的端口为准；旧的 spaces/albums API 资料已移入 [`docs/archive/`](archive/)。

## 环境要求

- Docker Compose
- Java 17+
- Node.js 18+
- npm、curl
- ImageMagick（可选，仅 CLI 流程用于生成测试图片）

## 服务地址

启动 `infra/docker-compose.yml` 后，宿主端口由 `infra/.env` 控制，当前默认值为：

| 服务 | 地址 |
| --- | --- |
| API | <http://localhost:8088> |
| API 健康检查 | <http://localhost:8088/actuator/health> |
| Admin | <http://localhost:5173> |
| Viewer | <http://localhost:5174> |
| MySQL | `localhost:3307` |
| Redis | `localhost:6379` |
| MinIO API | <http://localhost:9000> |
| MinIO Console | <http://localhost:9001> |

API 容器内部仍监听 8080；8088 是当前 Compose 的宿主映射，不要把两者混用。

## 启动和停止

```bash
# 构建后端 jar
cd apps/gallery-api
mvn -DskipTests package

# 启动后端依赖和 API
cd ../../infra
docker compose up -d

# 启动两个前端（另开终端）
cd ..
bash start-frontend.sh

# 停止服务；不要默认删除数据卷
docker compose -f infra/docker-compose.yml down
```

## 自动化检查

### 后端

```bash
cd apps/gallery-api
mvn test
mvn -DskipTests verify
```

重点测试公开访问、分享 Token、密码 Session、READY 过滤和分页：

- `PublicAccessFacadeTest`
- `PublicGalleryControllerTest`
- `ShareLinkFacadeTest`

### 前端

```bash
cd apps/gallery-admin
npm install
npm run build

cd ../gallery-viewer
npm install
npm run build
```

Viewer build 应包含 TypeScript 检查；前端单测配置完成后，使用各应用 package.json 中声明的 test 命令运行。

### CLI 主流程

服务健康后，从仓库根目录运行：

```bash
bash test-mcp-flow.sh
```

可通过环境变量覆盖地址：

```bash
API_BASE=http://localhost:8088 \
ADMIN_UI=http://localhost:5173 \
VIEWER_UI=http://localhost:5174 \
bash test-mcp-flow.sh
```

脚本应只调用当前接口：

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/me
POST /api/galleries
GET  /api/galleries
GET  /api/galleries/{id}
POST /api/galleries/{id}/photos
POST /api/galleries/{id}/publish
POST /api/galleries/{id}/unpublish
GET  /api/galleries/{id}/photos
POST /api/galleries/{id}/share-links
GET  /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
GET  /api/public/g/{slug}/photos
POST /api/auth/logout
```

M4 当前 CLI 已验证：新 Gallery 为 DRAFT、上传并等待 READY、发布后公开访问、PRIVATE Token、PASSWORD 前置状态和分享列表。尚未覆盖：撤回后重新发布、撤销链接后旧 Token 失效、PASSWORD 成功解锁及 Session 过期。

脚本失败时应输出 HTTP status、endpoint、业务 code 和 requestId。不要用旧的数字 Space ID、Album ID 或只通过 grep 响应字符串判断成功。

## 发布验收矩阵

- 新 Gallery 默认 `DRAFT`，匿名公开端返回 404。
- 至少一张 READY 照片后才可 publish。
- PUBLISHED PUBLIC 页面可访问；Viewer 页面为 `index,follow` 且 canonical 不含 Token。
- unpublish 后公开端立即返回 404；Viewer 设置 `noindex,nofollow` 并清理 canonical。
- DRAFT/ARCHIVED 无法创建新分享链接，已有 Token/Session 不得绕过发布状态。
- Docker Compose 本地默认以 `host.docker.internal:9000` 作为签名 URL 公开端点；生产必须通过 `STORAGE_PUBLIC_ENDPOINT` 设置真实外部地址。

## 公开访问验收矩阵

### PUBLIC

- 无登录、无 Token 打开 `/g/:slug` 成功。
- 只返回 READY 且未软删除的照片。
- `photoCount`、分页 `total` 与实际照片数量一致。
- 空相册返回空列表，不返回 404。

### PRIVATE

- 无 Token 显示需要分享链接。
- 当前 Gallery 的有效 Token 可访问。
- 其他 Gallery、无效、过期和撤销 Token 均被拒绝。
- 新链接格式为 `/g/:slug?t=<rawToken>`。

### PASSWORD

- 未解锁显示密码输入。
- 正确密码创建当前 Gallery 绑定的短期 Session。
- 错误密码不会创建授权 Session。
- Session 过期或跨 slug 使用时回到密码输入/明确拒绝。

### 分页和错误

- `page >= 0`、`1 <= pageSize <= 100`。
- 非法参数返回 400/422，不产生负 offset。
- 401、403、404、409、429、5xx、HTML body、空 body 和网络断开都显示可恢复状态。
- Viewer 不展示 stack trace、tenantId、tokenHash、对象 key 或内部异常。

## 浏览器 E2E 手工流程

1. 打开 <http://localhost:5173>，注册并登录。
2. 创建 Gallery，确认跳转到 `/app/galleries/{id}`。
3. 上传一张图片，等待状态变为 READY。
4. 设置封面并打开配置页，刷新后确认上下文仍存在。
5. 发布 Gallery，确认工作区显示已发布状态，Viewer 可访问。
6. 创建分享链接，确认链接使用 `/g/{slug}?t=`；检查列表与撤销确认。
7. 撤回发布，确认公开端 404、Viewer noindex；重新发布后按 visibility 恢复访问。
8. 分别验证 PRIVATE Token、PASSWORD 解锁、错误密码、过期 Session、空相册和不存在 slug。
9. 在 390px 移动端宽度检查无横向溢出和错误恢复入口。

已知限制：当前尚无 Gallery 密码设置 API/UI，因此 PASSWORD 的成功解锁只能在补齐该能力后验收。

## M5 当前验收状态

已完成：

- 后端 44 项测试全部通过。
- Admin/Viewer/shared contracts 构建通过。
- Docker V7 migration 和健康检查通过。
- OWNER/EDITOR/VIEWER 的 `/api/me` role/capabilities 已验证。
- OWNER 成员列表、添加 EDITOR、EDITOR/VIEWER 受限写操作 403 已验证。
- OWNER Admin 成员页和添加成员交互已通过浏览器 MCP 验证。

待补：

- 三角色完整 HTTP API 矩阵。
- V7 从已有 V1–V6 数据升级报告。
- 最后 OWNER 并发保护集成测试。
- 成员移除后旧 Session 失效验证。
- EDITOR/VIEWER 完整浏览器交互验收。

## M6 预验收入口

M6 上传任务生产化尚未实现。任务列表、详情扩展、retry、cancel、刷新恢复、批量部分成功和 Worker 可观测性计划见 [`next-slice-upload-task-productionization.md`](next-slice-upload-task-productionization.md)。当前 `test-mcp-flow.sh` 不调用这些规划中的接口。

## 故障排查

```bash
# 服务状态和日志
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f gallery-api

# API 和 MinIO 健康检查
curl -i http://localhost:8088/actuator/health
curl -i http://localhost:9000/minio/health/live

# 前端日志
# Admin: /tmp/vie-admin.log
# Viewer: /tmp/vie-viewer.log
```

如果 API 无法访问，先检查 `infra/.env` 的宿主映射，再检查容器内 8080 监听；不要直接把脚本改回 8080。若图片地址在浏览器不可达，检查 `STORAGE_PUBLIC_ENDPOINT`、反向代理和对象存储签名策略。

## 当前质量门槛

进入下一阶段发布能力前，必须满足：

- 当前文档、脚本不再使用旧 spaces/albums API（archive 除外）。
- 后端测试、Admin/Viewer build 和 Compose 健康检查通过。
- PUBLIC、PRIVATE、PASSWORD 的访问、错误、分页和恢复链路有自动化或等价运行态证据。
- 公开照片 URL 使用短期签名策略，不依赖永久公开对象地址。
