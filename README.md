# VIE Gallery

VIE Gallery 是一个面向创作者的照片空间与分享平台。创作者可以创建 Gallery、上传照片、配置 3D 展示并通过稳定 URL 分享给访客；访客通过 Viewer 浏览公开内容。

当前分支已完成 Gallery 工作区、M3.5 公开访问稳定化、M4 发布状态核心实现和 M5 协作授权核心实现。M5 已支持 OWNER / EDITOR / VIEWER、成员 CRUD、统一 Facade 授权和 Admin 成员页；后端 44 项测试、Admin/Viewer build、Docker API 三角色和 OWNER 成员页已验证。M5 的真实 HTTP 全矩阵、V7 升级演练、最后 OWNER 并发、旧 Session 失效和部分浏览器证据仍待补。当前采用默认工作区协作模型；多工作区切换、邮件邀请和生产级上传任务队列属于后续阶段。

## 当前用户路径

```text
登录 → /app/ → /app/galleries/:id
                 ├─ 上传照片、设置封面、删除照片
                 ├─ 配置 3D 展示 → /app/galleries/:id/config
                 └─ 生成分享链接 → /g/:slug?t=<token>
```

## URL 规划

| URL | 用途 |
| --- | --- |
| `/app/` | 登录后的 Gallery 总览 |
| `/app/galleries/:id` | 单 Gallery 工作区 |
| `/app/galleries/:id/config` | 当前 Gallery 的 Viewer 配置 |
| `/g/:slug` | 访客公开 Viewer |
| `/g/:slug?t=<token>` | 携带分享 Token 的访客 Viewer |

## 当前 API

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
POST /api/galleries/{id}/share-links
GET  /api/galleries/{id}/share-links
DELETE /api/share-links/{id}
```

公开端：

```text
GET  /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
GET  /api/public/g/{slug}/photos?page=0&pageSize=50
GET  /api/public/g/{slug}/viewer-config
```

公开照片和 `photoCount` 只包含 `READY` 且未软删除的照片。新分享链接统一使用 query Token；Viewer 暂时兼容旧的 `token` 参数和 `#s=` 格式。

## 目录

```text
apps/
├── gallery-api/       # Spring Boot 多模块 API
├── gallery-admin/     # Vue 3 + TypeScript 创作者工作台
└── gallery-viewer/    # Vue 3 + Three.js 公开展示端
packages/
└── gallery-contracts/ # 前后端共享 TypeScript 契约
infra/                 # Docker Compose、Nginx 和本地依赖
 docs/                  # 当前规范、阶段计划和归档记录
```

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

如果修改 `infra/.env`，同时设置 `API_BASE`、`ADMIN_UI`、`VIEWER_UI` 或让脚本读取对应环境变量。

## 测试与验收

唯一的测试说明入口是 [`docs/testing-guide.md`](docs/testing-guide.md)。常用命令：

```bash
# 后端测试
cd apps/gallery-api && mvn test

# 前端构建
cd apps/gallery-admin && npm install && npm run build
cd ../gallery-viewer && npm install && npm run build

# 服务启动后运行当前 Gallery API CLI 流程
cd ../..
bash test-mcp-flow.sh
```

当前自动化验收已覆盖注册、登录、Gallery 创建与详情、上传 READY 照片、发布、PRIVATE Token、PASSWORD 前置状态、分享链接和公开访问。M5 Docker/API 已验证 OWNER/EDITOR/VIEWER 的 `/api/me`、capabilities、成员列表和受限写操作 403；浏览器 MCP 已验证 OWNER 成员页和添加 EDITOR。仍未覆盖 M5 的真实 HTTP 全矩阵、V7 升级报告、最后 OWNER 并发和旧 Session 失效。M4/M3.5 的 PASSWORD 成功解锁、撤销 Token、重新发布恢复和 Admin IAB 发布交互也仍保留为补验收项。

## 文档入口

- [`docs/open-gallery-product-roadmap.md`](docs/open-gallery-product-roadmap.md)：产品路线和阶段目标。
- [`docs/implementation-plan.md`](docs/implementation-plan.md)：架构、API 和里程碑规范。
- [`docs/next-slice-public-access-stabilization.md`](docs/next-slice-public-access-stabilization.md)：公开访问稳定化切片与验收标准。
- [`docs/next-slice-upload-task-productionization.md`](docs/next-slice-upload-task-productionization.md)：上传任务生产化切片（M6）。
- [`docs/next-slice-production-hardening.md`](docs/next-slice-production-hardening.md)：发布前硬化切片（M6.5）。
- [`docs/next-slice-m7-viewer-config-and-performance.md`](docs/next-slice-m7-viewer-config-and-performance.md)：Viewer 配置版本化、CDN 与性能切片（M7）。
- [`docs/testing-guide.md`](docs/testing-guide.md)：当前测试、启动和故障排查指南。
- [`docs/archive/README.md`](docs/archive/README.md)：历史文档索引；归档资料不覆盖当前规范。

## 后续路线

1. M3.5 ✅：公开访问、测试、签名 URL 和部署配置生产化加固。
2. [M4 ✅：发布状态、公开隔离、分享撤销与 SEO](docs/next-slice-publishing-and-seo.md)：核心代码、后端测试、Docker/API 和 Viewer SEO 已验证，保留少量运行态补验收。
3. [M5 ✅：Workspace Membership 与 OWNER / EDITOR / VIEWER 授权](docs/next-slice-membership-and-authorization.md)：核心代码、44 项后端测试、前端构建、Docker 三角色 API 和 OWNER 成员页已验证，保留集成验收。
4. [M6 ✅：上传任务生产化](docs/next-slice-upload-task-productionization.md)：任务中心、批量部分成功、retry/cancel、刷新恢复与 Worker 可观测性已实现并通过真实环境验收。
5. [M6.5 ✅：发布前硬化](docs/next-slice-production-hardening.md)：限流、残留移除、413 语义、PRIVATE 语义统一与分享运营能力已验收；密码策略与重置推迟到上线前。
6. [M7：Viewer 配置版本化、CDN 与 3D 性能优化](docs/next-slice-m7-viewer-config-and-performance.md)。
