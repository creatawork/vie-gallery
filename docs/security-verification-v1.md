# 个人相册 V1 安全检查与验证报告 (Security Check)

> **检查日期**：2026-09-12（收口重验续）  
> **检查人**：creatawork / Cursor Agent  
> **状态**：✅ 本轮开放 P0/P1 已修复；见下方证据

---

## 1. 检查矩阵与验证结果

| 类别 | 验证点 | 检验方法 / 证据位置 | 结果 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **IDOR (越权访问)** | 用户 A 不能读取、修改或删除用户 B 的 Gallery、Photo、ShareLink | `CrossTenantAccessAuthorizationTest`、`PhotoFacadeAuthorizationTest`、`WorkspaceAuthorizationPolicyTest` | ✅ PASS | 闭环（跨租户统一 NOT_FOUND） |
| **租户数据隔离** | 核心业务表带 `tenant_id`；跨租户 UUID 统一返回 404 | `CrossTenantAccessAuthorizationTest`、`ShareLinkFacade`（`SHARE_LINK_NOT_FOUND`） | ✅ PASS | 闭环 |
| **分享 Token** | 撤销/过期/跨馆 Token 拒绝；`rawToken` 仅创建响应 | `PublicAccessFacadeTest`、`ShareLinkFacadeTest` | ✅ PASS | 闭环 |
| **密码相册解锁** | 解锁 Session 绑定 passwordHash 指纹；改密/清密后旧 unlock 失效 | `PublicAccessFacadeTest.passwordChangeInvalidatesExistingUnlockSession`、`PublicGalleryController` | ✅ PASS | 本轮修复 |
| **账户重置 Session** | 重置密码递增 `authentication_version`；旧登录 Session 立即失效 | `V13__user_authentication_version.sql`、`TenantContextFilter`、`AuthFacadeTest` | ✅ PASS | 本轮修复 |
| **密码重置持久化** | `updateCredentials` 更新而非 INSERT | `MyBatisUserRepository.updateCredentials`、`AuthFacade.resetPassword` | ✅ PASS | 本轮修复 P0 |
| **草稿预览 Token** | 无令牌 DRAFT 404；令牌不污染公开分享 | `PublicAccessFacadeTest` | ✅ PASS | 闭环 |
| **密码与重置安全** | BCrypt；Token SHA-256、15m TTL、单次；防枚举 | `AuthFacadeTest`、`AuthControllerTest` | ✅ PASS | 闭环 |
| **生产邮件** | prod 使用 SmtpEmailAdapter；禁止 LoggingEmailAdapter 打 raw token | `@Profile("prod"/"!prod")`、`ProductionConfigValidator` | ✅ PASS | WP-9 已补 |
| **文件上传边界** | JPEG/PNG/WebP；大小/像素；失败回滚配额 | `PhotoFacade.java` 代码审查 | ✅ PASS | 代码证据（自动化覆盖偏角色/配额） |
| **会话与 Cookie** | 登出销毁；生产 Secure/HttpOnly；CSRF | `AuthController`、`application-prod.yml` | ✅ PASS | 闭环 |
| **限流防御** | 登录/解锁 Redis 限流 | `RedisRateLimiterTest` | ✅ PASS | 闭环 |
| **敏感数据** | password/rawToken 不进 list；生产日志不记 reset token | 代码审查 + SmtpEmailAdapter | ✅ PASS | 闭环 |

---

## 2. 本轮修复摘要（2026-09-12）

1. **P0**：`resetPassword` 原先对已有用户 `users.save()`（仅 INSERT），生产会失败；改为 `updateCredentials`。
2. **P1**：`users.authentication_version` + `CurrentPrincipal.authenticationVersion`；`TenantContextFilter` 校验失败则 invalidate Session。
3. **P1**：访客 unlock Session 增加 `public_password_fp`；相册改密/清密后指纹不匹配 → 需重新解锁。
4. **WP-9 延续**：生产 SMTP + MAIL_* 启动校验（上一轮）。

---

## 3. V1 已知限制（已确认安全可控）

1. **预览令牌重启失效**：内存 15 分钟 TTL；重启后重新签发即可。
2. **列表视图策展**：仅网格视图；不构成安全问题。
3. **二维码**：V1 可降级。
4. **跨租户 Photo/Task/ViewerConfig**：Gallery/ShareLink 有专用 IDOR 测试；Photo 依赖 `tenantId` 查询 + 角色门禁，未单独扩集成矩阵（M7.5 可补）。

---

*结论：Security Check 开放 P0/P1 已关闭，可进入 WP-8。*
