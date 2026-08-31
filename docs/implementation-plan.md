# VIE Gallery 实现文档

本文档是 `docs/reconstruction-plan.md` 的执行版，约束后续开发顺序、模块职责和验收口径。当前工程使用 Java 17（与本机 JDK 一致），Spring Boot 保持 3.3.x；升级 Java 版本不属于 MVP 范围。

## 1. 目标与边界

第一阶段交付一个可部署的多租户照片平台：用户注册登录后管理自己的照片空间、相册和照片，并通过公开链接展示。所有管理数据从认证上下文取得租户，不接受请求体中的 `userId` 或 `tenantId`。照片二进制进入对象存储，数据库只保存对象元数据和关系。

MVP 不包含团队协作、AI 标签、自定义域名、计费和自动备份。它们必须以独立模块接入，不修改现有公开 API 的安全边界。

## 2. 工程结构

```text
apps/
  gallery-api/
    gallery-api-domain/          纯领域类型、枚举和不依赖框架的规则
    gallery-api-application/     用例、端口、DTO 映射和事务边界
    gallery-api-infrastructure/  MySQL、Redis、对象存储、Session 适配器
    gallery-api-boot/            Spring Boot 启动、Controller、过滤器和配置
  gallery-admin/                 Vue 3 + TypeScript 管理端，基路径 /app
  gallery-viewer/                Vue 3 + Three.js 公开展示端
packages/
  gallery-contracts/             管理端和展示端共享的 API 类型（不放业务组件）
infra/                           本地 MySQL、Redis、MinIO、Nginx 配置
```

依赖方向只能从 `boot -> infrastructure -> application -> domain`，领域层不得反向依赖 Spring、MyBatis 或 HTTP。前端两个应用不互相依赖，只依赖 `gallery-contracts`。

## 3. 数据模型与迁移

使用 Flyway（或等价版本化迁移工具），生产数据库选 MySQL 8.0+。所有业务表统一使用 `id BINARY(16)`、`created_at`、`updated_at`、`deleted_at`，需要隔离的表带 `tenant_id`。迁移按里程碑拆分，表的最终建设顺序如下：

1. `users`：邮箱唯一、显示名称、密码哈希、状态、最后登录时间。
2. `tenant`：名称、slug、状态；注册时同步创建一个租户。
3. `membership`：`user_id`、`tenant_id`、角色，唯一约束防重复成员。
4. `gallery`：租户、slug、名称、可见性（PUBLIC/PRIVATE/PASSWORD）、密码哈希、封面照片 ID。
5. `storage_object`：bucket、object_key、thumbnail_key、MIME、字节数、宽高、sha256、存储状态。
6. `photo`：租户、相册、存储对象、标题、排序号、封面标识、软删除时间。
7. `share_link`：相册、token_hash、过期时间、撤销时间、密码哈希、最近访问时间。
8. `tenant_quota`：容量上限、已用容量、照片数量上限和当前数量。
9. `audit_log`：租户、操作者、动作、资源类型、资源 ID、IP、结果和时间。

索引至少包括：`gallery(slug)`、`photo(tenant_id, gallery_id, deleted_at, sort_order)`、`share_link(token_hash)`、`audit_log(tenant_id, created_at)`。应用层查询必须由 Repository 统一追加租户条件，禁止 Controller 手写 SQL。

## 4. 后端实现顺序

### 4.1 基础设施

M1 先加入数据库连接池、Flyway、Redis Session、统一 JSON 错误处理和请求 ID，配置只从环境变量读取：`DB_URL`、`DB_USERNAME`、`DB_PASSWORD`、`REDIS_URL`。M2 接入阿里云 OSS 时再增加 `OSS_ENDPOINT`、`OSS_BUCKET` 和运行身份配置；生产优先使用 RAM 角色或 STS 临时凭据。禁止把任何密钥提交到仓库。

### 4.2 认证与租户

实现注册、登录、退出和 `GET /api/me`。推荐 HttpOnly、Secure、SameSite=Lax Cookie Session；Session 只保存用户 ID，`TenantContextResolver` 从 membership 查询默认租户。后续团队协作再增加切换租户接口。认证过滤器在 Controller 之前拒绝匿名管理请求，公开请求只解析分享 token。

### 4.3 相册与照片用例

以 `GalleryFacade` 的端口模式扩展 `PhotoFacade`、`ShareLinkFacade`。每个用例必须完成：鉴权、租户校验、输入校验、事务、审计记录和领域事件（需要异步时写入任务表）。删除只设置 `deleted_at`，回收由独立任务执行。

### 4.4 上传链路

`POST /api/galleries/{id}/photos/upload` 先检查租户配额、文件数量和请求频率，再校验扩展名、声明 MIME 与实际图片解码结果。服务端生成随机 object key，原图和缩略图分离保存。上传成功后写 `storage_object` 和 `photo`；任一阶段失败都删除已上传对象并记录审计。返回短期签名 URL，不返回永久 OSS 地址。

### 4.5 公开展示

`GET /api/public/g/{slug}` 只返回展示所需字段；密码相册通过 `/unlock` 创建短期访问 Session，后续照片接口校验该 Session。公开接口禁止返回内部 ID、租户 ID、bucket、object key 和管理字段。过期或撤销链接统一返回 404，避免泄露资源存在性。

## 5. API 契约

管理端已有的路径作为稳定前缀：

```text
POST /api/auth/register|login|logout
GET  /api/me
GET|POST /api/galleries
PATCH|DELETE /api/galleries/{id}
GET|POST /api/galleries/{id}/photos
PATCH|DELETE /api/photos/{id}
POST /api/galleries/{id}/share-links
DELETE /api/share-links/{id}
```

公开端：

```text
GET  /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
GET  /api/public/g/{slug}/photos
```

统一响应错误结构为 `{ code, message, requestId, details }`。分页统一使用 `items`、`page`、`pageSize`、`total`。API 类型变更先更新 `packages/gallery-contracts`，再修改两个前端。

## 6. 前端实现顺序

管理端先完成登录态路由守卫、空间列表、相册详情、上传队列、排序/封面/软删除和分享链接管理。所有请求带 `credentials: include`，401 统一跳转登录页，上传展示单文件进度和失败重试。

展示端先完成公开状态页（公开、密码、过期、无照片），再接入 Three.js 照片墙。Three.js 必须有响应式网格降级、缩略图优先、懒加载、加载失败占位、触摸拖拽、图片详情面板和 `prefers-reduced-motion` 分支。Three.js 视觉代码只能放在 viewer，不得被 admin 引入。

## 7. 测试与验收

后端：领域规则单测、Repository 集成测试、MockMvc API 测试、跨租户访问测试、上传恶意文件测试、分享过期/撤销测试。前端：类型检查、组件测试、移动端浏览器测试和公开页 WebGL 降级测试。

每个里程碑必须通过：`mvn -DskipTests verify`、`npm run build`、Docker Compose 健康检查。M1 的详细实施、API 契约、迁移边界和运行态验收见 [`docs/m1-implementation-plan.md`](m1-implementation-plan.md)。数据库迁移按里程碑分阶段执行：M1 先落地身份、租户、membership 和 gallery 基础表，M2 再增加照片、对象元数据和配额相关表。

文件存储后续接入阿里云 OSS。M1 不引入 OSS SDK、凭据、永久 URL 或文件上传旁路；M2 通过应用层对象存储端口接入 OSS 适配器。

## 8. 里程碑

1. M0（当前）：工程骨架、Java 17、前端双入口、共享契约、本地依赖编排。
2. M1：数据库迁移、认证、Redis Session、租户上下文、Gallery 持久化和统一错误处理。详细规格见 [`docs/m1-implementation-plan.md`](m1-implementation-plan.md)。
3. M2：相册/照片 CRUD、对象存储上传、缩略图和配额。
4. M3：公开链接、密码访问、Three.js 展示和移动端适配。
5. M4：迁移工具 dry-run/幂等/校验报告、全链路测试和部署演练。
