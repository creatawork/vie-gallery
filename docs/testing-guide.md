# VIE Gallery 测试与验收指南

本文档是个人相册 V1 当前唯一的运行、测试和上线验收入口。产品与工程范围见 [`personal-album-v1-plan.md`](personal-album-v1-plan.md)，M7 事实证据见 [`m7-testing-results.md`](m7-testing-results.md)。历史资料位于 [`archive/README.md`](archive/README.md)，不作为当前测试依据。

## 当前验收快照

> 快照日期：2026-09-09。以下状态以真实环境报告和近期提交为准，不以旧计划中的未勾选清单为准。

### 已完成并有验收证据

- M3.5 公开访问稳定化核心链路。
- M4 发布状态、公开隔离、分享撤销和 SEO 基础。
- M5 OWNER/EDITOR/VIEWER 核心授权和成员管理。
- M6 上传任务列表、详情、部分成功、重试、取消和刷新恢复。
- M6.5 登录/密码解锁限流、413 语义、PRIVATE 语义和分享访问记录。
- M7.1 Viewer 配置草稿、发布、版本历史、schema 校验和回滚。
- M7.2 3D Gallery 生成 WebP TEXTURE，2D Gallery 跳过 TEXTURE。
- 创作者内部草稿预览：`POST /api/galleries/{id}/preview-token`，公开端接受 `X-Preview-Token` 或 `?preview=`；无令牌时未发布相册仍 404。
- **P0-01 基础质量与集成测试门禁**：文档链接检查、前端类型检查、前端构建、后端单元测试与 Testcontainers 真实依赖集成测试，Playwright smoke 测试套件。
- **P0-03 账户密码恢复与 Gallery 密码设置**：忘记密码/重置密码和 Gallery PASSWORD 设置/清除已完成。
- **P0-04 生产安全与部署基线**：配置分环境（`application-prod.yml`）、生产弱口令校验器、健康检查探针（`DependencyHealthIndicator`）、Nginx 安全响应头与 multi-stage Dockerfile 镜像。
- **P1-01 统一上传状态与任务中心**：移除独立轮询，任务中心成为唯一事实来源，支持本地占位与远端合并、汇总条与状态过滤。
- **P1-02 完善相册总览与管理摘要**：`GallerySummary` 聚合照片数、处理中数、失败数与待发布配置，总览支持状态筛选与排序。
- **P1-04 统一发布中心**：`GET /api/galleries/{id}/publish-readiness` 发布前就绪检查，三阶段统一发布面板，一键发布与撤回发布。

### 部分完成或待验收

- M7.3：设备能力基础判断存在；LOD、持续低 FPS 阶梯降级、WebGL 初始化失败自动回退 2D 和完整移动端证据未完成。
- M7.4：媒体 CDN、缓存策略、社交爬虫 Meta 静态壳和真实社交平台验收未完成。
- M7.5：需要在本期可靠性、Viewer 和分发能力完成后执行综合回归。
- 真实 MySQL/Redis/MinIO 集成测试和备份恢复演练仍是 P0-01 后续工作。
- CI 已覆盖文档链接、类型检查、前端构建和后端单元测试；真实依赖集成测试待补齐。
- P0-02 上传/对象/任务/配额一致性修复待开始。
- P0-04 生产安全配置和部署基线锁定待开始。
- **P0-05 可观测性、指标与恢复手册**：`GalleryMetrics` 业务指标、全链路 `requestId` 追踪与 [`operations-recovery.md`](operations-recovery.md) 运维恢复手册已建立。

### 待后续演进（V1 Ready 后）

- 生产 SMTP 邮件服务器接入。
- P1-06~08 Viewer 深度性能与移动端高级手势。

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

### CI 质量门禁

GitHub Actions workflow（`.github/workflows/quality.yml`）已配置，但**暂不绑定 push/PR 自动触发**（尚无生产服务器与域名）。需要时在仓库 **Actions → Quality → Run workflow** 手动执行。

日常开发在本地跑：

```bash
# 全仓全量验证（文档链接 + 前端类型检查 + 前端构建 + 后端单元/集成测试）
npm run verify:full
```

### 本地全量验证与测试

```bash
# 本地快速前端与文档验证
npm run verify

# 本地完整验证（含后端 23 个测试套件）
npm run verify:full

# 运行后端单元测试与集成测试
mvn test
```

重点测试公开访问、分享 Token、创作者预览令牌、密码 Session、发布就绪检查、任务状态和配置版本：

- `GalleryLifecycleIntegrationTest`（集成测试：注册、登录 Session、创建相册、发布就绪阻断、预览令牌公开隔离与鉴权）
- `GalleryControllerTest`（相册摘要、多状态任务统计与待发布配置、发布就绪检查）
- `ProductionConfigValidatorTest`（生产环境弱口令拦截校验）
- `PublicAccessFacadeTest`（含未发布相册 + 有效预览令牌可见、无令牌仍 404）
- `PublicGalleryControllerTest`
- `ShareLinkFacadeTest`
- `PhotoProcessingTaskStateMachineTest`
- `GalleryViewerConfigVersioningTest`
- `RedisRateLimiterTest`

### 本地前端检查与 E2E Smoke

```bash
# 安装依赖（首次或依赖更新后）
npm ci

# 类型检查
npm run typecheck

# 构建
npm run build

# 统一验证（文档链接 + 类型检查 + 构建）
npm run verify

# 运行 Playwright smoke 测试（需启动本地前端环境）
npm --workspace apps/gallery-admin run test:e2e
```

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

脚本应只调用当前 Gallery 接口，不使用旧的 spaces/albums API、数字 ID 或只通过 grep 响应字符串判断成功。失败时应输出 HTTP status、endpoint、业务 code 和 requestId。

当前 CLI 已验证注册、登录、Gallery 创建、上传 READY、发布、PRIVATE Token、PASSWORD 前置状态、分享列表和登出。创作者草稿预览令牌由单元测试和浏览器手工流程覆盖，尚未纳入 CLI。撤回后重新发布、撤销 Token、PASSWORD 成功解锁等场景在补齐能力后执行。

## 个人相册 V1 验收矩阵

### 备份与任务恢复

- 原始照片成功进入私有对象存储，数据库对象记录和任务记录可追踪。
- 3D 相册生成 HIGH/TEXTURE 变体，2D 相册不生成 TEXTURE。
- 单批次部分成功不会阻断有效照片；失败文件有明确错误和重试入口。
- QUEUED/PROCESSING 任务可取消；失败任务按策略可重试。
- Worker 租约丢失、服务重启后任务可恢复或进入可修复状态。
- 删除、对象清理和配额释放具备幂等语义；取消与完成竞态不重复释放。
- 备份、恢复、孤儿对象扫描和配额对账有可执行记录。

### 记录与策展（WP-6 验收路径）

1. **状态筛选与角标**：上传多张照片，切换「全部 / 已就绪 / 处理中 / 失败」筛选标签，照片数量与状态统计一致，状态角标全中文无英文泄漏。
2. **多选与批量删除**：多选若干照片（或点击「全选当前」），底部浮出批量操作栏；点击「批量删除」弹出 ConfirmModal 二次确认（文案「从展厅移除，不可撤销」），确认后调用 `DELETE /api/photos/{id}` 并自动刷新照片列表与总数。
3. **标题编辑**：点击照片打开 Lightbox，在底部点击标题进入即席编辑，输入新标题后按 Enter 键保存，成功持久化到后端并刷新。
4. **排序调整**：在照片卡片操作菜单或 Lightbox 顶部操作区点击「前移」或「后移」，照片在列表中位置更新，后端保存递增 `sortOrder`。
5. **失败重试**：当有处理失败任务时，在「失败」分类或浮动栏点击「重试失败项」，重新发起重试排队。
6. **相册封面设置**：在卡片菜单或 Lightbox 点击「设为封面」，封面徽章即时呈现，且返回相册总览后展示对应的封面缩略图。

### 用户自助与密码恢复（WP-9 验收路径）

1. **忘记密码申请**：在未登录页面点击「忘记密码？」，输入已注册邮箱点击发送；无论邮箱是否存在均展示统一安全提示（不泄露邮箱注册状态）。
2. **重置密码落地**：通过重置链接 `/reset-password?token={token}` 进入重置页面，自动填充或手动输入重置令牌（校验 43-128 字符）。
3. **新密码设定与登录**：输入至少 12 位新密码并确认，提交后密码更新成功；点击「前往登录」可使用新密码正常登录系统。

### 创作与发布

- 2D 和 3D Viewer 均可用；配置草稿不会直接改变访客公开版本。
- 保存草稿、发布、版本历史和回滚行为有真实 API 与浏览器证据。
- 创作者可以预览草稿：工作台签发 15 分钟预览令牌，Viewer 以 `?preview=` 打开草稿馆和配置草稿；令牌不写入公开 URL、canonical 或分享链接。
- 无预览令牌时 DRAFT/ARCHIVED 对访客 404；发布前至少有一张 READY 照片才对外展示。
- 配置 JSON 有 schema、大小和数值范围校验。

### 分享与交付体验（WP-7 验收路径）

1. **分享交付面板与访问模式**：展厅发布后点击「分享」打开 `ShareDeliveryPanel`，正确显示相册访问模式（PUBLIC / PRIVATE / PASSWORD）。
2. **相册密码设置与清除**：PASSWORD 模式下，OWNER 可在面板中设置或清除访问密码（校验至少 6 位）；访客进入时输入正确密码解锁 30 分钟临时会话。
3. **访客下载权限联动**：面板中只读展示「访客下载照片」权限状态（默认关闭），点击直达展厅配置修改；开启后访客端 Lightbox 展示下载按钮（下载 medium 画质），关闭后隐藏。
4. **分享链接生成与交付确认态**：选择有效期（7/30/90/永久），点击「生成交付链接」，成功进入交付确认态，展示完整链接、剩余时间、一键复制与交付说明。
5. **已有链接管理与访问记录**：列表呈现所有有效、已过期与已撤销的分享链接，包含创建时间、剩余有效时间、最近访问时间（未访问显示「尚未访问」）；点击「撤销链接」弹出 ConfirmModal 二次确认，撤销后该链接立即失效拒绝访问。

### Viewer 兼容与性能

- WebGL 初始化失败自动切换 2D 并显示可理解提示。
- 远景使用 medium，近景使用 texture；资源按视野加载，切换无明显闪烁。
- 低 FPS 持续后按阶梯关闭粒子、Bloom、Fog 和高 DPR，并具备防抖。
- 3D/2D 多次切换后无监听器、动画帧、纹理和旧 Mesh 泄漏。
- 390px 移动端无横向溢出，单指旋转、双指缩放和触屏标签可用。
- 采集首屏、首张照片、100 张照片、FPS、峰值内存和 2D fallback 指标。

## 发布验收门槛

个人相册 V1 只有在以下条件全部满足后才可上线：

1. 注册→创建→上传→处理→整理→配置→预览→发布→分享→访客访问全链路通过。
2. PUBLIC/PRIVATE/PASSWORD 访问矩阵通过，且私密资源无泄露证据。
3. OWNER/EDITOR/VIEWER 不越权；历史权限补证不影响当前上线结论。
4. 任务失败、重试、取消、租约丢失和服务重启有可恢复路径。
5. 任意设备至少可以使用 2D 浏览；3D 失败不会白屏。
6. CI、集成测试、迁移、备份恢复、监控、告警和回滚说明齐备。
7. 生产环境没有默认账号、弱口令、非 Secure Session Cookie 或 demo 内容。
8. 上传失败、队列积压、存储异常和公开访问异常可被发现和定位。

## 浏览器手工流程

1. 打开 <http://localhost:5173>，注册并登录。
2. 创建相册，确认跳转到 `/app/galleries/{id}`。草稿状态下点「预览展厅」，应打开带 `?preview=` 的访客页而不是「相册空间未找到」。
3. 复制不含 `preview` 的 `/g/{slug}`，确认未发布相册对匿名访客仍 404。
4. 上传多张图片，确认投放后任务中心立即出现排队/完成行，不必刷新页面。
5. 设置封面、标题和顺序，刷新后确认工作区上下文仍存在。
6. 打开配置页：右侧嵌入内部预览或诚实空态（不要出现端口号）；保存草稿后预览更新，发布后再确认无令牌的公开端只显示已发布配置。
7. 用 Esc 关闭新建空间、添加成员和确认删除，焦点应回到触发按钮。
8. 发布相册，创建 7 天/30 天/永久分享链接，复制链接并验证访问。
9. 撤回发布，确认公开端 404/noindex；重新发布后按 visibility 恢复访问。
10. 验证 PRIVATE Token、PASSWORD 错误限流、过期 Session、空相册和不存在 slug。
11. 禁用/模拟不可用 WebGL，确认自动切换 2D；在 390px 宽度检查交互和错误恢复入口。

## M7 当前证据

详细证据见 [`m7-testing-results.md`](m7-testing-results.md)：

- M7.1 配置版本化真实 API、数据库迁移、发布和回滚已通过。
- M7.2 3D TEXTURE WebP 和 2D 跳过 TEXTURE 已通过真实 MinIO/HTTP 验收。
- M7.3 LOD、低 FPS 阶梯降级、WebGL 初始化失败回退尚未形成闭环。
- M7.4 CDN、Meta 社交预览和真实性能基准尚未验收。

## 故障排查

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f gallery-api
curl -i http://localhost:8088/actuator/health
curl -i http://localhost:9000/minio/health/live
```

如果 API 无法访问，先检查 `infra/.env` 的宿主映射，再检查容器内 8080 监听；如果图片地址不可达，检查 `STORAGE_PUBLIC_ENDPOINT`、反向代理和对象存储签名策略。

## 历史补证与当前阻断项

M3.5、M4、M5 的少量历史浏览器、并发和升级报告可以在上线后补充，不得替代本期核心安全、数据一致性、2D 保底、密码恢复和集成测试门槛。所有未完成项以 [`docs/personal-album-v1-plan.md`](personal-album-v1-plan.md) 的里程碑为准。
