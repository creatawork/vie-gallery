# 个人相册 V1 安全检查与验证报告 (Security Check)

> **检查日期**：2026-09-10  
> **检查人**：creatawork / ZCode  
> **状态**：✅ 全部通过（无 P0/P1 开放安全缺陷）

---

## 1. 检查矩阵与验证结果

| 类别 | 验证点 | 检验方法 / 证据位置 | 结果 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **IDOR (越权访问)** | 用户 A 不能读取、修改或删除用户 B 的 Gallery、Photo、Task 与 ShareLink | `PhotoFacadeAuthorizationTest`、`WorkspaceAuthorizationPolicyTest`、`MembershipFacadeTest` | ✅ PASS | 闭环 |
| **租户数据隔离** | 核心业务表带 `tenant_id`；跨租户 UUID 统一返回 404，不返回 403 泄露资源存在性 | `WorkspaceAuthorizationPolicy`、`GalleryFacadeTest`、`MyBatisPhotoRepository` | ✅ PASS | 闭环 |
| **分享 Token** | 撤销与过期 Token 均拒绝访问；`rawToken` 仅在创建响应中返回一次，列表与日志中仅存储哈希 | `PublicAccessFacadeTest`、`ShareLinkFacadeTest`、`ShareLinkController` | ✅ PASS | 闭环 |
| **草稿预览 Token** | 无令牌或令牌错误时 DRAFT 相册返回 404；ARCHIVED 恒为 404；令牌不污染公开分享链接与 SEO | `PublicAccessFacadeTest`、`GalleryLifecycleIntegrationTest`、`openCreatorPreview` | ✅ PASS | 闭环 |
| **密码与重置安全** | 相册密码使用 BCrypt 哈希；账户重置 Token 使用 SHA-256 哈希、15 分钟 TTL 且单次有效；错误提示不泄露注册状态 | `AuthFacadeTest`、`AuthControllerTest`、`BCryptPasswordEncoder` | ✅ PASS | 闭环 |
| **文件上传边界** | 仅允许 JPEG/PNG/WebP 格式；文件大小上限 100MB；最大像素 4000 万；配额不足或存储失败时事务性清理并回滚配额 | `PhotoFacade.java`、`QuotaConsistencyTest`、`PhotoProcessingTaskStateMachineTest` | ✅ PASS | 闭环 |
| **会话与 Cookie** | 登出后销毁 Session 并清除 Cookie；生产环境启用 `HttpOnly` 与 `Secure` Cookie；CSRF 防御启用 | `AuthController.logout()`、`SecurityConfig.java`、`application-prod.yml` | ✅ PASS | 闭环 |
| **限流防御** | 登录失败与密码展厅解锁实施 Redis 计数与阶梯限流，防止暴力破解 | `RedisRateLimiterTest`、`RedisRateLimiter.java`、`PublicGalleryController` | ✅ PASS | 闭环 |

---

## 2. 详细证据与代码审查

### 2.1 IDOR 与租户隔离
- **验证机制**：`WorkspaceAuthorizationPolicy` 在 Facade 入口处统一校验当前登录主体在目标租户下的能力（`PHOTO_READ`、`PHOTO_WRITE`、`GALLERY_CREATE`、`PUBLISH`、`SHARE_MANAGE`）。
- **SQL 边界**：所有 Mapper 操作（如 `PhotoMapper`、`GalleryMapper`）均强制带入 `tenant_id = UUID_TO_BIN(#{tenantId})` 过滤条件，彻底杜绝跨租户越权。

### 2.2 分享与草稿令牌安全性
- **分享链接**：创建时生成高熵安全随机字符串，数据库仅存储 SHA-256 哈希；公开访问调用 `validateShareToken` 时实时比对过期时间及 `isRevoked` 标记；访问成功记录节流防抖的 `lastAccessedAt`。
- **预览令牌**：创作者预览使用 15 分钟临时内存令牌，仅在内存中映射至 `galleryId`，即便外泄也无法通过持久化接口获取；访客端 URL 中使用独立 `preview` 参数，不作为永久分享链接。

### 2.3 文件上传边界与配额一致性
- **类型安全**：不仅校验 `Content-Type`，还通过 `ImageIO.read()` 尝试解码并校验像素边界（长宽积 ≤ 40,000,000），拒绝伪造扩展名的可执行文件或畸形文件。
- **原子性回滚**：上传异常时执行 `quotas.releaseOnce(tenant, "UPLOAD_FAIL", ...)`，并调用对象存储删除已上传临时对象。

---

## 3. V1 已知限制（已确认安全可控）

1. **SMTP 邮件适配器**：本地和开发环境中重置密码 Token 通过日志输出；生产环境需在配置中填入 SMTP 服务凭证。
2. **预览令牌重启失效**：`CreatorPreviewTokens` 使用内存存储（15 分钟 TTL），多实例或服务重启后创作者重新点击预览即可自动签发新令牌。

---

*结论：Security Check 检查项全部通过，安全边界清晰完备，准予进入 WP-8 可观测性与恢复手册建设。*
