# VIE Gallery

VIE Gallery 是一个面向个人用户和创作者的照片相册产品：保存原始照片，整理相册记录，创作 2D/3D 展示体验，通过受控链接分享给访客，并在工作台中持续管理和更新。

## 当前阶段

当前唯一有效的产品与工程路线是 [`docs/personal-album-v1-plan.md`](docs/personal-album-v1-plan.md)，下一阶段具体任务见 [`docs/personal-album-v1-next-tasks.md`](docs/personal-album-v1-next-tasks.md)。本期目标是完成个人相册的 **备份、记录、创作、分享、管理** 闭环并上线；团队协作、多工作区、企业客户门户、复杂商业化等后期领域暂不纳入本期。

代码基线：`feat/gallery-workspace-slice`（2026-09-09）。提交后以该分支最新 hash 为准。

### 阶段状态

- M3.5 公开访问稳定化：核心完成。
- M4 发布与 SEO：核心完成。
- M5 成员与授权：核心完成，少量历史集成证据待补。
- M6 上传任务中心：完成并通过真实环境验收。
- M6.5 发布前硬化：完成并通过真实环境验收；密码重置仍是上线前阻断项。
- M7.1 配置版本化：已完成真实环境验收。
- M7.2 TEXTURE 与资源变体：已完成真实环境验收。
- M7.3 Viewer 性能与兼容：部分完成，LOD、低 FPS 阶梯降级和 WebGL 初始化失败回退尚未闭环。
- M7.4 CDN 与社交预览：未完成。
- M7.5 综合回归：待 M7.3/M7.4 和上线可靠性工作完成后执行。

M7 的当前证据见 [`docs/m7-testing-results.md`](docs/m7-testing-results.md)。不要将 M7.1/M7.2 的已验收事实与 M7 整体完成混淆。

## 当前用户路径

```text
注册/登录 → /app/ → 创建或选择相册 → /app/galleries/:id
                                      ├─ 上传、处理、整理照片
                                      ├─ 配置 2D/3D 展示并保存草稿
                                      ├─ 内部预览草稿（不改变公开 URL）
                                      ├─ 发布和回滚配置
                                      └─ 生成分享链接 → /g/:slug?t=<token>
```

访客路径：

```text
/g/:slug                  已发布的 PUBLIC 相册
/g/:slug?t=<token>        已发布的 PRIVATE 或受保护相册
```

创作者内部预览：

```text
POST /api/galleries/{id}/preview-token
→ /g/:slug?preview=<token>     15 分钟内可看草稿馆和当前配置草稿
```

未发布相册对无预览令牌的访客仍返回 404。当前 PRIVATE 语义是“仅持有有效分享 Token 的访客可访问”；登录用户直接访问 PRIVATE 属于上线后的后期能力。

## 主要目录

```text
apps/
├── gallery-api/       # Spring Boot 多模块 API
├── gallery-admin/     # Vue 3 + TypeScript 创作者工作台
└── gallery-viewer/    # Vue 3 + Three.js 公开展示端
packages/
└── gallery-contracts/ # 前后端共享 TypeScript 契约
infra/                 # Docker Compose、Nginx 和本地依赖
docs/                  # 当前规划、测试证据和历史归档
```

## 当前 API 概览

管理端：

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
GET  /api/galleries
GET  /api/galleries/{id}
POST /api/galleries
POST /api/galleries/{id}/photos
GET  /api/galleries/{id}/photos
PATCH /api/photos/{id}
DELETE /api/photos/{id}
POST /api/galleries/{id}/preview-token
POST /api/galleries/{id}/publish
POST /api/galleries/{id}/unpublish
POST /api/galleries/{id}/share-links
GET  /api/galleries/{id}/share-links
DELETE /api/share-links/{id}
GET  /api/galleries/{id}/viewer-config
PUT  /api/galleries/{id}/viewer-config
POST /api/galleries/{id}/viewer-config/publish
GET  /api/galleries/{id}/viewer-config/versions
POST /api/galleries/{id}/viewer-config/rollback
GET  /api/galleries/{id}/photo-tasks
```

公开端：

```text
GET  /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
GET  /api/public/g/{slug}/photos?page=0&pageSize=50
GET  /api/public/g/{slug}/viewer-config
```

公开端可通过 `X-Preview-Token` 或 `?preview=` 携带创作者预览令牌。有效令牌可读取对应草稿馆的照片和当前配置草稿；过期、错馆或缺失令牌时，未发布相册仍按不存在处理。公开照片和 `photoCount` 只包含 `READY` 且未软删除的照片。新分享链接统一使用 query Token；Viewer 暂时兼容旧的 `token` 参数和 `#s=` 格式。

## 本地启动

要求：Docker Compose、Java 17、Node.js 18+、npm、curl；ImageMagick 仅用于 CLI 测试生成测试图片。

```bash
# 构建后端（从仓库根目录）
cd apps/gallery-api
mvn -DskipTests package

# 启动 MySQL、Redis、MinIO 和 API
cd ../../infra
docker compose up -d

# 启动 Admin 与 Viewer（另开终端）
cd ..
bash start-frontend.sh
```

本地宿主端口由 `infra/.env` 控制，当前默认值如下：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| API | <http://localhost:8088> | 宿主端口；容器内部为 8080 |
| Admin | <http://localhost:5173> | 创作者工作台 |
| Viewer | <http://localhost:5174> | 公开展示端 |
| MySQL | `localhost:3307` | 宿主端口；容器内部为 3306 |
| Redis | `localhost:6379` | Session 和任务状态 |
| MinIO API | <http://localhost:9000> | 本地对象存储 |
| MinIO Console | <http://localhost:9001> | 对象存储控制台 |

如果修改 `infra/.env`，同步设置 `API_BASE`、`ADMIN_UI`、`VIEWER_UI` 或让脚本读取对应环境变量。

## 测试与验收

唯一的当前测试入口是 [`docs/testing-guide.md`](docs/testing-guide.md)。常用命令：

```bash
# 后端测试
cd apps/gallery-api && mvn test

# 前端构建
cd ../gallery-admin && npm install && npm run build
cd ../gallery-viewer && npm install && npm run build

# 服务启动后运行当前 API CLI 流程
cd ../..
bash test-mcp-flow.sh
```

当前 M6/M6.5 和 M7.1/M7.2 的真实环境证据已记录；M7.3/M7.4/M7.5、完整集成测试、密码重置和备份恢复仍是个人相册 V1 上线前工作，详见 [`docs/personal-album-v1-plan.md`](docs/personal-album-v1-plan.md)。

## 文档入口

- [`docs/personal-album-v1-plan.md`](docs/personal-album-v1-plan.md)：个人相册 V1 唯一产品与工程总规划
- [`docs/testing-guide.md`](docs/testing-guide.md)：当前运行、测试和上线验收入口
- [`docs/m7-testing-results.md`](docs/m7-testing-results.md)：M7 当前真实环境验收证据
- [`docs/archive/README.md`](docs/archive/README.md)：历史资料边界和回溯说明
- [`CONTRIBUTING.md`](CONTRIBUTING.md)：提交与协作约定

历史阶段的设计和故障记录位于 `docs/archive/`，不作为当前 API、端口、产品状态或开发步骤依据。
