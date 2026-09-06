# 下一阶段实现指导：Workspace Membership 与角色授权

> 上位规范：[open-gallery-product-roadmap.md](./open-gallery-product-roadmap.md)
> 当前基线：[next-slice-publishing-and-seo.md](./next-slice-publishing-and-seo.md)
> 阶段定位：完成 M4 发布能力后，交付默认工作区内的最小协作闭环。
> 当前状态：M5 核心代码已实现；44 项后端测试、Admin/Viewer build、Docker 三角色 API 和 OWNER 成员页已验证。真实 HTTP 全矩阵、V7 升级报告、最后 OWNER 并发、旧 Session 失效和完整三角色浏览器证据仍待补。
> 本阶段目标：OWNER 将已注册用户加入当前工作区并授予 EDITOR/VIEWER；服务层和 Admin 依据统一能力矩阵限制操作。

---

## 1. 阶段目标与边界

当前系统已有 User、Tenant、Membership、Session 和 TenantContext 基础。M5 已将角色和能力接入核心代码，但仍采用默认工作区模型：

```text
MembershipRole = OWNER | EDITOR | VIEWER
AuthController = 根据 Membership role 生成 ROLE_*
管理写操作 = Facade 统一 capability 校验
```

因此当前“多租户”仍不支持工作区切换和邮件邀请；本阶段已经交付最小协作工作区，剩余工作集中在集成验收和并发边界证据：

```text
OWNER 添加已注册用户
  ↓
EDITOR 或 VIEWER 登录
  ↓
/api/me 返回当前 tenant、role、capabilities
  ↓
后端 Facade 最终校验能力
  ↓
Admin 仅展示当前角色允许的操作
```

本阶段采用**默认工作区**模型：用户登录后继续使用默认 active Membership。多工作区列表、切换和邀请接受流程延后，避免把权限、通知和租户选择同时引入。

## 2. 角色和能力矩阵

### 2.1 角色

```text
OWNER
EDITOR
VIEWER
```

### 2.2 固定能力

| 能力 | OWNER | EDITOR | VIEWER |
| --- | ---: | ---: | ---: |
| 读取 Gallery、照片、配置 | ✓ | ✓ | ✓ |
| 上传照片 | ✓ | ✓ | — |
| 修改照片标题、排序、封面 | ✓ | ✓ | — |
| 删除照片 | ✓ | ✓ | — |
| 保存、删除、切换 3D 配置 | ✓ | ✓ | — |
| 创建 Gallery | ✓ | — | — |
| 发布、撤回发布 | ✓ | — | — |
| 创建、撤销分享链接 | ✓ | — | — |
| 列出、添加、改角色、移除成员 | ✓ | — | — |

建议共享 capability 名称：

```text
GALLERY_READ
GALLERY_CREATE
PHOTO_READ
PHOTO_WRITE
CONFIG_READ
CONFIG_WRITE
PUBLISH
SHARE_MANAGE
MEMBER_MANAGE
```

前端 capability 只影响显示和交互；后端 Facade 必须是最终授权边界。

### 2.3 安全约束

- VIEWER 不得通过直接调用 API 写入照片、配置、发布或分享。
- EDITOR 不得创建 Gallery、发布、管理分享或成员。
- 任何成员管理操作只允许当前 tenant 的 OWNER。
- 不允许移除或降级最后一个 OWNER。
- 跨 tenant membership ID 统一返回不可访问，不泄露成员存在性。
- role、Spring Security authority、TenantContext、`/api/me` 和前端 capabilities 必须一致。
- 暂不提供多工作区切换；文档与 UI 必须明确显示当前仅使用默认工作区。

## 3. 数据模型与迁移

### 3.1 V7 Flyway migration

新增实际运行目录中的迁移：

```text
apps/gallery-api/gallery-api-boot/src/main/resources/db/migration/V7__m5_membership_roles.sql
```

迁移内容：

1. 替换 V1 中仅允许 OWNER 的 `ck_membership_role`。
2. 放宽为：

```sql
CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER'))
```

3. 保留现有唯一约束：

```text
UNIQUE (user_id, tenant_id)
```

4. 现有 OWNER 数据不变。
5. 如成员表尚无软删除、创建/更新时间，先确认实际 schema；本阶段优先复用现有模型，不因审计需求重构表。

迁移验收：空库和已有 V1–V6 数据库均可升级；重复启动不改变现有 OWNER。

### 3.2 领域模型

更新：

- `MembershipRole`：加入 EDITOR、VIEWER。
- `Membership`：保持 userId、tenantId、role；若增加删除/审计字段，必须同步所有 adapter。
- 共享 contracts：`MembershipRole`、`Capability`、成员列表 DTO、认证响应 DTO。

不将角色塞入 User；角色永远是某个 user 在某个 tenant 下的 Membership 属性。

## 4. 后端设计

### 4.1 MembershipRepository

在现有默认 Membership 查询基础上增加 tenant-aware 方法：

```text
listActiveByTenantId(tenantId)
findActiveByUserIdAndTenantId(userId, tenantId)
findActiveByIdAndTenantId(membershipId, tenantId)
updateRole(tenantId, membershipId, role)
softDelete(tenantId, membershipId)
countActiveOwners(tenantId)
```

同时扩展 `UserRepository` 以支持按邮箱查询已注册用户。成员添加只接受已注册邮箱；不存在用户时使用通用业务错误，避免大范围用户枚举。

### 4.2 AuthorizationPolicy

新增应用层组件，例如：

```text
WorkspaceAuthorizationPolicy
```

建议公开方法：

```java
requireRead(TenantContext context)
requirePhotoWrite(TenantContext context)
requireConfigWrite(TenantContext context)
requireOwner(TenantContext context)
```

所有 Facade 的写入口第一时间调用策略：

- `GalleryFacade`：create、publish、unpublish → OWNER。
- `PhotoFacade`：upload、update、delete → OWNER/EDITOR。
- `GalleryViewerConfigFacade`：save、delete、toggle → OWNER/EDITOR。
- `ShareLinkFacade`：create、revoke、delete → OWNER。
- `MembershipFacade`：全部写操作 → OWNER。

读取保持三角色可用，公开 Visitor API 不依赖 Membership。

权限拒绝使用统一 `DomainException`，例如：

```text
MEMBER_FORBIDDEN
ROLE_REQUIRED
MEMBERSHIP_NOT_FOUND
```

在 `GlobalExceptionHandler` 映射为 403；不得只依赖 Controller annotation 或前端隐藏按钮。

### 4.3 Auth、Session 与 TenantContext

当前 AuthController 固定授予 `ROLE_OWNER`，M5 必须改为根据认证结果角色设置 authority：

```text
ROLE_OWNER
ROLE_EDITOR
ROLE_VIEWER
```

`POST /api/auth/login`、`POST /api/auth/register`、`GET /api/me` 返回统一结构：

```json
{
  "user": { "id": "...", "email": "...", "displayName": "..." },
  "tenant": { "id": "...", "name": "...", "slug": "..." },
  "role": "EDITOR",
  "capabilities": ["GALLERY_READ", "PHOTO_READ", "PHOTO_WRITE", "CONFIG_READ", "CONFIG_WRITE"]
}
```

capabilities 可以由后端 policy 统一映射，避免前端自行推导 role 矩阵。当前仅使用默认 Membership；若用户属于多个 tenant，必须在响应/文档中明确当前选择的是默认工作区。

### 4.4 成员 API

建议最小端点：

```http
GET    /api/workspace/members
POST   /api/workspace/members
PATCH  /api/workspace/members/{membershipId}
DELETE /api/workspace/members/{membershipId}
```

添加成员请求：

```json
{
  "email": "editor@example.com",
  "role": "EDITOR"
}
```

修改角色请求：

```json
{
  "role": "VIEWER"
}
```

行为：

- `GET`：OWNER 列出当前工作区成员，包含 id、displayName、email、role、joinedAt。
- `POST`：OWNER 按已注册邮箱加入当前 tenant；重复成员返回 409。
- `PATCH`：OWNER 修改 EDITOR/VIEWER；降级最后 OWNER 必须拒绝。
- `DELETE`：OWNER 移除非最后 OWNER；被移除成员下次请求获得 403。

本阶段不实现邮件、邀请 token、接受/拒绝、批量导入或成员审计 UI。

## 5. Admin 设计

### 5.1 useAuth 与 contracts

更新 `useAuth`：

```text
role
capabilities
can(capability)
isOwner
isEditor
isViewer
```

注意后端 role 是认证响应顶层字段，不能继续读取错误的 `user.role`。

### 5.2 成员面板

新增一个轻量成员面板，可放在 `/app/` 或工作区 Header：

- OWNER-only 入口“成员管理”。
- 成员列表、角色 badge。
- 添加已注册邮箱。
- EDITOR/VIEWER 角色切换。
- 移除成员与最后 OWNER 提示。
- loading、错误恢复、键盘焦点和移动端布局。

第一版不新增独立复杂路由；若面板复杂度超过现有 Overview，可新增 `/app/members`，但必须有路由守卫和 OWNER 后端校验。

### 5.3 Workspace capability gating

- VIEWER：显示 Gallery/照片/Viewer 配置读取内容，隐藏上传、封面、删除、保存配置、发布、分享和成员管理。
- EDITOR：显示上传、照片编辑和保存配置；隐藏新建 Gallery、发布、分享和成员管理。
- OWNER：保留当前全部管理能力。

禁用或隐藏仅改善 UX。直接 API 调用仍必须得到后端 403，并在 UI 中显示业务错误。

## 6. 实施顺序

以下任务的核心代码已完成；“验收证据”部分仍是本阶段收尾工作。

| 任务 | 代码状态 | 仍需补的证据 |
| --- | --- | --- |
| 角色迁移与契约 | 已实现 | V7 从 V1–V6 升级报告 |
| 统一授权策略 | 已实现 | 真实三角色 HTTP 全矩阵 |
| 成员 Repository/API | 已实现 | 跨租户、重复成员和最后 OWNER 并发 |
| Auth/Session 同步 | 已实现 | 被移除成员旧 Session 集成验证 |
| Admin capability gating | 已实现 | EDITOR/VIEWER 浏览器交互证据 |
| 成员管理 UI | 已实现 | 完整浏览器三角色验收 |

### Task 1：角色迁移与契约

- V7 migration。
- `MembershipRole`、共享 role/capability contracts。
- AuthResponse / `/api/me` role/capabilities。
- Spring authority 使用实际 role。

### Task 2：统一授权策略

- 新增 policy。
- 将写入 Facade 接入 capability 断言。
- 全局错误 403 映射。
- 补 OWNER/EDITOR/VIEWER 服务层测试矩阵。

### Task 3：成员 Repository 与 API

- Membership/User 查询扩展。
- MembershipFacade、Controller、MyBatis/in-memory adapter。
- 最后 OWNER 防删除/降级。
- tenant-aware 查询和并发保护。

### Task 4：Admin auth 和 capability gating

- `useAuth` 解析顶层 role/capabilities。
- Overview/Workspace/Config 按 capability 显示动作。
- 403 恢复文案。

### Task 5：成员管理 UI

- OWNER 成员面板。
- 添加、改角色、移除、确认与刷新。
- Mobile/keyboard/empty/error states。

### Task 6：测试与验收

- Maven tests、Admin build、Docker V7 migration。
- OWNER 添加 EDITOR/VIEWER。
- 三角色 API 权限矩阵。
- 浏览器 MCP：成员登录、控件差异和直接 API 403。
- 回归 M4 公开访问、发布和分享。

## 7. 测试矩阵

### 7.1 写能力

| 操作 | OWNER | EDITOR | VIEWER |
| --- | ---: | ---: | ---: |
| 创建 Gallery | 201 | 403 | 403 |
| 上传、改封面、删照片 | 2xx | 2xx | 403 |
| 保存 Viewer 配置 | 2xx | 2xx | 403 |
| 发布、撤回、管理分享 | 2xx | 403 | 403 |
| 成员管理 | 2xx | 403 | 403 |

所有角色均可读取当前 tenant 的 Gallery、照片和配置。

### 7.2 成员安全

- 重复成员返回 409。
- 无效 role 返回 400/422。
- 非 OWNER 管理成员返回 403。
- 跨 tenant membership ID 不能读取、修改或删除。
- 不能删除最后一个 OWNER。
- 不能把最后一个 OWNER 降级。
- 并发角色变更后仍至少保留一个 OWNER。
- 被移除成员的旧 Session 后续管理请求被拒绝。

### 7.3 身份和回归

- 匿名管理 API 为 401。
- 登录/`/api/me`/Spring authority/TenantContext 的 role 一致。
- CSRF 缺失或无效时写操作拒绝。
- M4 PUBLISHED/PRIVATE/PASSWORD 访客规则不受 Membership 影响。
- V7 能从空库和 V1–V6 数据升级。
- MyBatis、dev-memory 和测试 fake 的角色行为一致。

## 8. 不做

- 邮件邀请、邀请 Token、邀请码和接受流程。
- 多工作区列表、切换或 active tenant 设置。
- PLATFORM_ADMIN、组织层级或跨 tenant 管理。
- Gallery 级成员授权、细粒度自定义权限和角色继承。
- 成员审计 UI、通知和批量导入。
- [M6 上传任务中心](next-slice-upload-task-productionization.md)、M7 配置版本化/性能优化。

## 9. Definition of Done

- [x] V7 支持 OWNER/EDITOR/VIEWER，历史 OWNER 无回归（代码与 Docker 启动已验证）。
- [x] `/api/me` 返回真实 role 和 capabilities，Spring authority 同步。
- [x] Facade 级 policy 覆盖 Gallery、Photo、Config、Share 和 Membership 写操作。
- [x] OWNER 可以添加、修改和移除当前 tenant 的成员（API/UI 已实现）。
- [x] 最后 OWNER 无法被删除或降级（服务层与租户锁已实现）。
- [x] EDITOR 只能编辑照片/配置，不能发布、分享或管理成员（API 403 已验证）。
- [x] VIEWER 只读，任何直接写 API 均返回 403（核心路径已验证）。
- [x] Admin 按 capabilities 显示操作，并妥善处理后端 403。
- [ ] V7 从已有 V1–V6 数据升级的独立报告和最后 OWNER 并发集成测试。
- [ ] 被移除成员旧 Session、完整三角色 HTTP/浏览器矩阵。

产品判断标准：

> 一个 OWNER 能安全地将已注册用户添加到默认工作区；每位成员只能做与其角色相符的事情；前端的按钮和后端的授权始终一致。