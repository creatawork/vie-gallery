# 下一阶段实现指导：发布前硬化（M6.5）

> 上位规范：[open-gallery-product-roadmap.md](./open-gallery-product-roadmap.md)
> 当前基线：[next-slice-upload-task-productionization.md](./next-slice-upload-task-productionization.md)（M6 上传任务生产化收尾中）
> 阶段定位：M6 任务系统收尾后、M7 体验演进前，集中修复上线阻断项：安全限流、认证可用性、错误语义、演示残留与分享运营能力。
> 当前状态：已完成真实环境验收（后端 59 项测试、M6 CLI 主流程与 M6.5 专项 HTTP、浏览器 MCP 前端验证）。2.2 密码策略与重置流程按决策推迟到上线前准备阶段，未实施。

---

## 1. 阶段目标

M3.5–M6 已交付公开访问、发布、协作授权和任务系统，工程结构完整。但产品评审发现若干"上线即事故"的缺口，且多数是独立小改动，不需要等待 M7 的复杂设计。M6.5 的目标是让系统达到 **testing-guide.md 中"当前质量门槛"的真实含义**：

```text
可以接受真实用户注册，不会：
  - 被暴力破解账号或密码相册
  - 忘记密码后永久锁死
  - 在真实域名看到演示假内容或开发期测试账密
  - 在超限上传时收到误导性的 500
  - 被 PRIVATE 的语义误导（实现与文案不一致）
  - 无法知道分享链接有没有被打开过
```

产品判断标准：

> 上线前的加固不追求新功能，只要求：安全边界真实存在、文案与行为一致、开发期残留不可见、错误可理解和可操作。

## 2. 硬化项清单（按优先级）

### 2.1 安全：登录 / 解锁 / 限流落地

**现状证据**

- `RATE_LIMITED` 异常与 429 映射仅预留：`gallery-api-domain/.../PublicAccessException.java:32,66-68`、`gallery-api-boot/.../GlobalExceptionHandler.java:42`，全代码库无任何抛出点。
- 登录无失败计数与锁定：`AuthFacade.java:59-71` 直接比对密码。
- PASSWORD 相册解锁无限次尝试：`PublicGalleryController.java:96-112` 无次数限制；错误密码仅返回 403。

**设计建议**

- 登录限流（账户维度，Redis 计数）：连续失败 N 次（建议 5 次 / 15 分钟）后返回 429 `RATE_LIMITED` 或统一延迟响应，避免暴露"账户存在性"。
- PASSWORD 解锁限流：按 `slug + 客户端 IP` 计数，建议 5 次失败后 15 分钟内返回 429；成功后清空计数。Redis 基础设施已就绪（Spring Session 同源）。
- 分享 Token 校验本身无副作用，不需要逐次限流；对公开接口整体在网关侧（nginx `limit_req`）做兜底限流，见 2.4 部署项。
- 限流响应体复用现有 `ApiError{code, message, requestId}`，code 使用 `RATE_LIMITED`。

### 2.2 认证可用性：密码策略与重置流程

> 决策（M6.5 实施时）：本节推迟到项目上线前准备阶段实施，不占用当前主业务开发。以下内容保留为上线前待办。

**现状证据**

- 密码唯一校验为长度 `@Size(min=12, max=128)`：`AuthController.java:108-115`，无复杂度规则、无强度提示。
- 系统没有忘记密码 / 重置密码流程；注册邮箱唯一，忘记密码即账号锁死。这是阻断上线的最重要可用性缺口。

**设计建议**

- 最低密码长度降到 8 位，并给出可理解的强度提示（如"至少 8 位，建议包含字母和数字"），降低注册转化门槛。
- 新增密码重置闭环（依赖邮件发送能力，可与 M8 邮箱能力共用基础设施）：
  - `POST /api/auth/forgot-password`（按邮箱生成一次性令牌）
  - `POST /api/auth/reset-password`（令牌 + 新密码，令牌单次有效、短 TTL）
  - 令牌只存哈希，校验失败不区分"邮箱不存在/令牌无效"
- 若最短周期内无法接入邮件 provider，最小可用方案是运维侧明文登记手工重置入口，并在文档中记录为临时措施。

### 2.3 开发期残留移除

**现状证据**

- Admin 注册/登录表单预填测试账密：`apps/gallery-admin/src/views/OverviewView.vue:16-19`（`tester@example.com` / `Password123456` / `Creator Tester`）。
- Viewer 无 slug 时回退 demo 模式，且从 `picsum.photos` 拉外部随机图展示 12 张假照片：`apps/gallery-viewer/src/App.vue:14,147,354-362`。

**硬化要求**

- 移除 Admin 表单预填值，改为 placeholder。
- Viewer 的 demo 回退仅允许 `import.meta.env.DEV` 生效；生产环境访问 `/g/`（空 slug）必须呈现明确的"相册不存在"或引导页，不得加载演示照片。
- 若团队希望保留官方 showcase，应使用系统内真实创建的 Gallery + 自有图片资源，不使用第三方图片服务。

### 2.4 错误语义修正

**现状证据**

- multipart 超过 servlet `max-file-size`（100MB）时抛 `MaxUploadSizeExceededException`，无人处理，落入兜底 500 `INTERNAL_ERROR`（`GlobalExceptionHandler.java:101-105` 附近兜底分支）。
- 业务层 `FILE_TOO_LARGE` 被映射为 409（`GlobalExceptionHandler.java:48-60` 冲突组）。

**硬化要求**

- `GlobalExceptionHandler` 增加 `MaxUploadSizeExceededException` 分支 → 413 `PAYLOAD_TOO_LARGE`，并给出中文 message（"文件体积超过限制"）。
- `FILE_TOO_LARGE` 从 409 组移出，统一映射为 413。
- 前端 `useGalleryWorkspace.ts:53` 已有 413 文案，映射修正后真实生效，前端无需改动。

### 2.5 访问语义统一（PRIVATE）

**现状证据**

- Roadmap 8.1 定义"PRIVATE：仅登录用户或分享 Token"，但实现是 PRIVATE 只认分享 Token，登录用户访问也得到 `SHARE_LINK_REQUIRED`：`PublicAccessFacade.java:193-199`。
- 当前有效形态实际只有：PUBLIC / PASSWORD / 仅 Token 私密。

**决策建议（二选一，M6.5 必须确定并同步文档）**

- 方案 A（推荐，短期）：将产品文案与 Roadmap 8.1 统一为"PRIVATE：仅持有分享链接的访客可访问"，在创建空间表单与分享弹窗中把语义写清楚，避免创作者误解"登录后可访问自己加入的私密相册"。
- 方案 B（完整，成本高）：在公开 API 中对 PRIVATE 相册校验登录会话（复用 `TenantContextFilter` 的会话解析），登录成员（`PHOTO_READ` 或成员身份）可直接访问。涉及公开端认证化，放入 M8 与"登录访客"能力一起做。

### 2.6 分享链接运营能力（P1，低风险高价值）

**现状证据**

- 创建接口 `expiresAt` 可空，不传即永久有效：`ShareLinkFacade.java:46-88`、`ShareLinkController.java:29-47`；Admin 分享弹窗没有有效期选项。
- `last_accessed_at` 字段与更新 SQL 存在，但公开访问路径从不更新：`PublicAccessFacade.java:213-233` 校验链无调用。

**设计建议**

- 创建分享链接提供有效期选项（永久 / 7 天 / 30 天，默认 30 天，服务端可配），列表展示剩余有效期。
- 成功校验 Token 后更新 `last_accessed_at`，为避免写入放大，按"距上次更新时间超过 N 分钟才写"节流；在分享弹窗展示最近访问时间。
- 分享弹窗文案同步 2.5 的语义统一。

## 3. 测试矩阵

- 登录 5 次失败后 429，成功后计数清零；不同账户互不影响。
- PASSWORD 解锁 5 次失败后 429；错误密码仍返回 403 `PASSWORD_INVALID`。
- 注册/登录表单无预填值；`/g/` 空 slug 在生产构建中不出现 demo 内容。
- 超 100MB 上传返回 413 `PAYLOAD_TOO_LARGE`，业务层超限（如 100MB 校验）返回 413 `FILE_TOO_LARGE`（或统一为一个错误码，须在实现前固定）。
- PRIVATE 访问行为与统一后的文案一致（走方案 A 则回归现有 Token 路径即可，补一条文档一致性检查）。
- 分享链接按默认 30 天过期；访问后 `last_accessed_at` 更新且节流生效；撤销后不可访问回归。
- 所有错误响应仍携带 `requestId`，无明文 token/密码泄漏。

## 4. 实施顺序

硬化项彼此独立，可并行，按风险递减：

### M6.5.1：限流与认证可用性

- Redis 速率限制组件（账户/IP/slug 维度计数器 + TTL）。
- 登录失败计数与 429。
- PASSWORD 解锁失败计数与 429。
- 密码策略下调（8 位起步）+ 强度提示。
- 密码重置 API 与 Admin 入口（或最小方案：文档化手工重置）。

### M6.5.2：残留与语义

- 移除 Admin 预填账密、Viewer demo 生产关停。
- GlobalExceptionHandler 413 映射。
- PRIVATE 语义统一（决策后同步 Roadmap 8.1 / 创建表单 / 分享弹窗）。

### M6.5.3：分享运营能力

- 有效期参数 + Admin 有效期选项 UI。
- `last_accessed_at` 节流更新 + 分享弹窗展示。

## 5. 不做

- 不做多因子认证、账号锁定策略、邮箱验证码完备体系（跟随 M8 邮箱能力）。
- 不做实现方案 B 的"登录用户访问 PRIVATE"（列入 M8）。
- 不引入独立网关/API 限流中间件；先用 Spring 侧计数 + nginx `limit_req` 兜底。
- 不进行大型视觉改版或性能优化（属于 M7）。

## 6. Definition of Done

- [x] 登录与 PASSWORD 解锁限流落地，429 响应体含 `requestId`，Redis 可观测。
- [ ] 密码最低 8 位、有强度提示；忘记密码闭环可用（或最小手工方案已文档化）——2.2 按决策推迟到上线前准备阶段，未勾选。
- [x] Admin 表单无预填账密；生产构建 `/g/` 空 slug 不出现 demo 内容。
- [x] 超限上传返回 413 而非 500/409；前端 413 文案真实生效。
- [x] PRIVATE 语义已决策并与 Roadmap、创建表单、分享弹窗一致。
- [x] 分享链接有默认有效期选项；`last_accessed_at` 更新有节流证据。
- [x] 后端测试、Admin/Viewer build、Docker 与浏览器 MCP 验收通过；旧用例不回归。

## 7. 完成后进入的阶段

M6.5 完成后进入 M7：Viewer 配置协议版本化、CDN 资源分发、3D 性能与移动端降级、社交分享预览兜底。规划见 [`next-slice-m7-viewer-config-and-performance.md`](./next-slice-m7-viewer-config-and-performance.md)。
