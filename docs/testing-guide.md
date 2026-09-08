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

## M6 / M6.5 当前验收状态

M6 上传任务生产化与 M6.5 发布前硬化已实现并通过真实环境验收：

- 后端 12 个测试类共 59 项全部通过；Admin/Viewer build 通过。
- Docker Compose 真实环境验收：`test-mcp-flow.sh` 主流程 29 项全过。
- M6 专项（真实 HTTP）：批量上传 3 有效 + 1 不可解码部分成功（rejected 带 `IMAGE_DECODE_FAILED`）、任务列表 `{items,page,pageSize,total,summary}`、任务详情扩展字段（progress/stage/attempts/maxAttempts/retryable/filename）、新会话刷新后从服务端恢复任务列表、SUCCEEDED 任务的 retry/cancel 均 409 `TASK_STATE_CONFLICT`、QUEUED 任务 cancel 后变 CANCELLED 且列表 summary 可见。
- M6.5 专项（真实 HTTP）：登录 5 次错误密码 401 后第 6 次 429 `RATE_LIMITED`；PASSWORD 解锁 5 次 403 后第 6 次 429；超 100MB 上传返回 413 `FILE_TOO_LARGE`；分享链接访问后 `lastAccessedAt` 记录、短期链接过期后 404、撤销后 404。
- M6.5 浏览器验证（Playwright/浏览器 MCP）：注册/登录表单无预填账密；创建空间自动跳转工作台；PRIVATE 创建文案为"仅持有有效分享链接的访客可访问"；上传 3 张照片 READY 后任务中心展示摘要、阶段、1/3 尝试与进度；分享弹窗提供"链接有效期"（7 天 / 30 天 / 永久，默认 30 天）；创建后有效期至恰为 30 天后；刷新页面后任务中心与分享列表从服务端恢复；Viewer `/g/`（无 slug）显示"相册空间未找到"而非 demo 内容。

注：密码策略下调与忘记密码重置按决策推迟到上线前准备阶段（M6.5 文档 2.2）。系统仍未提供 Gallery 密码设置 API/UI，因此 PASSWORD 的成功解锁仍未覆盖。

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

## M7.2 测试验收记录

M7.2 代码和核心运行态验收已完成，详细证据见 [`docs/m7-testing-results.md`](m7-testing-results.md)：

- [x] 后端 Maven 编译、测试和 package 通过（`mvn test`：48 项通过）。
- [x] Admin `npm run build` 通过。
- [x] Viewer `npm run build` 通过。
- [x] Docker/MySQL 已执行 V1–V10，V9/V10 成功，历史配置版本已迁移。
- [x] 真实 MinIO 已验证 WebP texture 对象、MIME、文件头和尺寸。
- [x] 3D Gallery 真实 HTTP 链路生成 TEXTURE，2D Gallery 真实 HTTP 链路跳过 TEXTURE。
- [x] 公开照片响应已增加可选 `mediumUrl` 和 `textureUrl`，旧 `thumbnailUrl` 字段保持兼容。
- [x] Viewer 浏览器页面已加载真实 Gallery，显示 3D/2D 控件；texture URL 已通过公开 API 和 MinIO 响应独立核验。

尚未完成的运行态专项：

- [ ] texture 编码失败、重试、取消和租约丢失场景。
- [ ] Viewer 端完整 LOD 距离切换、持续低 FPS 阶梯降级和 WebGL 失败回退。
- [ ] CDN、Meta 社交预览和性能基准。



- 当前文档、脚本不再使用旧 spaces/albums API（archive 除外）。
- 后端测试、Admin/Viewer build 和 Compose 健康检查通过。
- PUBLIC、PRIVATE、PASSWORD 的访问、错误、分页和恢复链路有自动化或等价运行态证据。
- 公开照片 URL 使用短期签名策略，不依赖永久公开对象地址。

## M7 测试验收标准

M7（Viewer 配置版本化、CDN 与 3D 性能优化）验收矩阵：

### 配置版本化

- [x] **草稿保存**: 真实 API 保存草稿成功，版本历史不新增，公开快照不改变
- [x] **发布创建版本**: 真实 API 连续发布创建新版本，数据库 `published_version_id` 指向生效版本
- [x] **回滚功能**: 真实 API 回滚创建第三个版本并恢复首个版本内容
- [x] **schema 校验**: 单测覆盖旧 schema_version 返回 `BAD_SCHEMA_VERSION`
- [ ] **权限控制**: VIEWER 角色真实 HTTP 403 尚未在本轮执行
- [x] **版本历史**: 真实 API 返回版本列表；Admin UI 构建通过

### TEXTURE 阶段

- [x] **3D Gallery 纹理生成**: 真实上传任务生成 `/{photoId}/texture` WebP 对象
- [x] **2D Gallery 跳过纹理**: 真实 2D Gallery 只生成 HIGH，不生成 TEXTURE
- [x] **进度阶段**: Worker 真实执行 TEXTURE 阶段并最终完成
- [x] **纹理质量**: 实际 WebP 为 1042×654，最长边小于 2048px，MIME 与文件头正确

### 性能降级

- [ ] **设备探测**: 代码存在 `deviceMemory`/CPU/移动端基础判断，但本轮未完成真实低端设备浏览器证据
- [ ] **LOD 切换**: 当前未发现按相机距离在 medium/texture 之间切换的完整实现
- [ ] **FPS 降级**: 当前未发现持续低 FPS 后关闭 particles → bloom → fog → DPR 的完整阶梯逻辑
- [ ] **WebGL fallback**: 当前仅有 context lost/restored 监听，未完成初始化失败切换 2D 和 Toast 的运行态闭环
- [ ] **移动端触控**: 代码存在 OrbitControls 和陀螺仪入口，真实移动端流畅性尚未验收

### CDN 与社交预览

- [ ] **媒体子域**: `media.vie-vibe.cn` 代理 MinIO，Nginx 配置 `Cache-Control: public, max-age=31536000, immutable`
- [ ] **版本化 key**: 对象 key 包含 hash 或时间戳（`/{photoId}-{hash}.webp`）
- [ ] **爬虫 Meta**: 微信/Telegram UA 请求返回静态 HTML，带完整 og/twitter meta
- [ ] **noindex 私有**: PRIVATE/PASSWORD 相册返回 noindex/nofollow，无 token 泄漏
- [ ] **社交分享**: 微信公众平台/Telegram Debugger 拿到正确卡片（标题/描述/封面）

### 回归测试

- [ ] **M4 发布**: DRAFT/PUBLISHED/ARCHIVED 状态流转正常
- [ ] **M5 授权**: OWNER/EDITOR/VIEWER 权限控制正确
- [ ] **M6 任务**: 上传任务队列/重试/取消功能正常
- [ ] **M6.5 限流**: 登录/解锁 429 RATE_LIMITED 正常触发

### 性能基准

- [ ] **3D 加载时间**: 100 张照片加载时间 < 3s
- [ ] **低端设备 FPS**: 降级后 FPS > 40
- [ ] **内存使用**: 峰值内存 < 500MB
- [ ] **首屏渲染**: < 1s
- [ ] **CDN 命中率**: > 80%（本地模拟）
- [ ] **社交预览成功率**: > 95%（3 种以上爬虫 UA）

### 测试工具与脚本

```bash
# 后端测试（M7 新增测试类）
cd apps/gallery-api
mvn test -Dtest=ViewerConfigVersionTest
mvn test -Dtest=TextureProcessorTest
mvn test -Dtest=PhotoProcessingWorkerTextureTest

# E2E 测试（Playwright）
cd apps/gallery-viewer
npm run test:e2e -- --grep "M7"

# CLI 流程扩展
bash test-mcp-flow.sh --features m7

# 性能测试
curl -w "@perf-curl-format.txt" -o /dev/null http://localhost:5174/g/{slug}
```

### 已知限制与TODO

- [ ] TEXTURE 阶段依赖 Gallery 配置判断 3D 模式（当前简化为 preset 名称包含"3d"）
- [ ] LOD 切换阈值可配置化（当前硬编码 10m）
- [ ] Meta 服务器无状态设计，生产需水平扩展
- [ ] CDN 回源 purge 接口未实现（当前依赖版本化 key 自然失效）
- [ ] 密码设置 API/UI 未实现，PASSWORD 解锁验收部分未完成
