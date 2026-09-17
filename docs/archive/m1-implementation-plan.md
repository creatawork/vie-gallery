# M1 详细实现文档：数据库、认证与租户上下文

## 1. 目标

M1 将 M0 的工程骨架升级为可持久化、可鉴权、可隔离的后端基础能力，完成以下闭环：

```text
注册 -> 创建用户和默认租户 -> 建立 membership
登录 -> 校验密码 -> 创建 Redis Session -> 写入 HttpOnly Cookie
管理请求 -> 解析 Session -> 查询默认租户 -> Repository 强制带 tenant_id
异常 -> 统一转换为 { code, message, requestId, details }
```

M1 的完成标准不是“接口能返回 200”，而是匿名请求被拒绝、用户身份来自 Session、业务查询不能跨租户、服务重启后数据仍存在，并且错误响应格式稳定。

## 2. 范围与非目标

### 2.1 本次范围

1. MySQL 迁移框架和 M1 基础表：`users`、`tenant`、`membership`、`gallery`。
2. 用户注册、登录、退出、当前用户查询：`/api/auth/*` 和 `/api/me`。
3. Redis-backed HttpOnly Cookie Session。
4. 从 Session 恢复用户，再从 membership 解析默认租户。
5. 管理接口的认证过滤器和租户边界。
6. Gallery Repository 从内存实现切换为 MySQL 实现。
7. 全局异常处理、请求 ID、参数校验和安全日志边界。
8. Repository 集成测试、MockMvc API 测试和跨租户测试。

### 2.2 明确不在 M1

- 照片上传、缩略图、对象存储和文件回收。
- 阿里云 OSS SDK、STS、签名 URL 和 Bucket 初始化。
- MySQL 中的 `photo`、`storage_object`、`share_link`、`tenant_quota`、`audit_log` 表的业务写入。
- 多租户切换、团队成员邀请和复杂角色授权。
- 密码重置、邮箱验证、OAuth、2FA 和限流策略的完整实现。

文件存储后续接入阿里云 OSS。M1 不把 MinIO 当作生产存储，也不把任何 OSS URL、AccessKey 或 Secret 写入数据库、前端配置或代码仓库。M2 通过应用层端口接入 OSS，M1 的认证和租户边界必须先稳定。

## 3. 技术基线

| 项目 | M1 约定 |
| --- | --- |
| JDK | Java 17 |
| Spring Boot | 3.3.5 |
| 数据库 | MySQL 8.4，生产兼容 MySQL 8.0+ |
| 迁移 | Flyway，版本脚本只增不改 |
| 数据访问 | MyBatis-Plus，Mapper 位于 infrastructure |
| Session | Spring Session Data Redis |
| 安全 | Spring Security 6，JSON API 模式 |
| 密码 | BCrypt，默认 strength 12 |
| JSON | Spring MVC 默认 Jackson |
| ID | Java UUID，数据库 `BINARY(16)` |
| 时间 | UTC 写入数据库，API 使用 ISO-8601 |

M1 使用 Spring Security 处理 SecurityContext 持久化、Session fixation 防护、CSRF、路由授权和 401/403 入口，但禁用默认登录页、HTTP Basic 和 JWT。登录/注册仍使用 JSON Controller；成功登录后显式建立 SecurityContext，并由 Spring Session 写入 Redis。Session 中的 principal 只保留 `userId` 和认证版本，不缓存租户对象或用户完整资料。

## 4. 模块职责与文件落点

依赖方向保持 `boot -> infrastructure -> application -> domain`。

### 4.1 domain

新增或调整：

- `domain.User`：用户身份领域对象，包含 display name，不包含密码明文。
- `domain.UserStatus`：`ACTIVE`、`DISABLED`。
- `domain.Tenant`：租户名称、slug、状态。
- `domain.TenantStatus`：`ACTIVE`、`DISABLED`。
- `domain.Membership`：用户、租户、角色。
- `domain.MembershipRole`：M1 只实现 `OWNER`。
- `domain.TenantContext`：`userId`、`tenantId`、`role`。
- `domain.DomainException`：携带稳定业务错误码；HTTP 状态映射由 boot 层完成。

领域对象不依赖 Spring、MyBatis、Servlet、Redis 或 Jackson。

### 4.2 application

新增端口和用例：

- `UserRepository`：按邮箱和 ID 查询用户。
- `TenantRepository`：创建、按 ID 查询默认租户。
- `MembershipRepository`：按用户查询默认 membership，并校验用户是否属于租户。
- `PasswordHasher`：密码哈希端口，infrastructure 提供 BCrypt 实现。
- `TenantContextResolver`：从当前请求身份解析用户和默认租户。
- `AuthFacade`：注册、登录、退出、当前用户。
- `CurrentPrincipal`：请求级已认证身份，不接受请求体中的 `userId` 或 `tenantId`。

`GalleryFacade` 继续负责 Gallery 用例，但所有读写必须获得 `TenantContext` 后调用带租户参数的 Repository 方法。

### 4.3 infrastructure

新增：

- Flyway 迁移脚本：`gallery-api-boot/src/main/resources/db/migration/V1__m1_identity_and_gallery.sql`。
- MyBatis 配置、Mapper、DO 和 Domain 映射器。
- `MyBatisUserRepository`、`MyBatisTenantRepository`、`MyBatisMembershipRepository`、`MyBatisGalleryRepository`。
- `BcryptPasswordHasher`。
- `RedisConnectionFactory` 配置和 Session 序列化配置。

删除或禁用：

- `InMemoryGalleryRepository` 只允许 `dev-memory` profile，不能在 M1 默认 profile 被加载。
- `RequestTenantContextResolver` 只允许测试或 `dev-memory` profile，不能在真实运行态伪造固定租户。

### 4.4 boot

新增：

- `AuthController` 的请求/响应 DTO。
- `MeController`，提供 `GET /api/me`。
- `SecurityConfig`，配置 JSON API 的授权、CSRF、Session 和 logout 行为。
- `TenantContextFilter`，从已认证 principal 查询 membership 并建立租户上下文。
- `RestAuthenticationEntryPoint` 和 `RestAccessDeniedHandler`，输出统一的 401/403 JSON。
- `RequestIdFilter`，生成或透传安全的请求 ID。
- `GlobalExceptionHandler`，统一处理业务异常、校验异常、JSON 解析异常和未知异常。
- `SecurityRoutePolicy` 或等价的白名单配置。

Controller 只能负责 HTTP DTO 转换和调用 Facade，不能查询 Mapper、解析租户 ID 或拼接 SQL。

## 5. 数据库设计

### 5.1 统一约定

- 所有 ID 使用 `BINARY(16)`，由应用生成 UUID，避免把数据库自增 ID 暴露到 API。
- 所有时间字段使用 `DATETIME(6)`，应用按 UTC 写入。
- 所有 M1 表使用 `created_at`、`updated_at`、`deleted_at`。M1 不开放用户、租户和 membership 删除接口，这些表的 `deleted_at` 保持 `NULL`，为后续停用和数据保留策略预留。
- 邮箱比较统一转小写并去除首尾空格；数据库用唯一索引保证最终一致性。
- 公开 Gallery 使用路径 `/api/public/g/{slug}`，因此 `gallery.slug` 在全局唯一；管理查询仍必须使用 `tenant_id` 条件。
- 不存储明文密码，只存储 BCrypt hash。

### 5.2 M1 表

#### `users`

```text
id              BINARY(16)      PK
email           VARCHAR(320)    NOT NULL UNIQUE
display_name    VARCHAR(120)    NOT NULL
password_hash   VARCHAR(100)    NOT NULL
status          VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE'
last_login_at   DATETIME(6)     NULL
deleted_at      DATETIME(6)     NULL
created_at      DATETIME(6)     NOT NULL
updated_at      DATETIME(6)     NOT NULL
```

约束：`status` 只允许 `ACTIVE`、`DISABLED`；登录时必须是 `ACTIVE`。

#### `tenant`

```text
id              BINARY(16)      PK
name            VARCHAR(120)    NOT NULL
slug            VARCHAR(80)     NOT NULL UNIQUE
status          VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE'
deleted_at      DATETIME(6)     NULL
created_at      DATETIME(6)     NOT NULL
updated_at      DATETIME(6)     NOT NULL
```

注册时同步创建一个默认租户。M1 使用应用生成的 slug；冲突时追加短随机后缀并再次检查唯一约束。

#### `membership`

```text
id              BINARY(16)      PK
user_id         BINARY(16)      NOT NULL FK users(id)
tenant_id       BINARY(16)      NOT NULL FK tenant(id)
role            VARCHAR(16)     NOT NULL DEFAULT 'OWNER'
deleted_at      DATETIME(6)     NULL
created_at      DATETIME(6)     NOT NULL
updated_at      DATETIME(6)     NOT NULL
UNIQUE(user_id, tenant_id)
INDEX(user_id, created_at)
INDEX(tenant_id, user_id)
```

M1 每个用户注册时创建一条 `OWNER` membership。默认租户的解析规则是该用户最早创建且状态为 `ACTIVE` 的 membership；没有可用 membership 时返回 `AUTH_TENANT_NOT_FOUND`。

#### `gallery`

```text
id              BINARY(16)      PK
tenant_id       BINARY(16)      NOT NULL FK tenant(id)
slug            VARCHAR(80)     NOT NULL
name            VARCHAR(160)    NOT NULL
visibility      VARCHAR(16)     NOT NULL DEFAULT 'PRIVATE'
cover_photo_id  BINARY(16)      NULL
deleted_at      DATETIME(6)     NULL
created_at      DATETIME(6)     NOT NULL
updated_at      DATETIME(6)     NOT NULL
UNIQUE(slug)
INDEX(tenant_id, deleted_at, created_at)
```

`cover_photo_id` 在 M1 保留但不做外键，等 M2 的 `photo` 表落地后再补充约束。公开响应只能通过 DTO 返回 `slug`、`name`、`visibility` 和后续允许公开的展示字段，不能直接序列化 `Gallery` 领域对象。

### 5.3 Flyway 规则

1. M1 首次启动自动执行 `V1__m1_identity_and_gallery.sql`。
2. 迁移脚本提交后不得修改；错误通过新增 `V2` 修复。
3. 启动环境设置 `spring.flyway.validate-on-migrate=true`。
4. 测试使用独立数据库或 Testcontainers，禁止测试连接开发持久卷。
5. M1 不做自动清库；本地重置必须显式执行 `docker compose down -v`，并记录数据不可恢复风险。

## 6. 认证与 Session

### 6.0 CSRF 握手

`GET /api/auth/csrf`

- 匿名可调用，确保 Spring Security 创建 CSRF token。
- 返回 `{ "headerName": "X-XSRF-TOKEN", "token": "..." }`，同时写入可由前端读取的 `XSRF-TOKEN` Cookie。
- 注册、登录、退出以及其他 `POST/PATCH/DELETE` 请求都必须携带 `X-XSRF-TOKEN`。
- 管理端所有请求使用 `credentials: include`；启动和 CSRF 失败后重新获取 token。
- 仅 `GET/HEAD/OPTIONS` 免 CSRF。不能因为接口使用 JSON 或 Cookie 为 SameSite=Lax 就关闭 CSRF。

### 6.1 注册

`POST /api/auth/register`

请求：

```json
{
  "email": "user@example.com",
  "password": "at-least-12-characters",
  "displayName": "Vie"
}
```

M1 行为：

1. 规范化邮箱：trim、lowercase、拒绝空值和超过 320 字符的值。
2. 校验密码长度 12-128 个字符，不记录密码到日志。
3. 在一个数据库事务中创建 `users`、`tenant`、`membership`。
4. 邮箱已存在统一返回 `AUTH_EMAIL_UNAVAILABLE`，不区分用户是否被禁用，减少账号枚举。
5. 注册成功创建登录 Session，返回 `201 Created` 和公开用户信息。

响应：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Vie"
  },
  "tenant": {
    "id": "uuid",
    "name": "Vie 的空间",
    "slug": "vie-xxxx"
  }
}
```

响应不返回 `passwordHash`、Session ID、Redis key 或内部连接信息。

### 6.2 登录

`POST /api/auth/login`

请求：

```json
{
  "email": "user@example.com",
  "password": "at-least-12-characters"
}
```

成功：

- 校验 BCrypt hash。
- 校验用户状态为 `ACTIVE`。
- 更新 `last_login_at`。
- 创建新 Session，并轮换旧 Session，降低 Session fixation 风险。
- 使用 Spring Security 的 `SessionAuthenticationStrategy` 更换 Session ID，不能复用登录前 Session ID。
- 写入 Cookie `VIE_SESSION`。
- 返回与注册相同的公开用户信息和默认租户信息。

失败统一返回 `401 AUTH_INVALID_CREDENTIALS`，不能通过响应时间、错误文本或状态码区分“邮箱不存在”和“密码错误”。

### 6.3 退出和当前用户

- `POST /api/auth/logout`：通过 Spring Security logout handler 销毁 Redis Session，清除 `VIE_SESSION` 和 `XSRF-TOKEN` Cookie，成功返回 `204`；没有 Session 也返回 `204`。
- `GET /api/me`：需要登录，返回当前用户、默认租户和角色；匿名返回 `401 AUTH_REQUIRED`。

### 6.4 Cookie 与 Redis 约定

Cookie：


- 名称：`VIE_SESSION`。
- `HttpOnly=true`。
- `SameSite=Lax`。
- 生产 `Secure=true`；本地 HTTP `Secure=false`，由环境变量控制。
- `Path=/`。
- Max-Age：7 天；服务端 Redis TTL 同步为 7 天。

Redis：

- 使用 Spring Session 管理生命周期，namespace `vie:session`。
- Session 保存 Spring SecurityContext；其中的自定义 principal 只含 `userId` 和认证版本，不保存租户对象、密码 hash 或用户完整资料。
- Redis 不可用时，登录和所有需要 Session 的请求失败并返回 `DEPENDENCY_UNAVAILABLE`，不能静默降级到内存 Session。
- Session 序列化使用 JSON 或稳定的 JDK 无关格式，避免部署版本变化导致不可读。

建议属性：

```yaml
spring:
  session:
    store-type: redis
    timeout: 7d
  data:
    redis:
      url: ${REDIS_URL:redis://localhost:6379}
server:
  servlet:
    session:
      cookie:
        name: VIE_SESSION
        http-only: true
        same-site: lax
```

最终 Cookie 的 `secure` 值必须通过配置覆盖，不能固定写死为适用于所有环境的值。

## 7. 租户上下文与请求流程

### 7.1 Security Filter Chain

请求在进入 Controller 前按以下顺序处理：

1. `RequestIdFilter` 建立 request ID 并写入 MDC 和响应头 `X-Request-Id`。
2. Spring Session 从 `VIE_SESSION` Cookie 恢复 SecurityContext。
3. Spring Security 执行 CSRF 和路由授权；匿名管理请求直接返回统一 `401`。
4. `TenantContextFilter` 从 principal 读取 `userId`，查询用户、默认 membership 和 tenant。
5. 用户和租户均有效时建立不可变 `TenantContext`；已认证但无可用租户时返回 `403 AUTH_TENANT_NOT_FOUND`。
6. Controller 通过 `TenantContextResolver` 取得上下文，不能从 Header、Query 或 Request Body 取得租户身份。

公开路由只允许访问公开资源，M1 不接受客户端传入的 `userId`、`tenantId` 或默认租户 Header。

### 7.2 路由白名单

匿名允许：

```text
GET  /actuator/health
GET  /api/auth/csrf
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
```

需要登录：

```text
GET|POST /api/galleries
GET      /api/me
```

未知 `/api/**` 路由由 Spring 返回统一的 `404 ROUTE_NOT_FOUND`。M1 的 `/api/public/g/{slug}` 对不存在或非公开空间返回 `404 RESOURCE_NOT_FOUND`。

### 7.3 Repository 规则

禁止：

```java
galleryMapper.selectById(id);
```

必须：

```java
galleryRepository.findById(context.tenantId(), id);
galleryRepository.findAll(context.tenantId(), page, pageSize);
```

所有管理查询必须包含 `tenant_id = :tenantId` 和 `deleted_at IS NULL`。更新和删除也必须把 `tenant_id` 放进 `WHERE`，并检查影响行数；影响为 0 时统一按资源不存在处理，避免泄露其他租户资源存在性。

### 7.4 事务边界

- 注册：`AuthFacade.register` 一个事务完成三张身份表写入。
- 登录：更新 `last_login_at` 与创建 Session 不要求同一事务；数据库更新失败不能创建成功响应。
- Gallery 创建：在 `GalleryFacade.create` 事务中完成租户校验、slug 校验和写入。
- Session 销毁：请求成功返回前完成；Redis 失败时记录错误并返回依赖不可用。

## 8. 统一错误协议

所有 API 错误响应统一为：

```json
{
  "code": "AUTH_REQUIRED",
  "message": "Authentication is required",
  "requestId": "01J...",
  "details": {}
}
```

字段规则：

- `code`：稳定、机器可读、全大写下划线格式。
- `message`：面向调用方的安全文本，不放 SQL、堆栈、邮箱存在性或内部服务地址。
- `requestId`：由 `RequestIdFilter` 生成或透传；长度和字符集需限制，防止日志注入。
- `details`：校验错误时放字段级错误；无额外信息时返回空对象。

M1 最小错误码：

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | 请求字段缺失、格式或长度非法 |
| 400 | `MALFORMED_JSON` | JSON 无法解析 |
| 401 | `AUTH_REQUIRED` | 管理请求没有有效 Session |
| 401 | `AUTH_INVALID_CREDENTIALS` | 登录凭据错误 |
| 403 | `AUTH_USER_DISABLED` | 用户已禁用 |
| 403 | `AUTH_TENANT_NOT_FOUND` | 已登录用户没有可用默认租户 |
| 403 | `CSRF_INVALID` | 缺失或错误的 CSRF token |
| 404 | `RESOURCE_NOT_FOUND` | 当前租户下资源不存在 |
| 404 | `ROUTE_NOT_FOUND` | API 路由不存在 |
| 409 | `AUTH_EMAIL_UNAVAILABLE` | 邮箱不可注册 |
| 409 | `GALLERY_SLUG_CONFLICT` | 当前租户 slug 冲突 |
| 503 | `DEPENDENCY_UNAVAILABLE` | MySQL 或 Redis 不可用 |
| 500 | `INTERNAL_ERROR` | 未预期异常 |

`GlobalExceptionHandler` 处理 Controller 内异常；Spring Security 的 `RestAuthenticationEntryPoint`、`RestAccessDeniedHandler` 和 CSRF failure handler 必须复用同一错误响应工厂。服务端记录完整异常和 `requestId`，响应只返回稳定错误结构。密码、Cookie 值、Session ID、Authorization Header、数据库密码和对象存储凭据必须脱敏。

## 9. 配置与环境变量

M1 新增配置只从环境变量读取，提供本地开发默认值时必须明确标注为 local-only：

```text
DB_URL=jdbc:mysql://localhost:13306/vie_gallery?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC
DB_USERNAME=vie
DB_PASSWORD=vie_local
REDIS_URL=redis://localhost:6379
SESSION_COOKIE_SECURE=false
SESSION_TTL=7d
```

生产环境至少覆盖：

```text
DB_URL
DB_USERNAME
DB_PASSWORD
REDIS_URL
SESSION_COOKIE_SECURE=true
```

本地 Compose 的 MySQL 默认容器端口仍是 `3306`；由于当前机器该端口可能被其他 MySQL 占用，验收时可以使用未提交的 Compose override 映射到 `13306`，并同步设置 `DB_URL`。这个 override 不是应用配置，也不能提交包含真实凭据的文件。

M1 不新增 `S3_*` 或 `OSS_*` 必需配置。M2 需要时增加 `StorageProperties` 和 `ObjectStoragePort`，让阿里云 OSS 只出现在 infrastructure 适配器中。

## 10. API 契约

### `POST /api/auth/register`

- 匿名可调用。
- 需要有效 CSRF token。
- 成功 `201`，创建 Session。
- 失败：`400`、`409`。

### `POST /api/auth/login`

- 匿名可调用。
- 需要有效 CSRF token。
- 成功 `200`，轮换并创建 Session。
- 凭据失败 `401 AUTH_INVALID_CREDENTIALS`。

### `POST /api/auth/logout`

- 匿名可调用。
- 需要有效 CSRF token。
- Session 正常销毁或原本不存在时返回 `204`；Redis 不可用导致无法确认销毁时返回 `503 DEPENDENCY_UNAVAILABLE`，但仍清除浏览器 Cookie。

### `GET /api/me`

- 必须登录。
- 成功 `200`。
- 匿名 `401 AUTH_REQUIRED`。

### `GET /api/galleries`

- 必须登录。
- 只返回当前默认租户的 Gallery。
- M1 可暂时返回数组；分页响应在 M2 统一为 `items/page/pageSize/total`。

### `POST /api/galleries`

请求：

```json
{
  "name": "Wedding",
  "slug": "wedding",
  "visibility": "PRIVATE"
}
```

- `userId`、`tenantId` 即使出现在请求体也必须拒绝或忽略；推荐校验层直接拒绝未知字段。
- 需要有效 CSRF token。
- 成功 `201`。
- 返回管理端可用对象；公开 API 使用独立 DTO，不复用该响应。

## 11. 实施顺序

1. 调整 Maven 依赖和配置：Flyway、MyBatis-Plus、MySQL Driver、Spring Session Redis、Redis Client、BCrypt。
2. 编写 `V1__m1_identity_and_gallery.sql`，先在干净 MySQL 上验证，再在持久卷上验证。
3. 创建 domain 类型和 application ports，先让编译器固定边界。
4. 实现 DO、Mapper、UUID/BINARY(16) 转换和四个 Repository。
5. 实现 BCrypt、Spring Security、Redis Session、CSRF 和配置绑定。
6. 实现注册事务和 `GET /api/me`。
7. 实现登录、退出、Session 轮换和过期行为。
8. 接入 `TenantContextFilter`、`RequestIdFilter`、Security 错误入口和 `GlobalExceptionHandler`。
9. 把 GalleryFacade 切换到 MySQL Repository，移除默认 dev 内存实现。
10. 补充测试、执行构建和完整运行态验收。

每一步完成后都应保持 `mvn -DskipTests verify` 可通过；第 10 步才将 M1 标记为完成。

## 12. 测试方案

### 12.1 Domain / application 单测

- 邮箱规范化和边界长度。
- 密码长度校验，确认日志和异常中不出现密码。
- 注册事务中任一写入失败时不留下半成品用户、租户或 membership。
- 默认租户选择规则。
- 禁用用户不能建立 TenantContext。
- Gallery Repository 调用始终传递 `tenantId`。

### 12.2 Repository 集成测试

使用 Testcontainers MySQL 或独立测试数据库：

- Flyway 从空库执行成功且表、索引、外键存在。
- 用户邮箱唯一约束生效。
- `(user_id, tenant_id)` membership 唯一约束生效。
- 两个租户拥有相同 slug 时互不冲突。
- Gallery 查询、更新、软删除不会跨租户。
- 重启数据库后数据仍可读。

### 12.3 MockMvc / API 测试

- 注册成功返回 `201` 和 `Set-Cookie`，响应不含密码 hash。
- 未获取或错误的 CSRF token 无法注册、登录、退出或创建 Gallery。
- 重复邮箱返回统一 `409 AUTH_EMAIL_UNAVAILABLE`。
- 登录错误不区分不存在邮箱和错误密码。
- 登录后 `/api/me` 返回当前用户和默认租户。
- 未登录访问 `/api/me`、`/api/galleries` 返回 `401 AUTH_REQUIRED`。
- 退出后原 Cookie 不能继续访问管理接口。
- 公开接口不需要登录，但不泄露内部 ID、tenant ID 和存储字段。
- 不存在的公开空间返回 `404`，不因参数名编译选项变化而返回 `500`。
- 校验、JSON 解析、未知异常都符合统一错误结构并带 `requestId`。

### 12.4 运行态验收

```text
mvn -DskipTests verify
npm run build
docker compose -f infra/docker-compose.yml up -d
```

服务健康后执行：

1. MySQL、Redis 容器健康检查为 `healthy`。
2. API 启动并返回 `GET /actuator/health = 200`。
3. 注册测试用户，确认数据库存在 users/tenant/membership 三条关联数据。
4. 重启 API，使用原 Cookie 访问 `/api/me`，确认 Session 仍有效。
5. 创建 Gallery，确认重启 API 后仍可查询。
6. 使用另一用户或伪造请求体 `tenantId`，确认无法读取第一用户的 Gallery，也不能改变写入记录的租户归属。
7. 退出后确认 Session 失效。
8. 停止 Redis，确认需要登录的请求返回 `503 DEPENDENCY_UNAVAILABLE`，恢复 Redis 后服务可继续工作。

## 13. 完成定义

M1 只有同时满足以下条件才算完成：

- M1 Flyway 迁移可在空 MySQL 上成功执行，并可重复启动校验。
- 默认运行 profile 不加载内存 Gallery Repository 或固定开发租户解析器。
- 注册、登录、退出、`/api/me` 均有真实实现和测试。
- 管理请求的身份只来自 Redis Session，客户端不能指定租户身份。
- Gallery 列表和创建均带租户边界；Repository 的后续更新、删除方法也必须把 `tenantId` 纳入签名和 SQL 条件。
- 统一错误协议覆盖 400、401、403、404、409、503、500。
- Redis Session 在 API 重启后仍可恢复，退出后失效。
- `mvn -DskipTests verify`、`npm run build` 和 Compose 健康检查通过。
- 不引入阿里云 OSS 凭据、SDK、永久 URL 或未定义的文件存储旁路。

## 14. M1 之后的 OSS 接入约束

M2 接入文件存储时，应用层只依赖以下抽象，不依赖阿里云类型：

```java
public interface ObjectStoragePort {
    StoredObject put(ObjectKey key, InputStream content, ContentMetadata metadata);
    void delete(ObjectKey key);
    URI createReadUrl(ObjectKey key, Duration ttl);
}
```

阿里云 OSS 实现放在 `gallery-api-infrastructure`，配置通过环境变量注入；数据库只保存 bucket、object key、校验值和状态，API 只返回短期签名地址。M1 的认证、租户和错误处理契约不得因 OSS 接入而改变。
