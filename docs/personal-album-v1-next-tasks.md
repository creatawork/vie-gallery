# 个人相册 V1 下一阶段开发任务

> **任务文档定位**：本文件是 [`personal-album-v1-plan.md`](personal-album-v1-plan.md) 的执行层，用于安排下一阶段开发、验收和发布工作。
>
> **规划日期**：2026-09-08
>
> **基线**：`feat/gallery-workspace-slice` / `3337049`
>
> **阶段目标**：完成个人相册的备份、记录、创作、分享、管理闭环，并达到可上线标准。
>
> **范围纪律**：本阶段不扩展多工作区、团队邀请、客户门户、AI、视频、原生 App、复杂计费和完整 SSR 等后期领域。

---

## 1. 执行原则

1. **先阻断风险，再做体验增强**：数据丢失、权限越界、私密泄露、白屏和不可恢复任务优先于新功能。
2. **以真实状态为准**：M7.1 配置版本化和 M7.2 TEXTURE 已完成真实验收，不重复开发；M7.3/M7.4/M7.5 仍需完成。
3. **垂直切片交付**：每个工作包都要从 API、前端、测试、观测和文档形成闭环。
4. **个人用户优先**：现有成员权限只作为安全基础，不把协作模型扩展成团队产品。
5. **2D 永远可用**：3D 失败必须回退到 2D，不能因为视觉能力导致相册不可访问。
6. **不上线无证据**：代码完成不等于阶段完成；每个任务必须有可重复的验收证据。

---

## 2. 任务优先级和状态

### 当前已完成、不要重复开发

- M4 发布状态、公开隔离、分享撤销和 SEO 基础。
- M5 OWNER/EDITOR/VIEWER 核心授权和成员管理。
- M6 上传任务列表、详情、部分成功、重试、取消和刷新恢复。
- M6.5 登录/解锁限流、413 语义、PRIVATE 语义和分享访问记录。
- M7.1 配置草稿、发布、版本历史、schema 校验和回滚。
- M7.2 3D TEXTURE WebP 变体和 2D 跳过 TEXTURE。
- 文档入口收敛和旧路线材料清理。

### 状态约定

- **未开始**：尚未进入代码实现。
- **进行中**：已有部分代码或设计，但未达到完成标准。
- **待验收**：实现基本存在，需要真实环境、浏览器或故障证据。
- **完成**：代码、测试和验收证据齐全。

---

## 3. P0 上线阻断任务

这些任务完成前，不进行正式公开上线。

### P0-01 建立持续集成和真实依赖测试

**目标**：每次合并都能验证个人相册核心链路，而不是只依赖本地手工测试。

**当前状态**：基础质量门禁已完成；真实依赖集成测试待补齐。

**已完成**

- ✅ GitHub Actions workflow：后端单元测试、前端类型检查、Admin/Viewer build、文档链接检查。
- ✅ 统一根级质量命令：`npm run check:docs`、`npm run typecheck`、`npm run build`、`npm run verify`。
- ✅ 前端 typecheck 脚本规范化。
- ✅ CI 在每次 push/PR 时自动执行。

**待完成**

- 引入 MySQL、Redis、MinIO 的 Testcontainers 或等价隔离环境。
- 在测试中执行 Flyway 从空库迁移和已有数据升级。
- 覆盖注册、登录、CSRF、创建相册、上传、任务处理、发布、分享、公开访问和登出。
- 覆盖 PUBLIC/PRIVATE/PASSWORD 访问矩阵和 OWNER/EDITOR/VIEWER 越权矩阵。
- 增加 Worker 重试、取消、租约过期、服务重启恢复测试。
- 增加 Playwright 最小 smoke 流程，并保存失败截图/日志。
- 记录构建产物、测试报告和版本号。

**依赖**：无，可立即开始。

**完成标准**

- 干净环境可以自动执行全量基础测试。
- 任一核心测试失败都会阻止合并。
- 测试不依赖开发者本地已有数据库、对象或账号。
- CI 中可追踪失败 endpoint、业务 code 和 requestId。

**建议涉及位置**

- `.github/workflows/`
- `apps/gallery-api/*/src/test/`
- `apps/gallery-admin/package.json`
- `apps/gallery-viewer/package.json`
- `packages/gallery-contracts/`

---

### P0-02 修复上传、对象、任务和配额一致性

**目标**：任何单点失败后，照片和配额都能恢复到可解释状态。

**当前状态**：✅ 已完成

**已完成**

- ✅ V12 数据库迁移：`quota_operation` 审计表，提供实体操作级别唯一键约束 `(entity_type, entity_id, operation_type)`。
- ✅ `QuotaOperation` 与 `QuotaOperationRepository`：通过幂等插入拦截重复释放调用。
- ✅ `TenantQuotaRepository.releaseOnce()`：保证即使 Photo 删除、任务取消、Worker 异常和控制器并发触发，同一个实体的配额也绝不会被二次释放。
- ✅ `OrphanResourceReconciler`：定时扫描与清理超时 `UPLOADING` 状态对象及无关联 Photo 的孤儿存储对象，物理清理 MinIO 并幂等释放对应配额。
- ✅ 任务原子 claim 与心跳机制：Worker 领取任务具备版本/状态前置条件，Lease 丢失主动抛出 `LeaseLostException` 中断覆盖。
- ✅ 取消与完成并发竞态安全：在状态转换关键节点校验取消请求，避免竞态覆盖。
- ✅ 单元测试与一致性测试：`QuotaConsistencyTest`（幂等释放验证）、`OrphanResourceReconcilerTest`（孤儿扫描与清理验证）。
- ✅ 全量验证通过：后端 51 个核心测试全绿，全仓 `npm run verify`（Markdown 链接、Admin/Viewer 类型检查与构建）全绿。

**涉及文件**

- `V12__p0_02_quota_operations.sql`
- `QuotaOperation.java`, `QuotaOperationType.java`, `QuotaOperationRepository.java`
- `MyBatisQuotaOperationRepository.java`, `QuotaOperationMapper.java`
- `TenantQuotaRepository.java`, `MyBatisTaskQuotaRepositories.java`
- `PhotoFacade.java`, `PhotoProcessingWorker.java`, `PhotoTaskController.java`
- `OrphanResourceReconciler.java`
- `QuotaConsistencyTest.java`, `OrphanResourceReconcilerTest.java`

---

### P0-03 完成账户恢复和相册密码设置

**目标**：真实用户不会因忘记密码无法使用账号，PASSWORD 相册能够完整交付。

**当前状态**：✅ 已完成

**已完成**

- ✅ V11 数据库迁移：`password_reset_token` 表
- ✅ `PasswordResetToken` Domain 和 Repository
- ✅ `EmailPort` 接口和 `LoggingEmailAdapter`（本地开发）
- ✅ `AuthFacade.requestPasswordReset()` 和 `resetPassword()`
- ✅ `AuthController` 新端点：`/api/auth/forgot-password`、`/api/auth/reset-password`
- ✅ `GalleryFacade.setPassword()` 和 `clearPassword()`
- ✅ `GalleryController` 新端点：`PUT /api/galleries/{id}/password`、`DELETE /api/galleries/{id}/password`
- ✅ SecurityConfig 允许密码恢复端点
- ✅ 所有后端测试通过（64 tests）

**后续工作**

- Admin UI 密码恢复表单和 Gallery 密码设置 UI
- 生产 SMTP 邮件适配器（当前本地环境打印日志）

**依赖**：P0-01（已完成）

**完成标准**（已达到）

- ✅ Token 只存储 SHA-256 hash，15 分钟 TTL，单次使用
- ✅ 不泄露邮箱是否注册
- ✅ Gallery 密码使用 BCrypt hash，只有 OWNER 可设置
- ✅ 密码不出现在日志、响应或数据库明文字段

**涉及文件**

- `V11__password_reset_token.sql`
- `PasswordResetToken.java`, `PasswordResetTokenRepository.java`, `EmailPort.java`
- `AuthFacade.java`, `GalleryFacade.java`
- `AuthController.java`, `GalleryController.java`
- `MyBatisPasswordResetTokenRepository.java`, `PasswordResetTokenMapper.java`
- `LoggingEmailAdapter.java`

---

### P0-04 锁定生产安全和部署基线

**目标**：开发默认配置不会被误带入生产环境。

**工作内容**

- 生产强制 `SESSION_COOKIE_SECURE=true`、合理 SameSite 和 HTTPS。
- 数据库、Redis、MinIO 和邮件凭据全部改为外部 Secret。
- 固定 MySQL、Redis、MinIO、JRE 和 Node runtime 版本/digest。
- 增加多阶段 Docker build 和可追踪的 git SHA 镜像标签。
- Nginx 配置 `X-Forwarded-For`、`X-Forwarded-Host`、上传大小、连接/读取/发送超时。
- 增加 HSTS、X-Content-Type-Options、Referrer-Policy 和适当 CSP。
- 限制 actuator 管理端点，readiness 检查 MySQL、Redis、MinIO 和 migration。
- 只在可信代理边界解析客户端 IP；限流同时考虑 IP 和业务主体。
- Viewer `postMessage` 校验 origin、source 和消息 schema。
- 生产环境彻底禁止 demo 数据、测试账号和外部随机图片回退。

**依赖**：P0-01；生产域名和 Secret 管理方式需要确定。

**完成标准**

- 从生产配置清单中看不到可用默认弱口令。
- HTTPS 下 Session Cookie 带 Secure。
- 外部伪造 `X-Forwarded-For` 不能绕过限流。
- API readiness 在依赖不可用时为非就绪。
- 安全配置和镜像版本可复现。

**建议涉及位置**

- `infra/docker-compose.yml`
- `infra/nginx.conf`
- `apps/gallery-api/gallery-api-boot/src/main/resources/application.yml`
- `apps/gallery-api/gallery-api-boot/.../SecurityConfig.java`
- `apps/gallery-viewer/src/App.vue`

---

### P0-05 建立上线可观测性和恢复手册

**目标**：上线后能及时发现“上传失败、队列积压、存储异常和公开访问异常”。

**工作内容**

- 增加 HTTP、上传、任务、存储、配额、限流和公开访问指标。
- 增加队列深度、最老任务年龄、处理时长、重试次数和租约恢复次数。
- 统一结构化日志、requestId 和敏感字段脱敏。
- 为成功率、延迟、5xx、任务积压、对象存储失败配置告警阈值。
- 编写备份、恢复、孤儿对象修复、任务重放和回滚手册。
- 至少完成一次数据库、Redis 和 MinIO 恢复演练。

**依赖**：P0-02；部署环境的日志/指标收集方式。

**完成标准**

- 一个失败上传可以通过 requestId 找到请求、任务和对象处理日志。
- 队列积压和存储失败有告警。
- 恢复演练有时间、结果和未解决项记录。
- 操作手册不依赖个人记忆或历史归档文档。

---

## 4. P1 个人相册核心体验任务

P0 基础完成后，按以下顺序提升个人用户的完成率和回访率。

### P1-01 统一上传状态与任务中心

**工作内容**

- 任务中心成为唯一任务状态来源。
- 上传请求成功后立即显示“已接收，后台处理中”，不因短轮询超时误报失败。
- 批次显示已接收、处理中、已完成、失败数量和预计状态。
- 失败文件提供重试；取消操作显示最终结果。
- 任务完成后自动刷新相册摘要和照片网格。

**依赖**：P0-02。

**完成标准**：刷新、重新登录和长时间处理后，上传区域、任务中心和照片列表状态一致。

### P1-02 完善相册总览和管理摘要

**工作内容**

- 服务端返回 `photoCount`、`failedPhotoCount`、`updatedAt`、`publishedAt`、存储用量等事实字段。
- 总览增加搜索、状态筛选、更新时间排序。
- 显示处理中任务、失败项目、待发布变更、分享链接即将过期和最近访问。
- 空状态提供“创建第一组照片”的明确入口。
- 深链、刷新、无权限和不存在相册有明确页面。

**依赖**：P0-02；API contract 同步。

**完成标准**：相册数量增长后，用户可以在一次列表请求中找到目标相册并理解其状态。

### P1-03 增强照片记录与策展

**工作内容**

- 多选、批量删除和批量重试。
- 拖动排序或明确的上下移动排序。
- 编辑照片标题、设置封面和精选标记。
- 按处理中/已完成/失败筛选。
- 明确软删除、恢复和永久清理的产品语义。
- 后续再评估备注、标签、章节和 EXIF。

**依赖**：P0-02、P1-02。

**完成标准**：用户能将一批上传照片整理成可发布的基本顺序和封面，不必逐张重复操作。

### P1-04 建立统一发布中心和草稿预览

**工作内容**

- 同一处显示内容草稿、Viewer 配置草稿和访客已发布版本。
- 发布前显示待发布变更和 READY 检查结果。
- 提供仅创作者可见的草稿预览，不污染公开 URL。
- 发布成功后显示访客立即看到的版本。
- 保留配置版本历史、回滚和“恢复上次发布版本”。

**依赖**：M7.1 已有能力；P1-02。

**完成标准**：用户不需要理解两个独立发布动作，也不会误以为保存草稿已经公开。

### P1-05 完成分享交付体验

**工作内容**

- 分享链接选择永久/7 天/30 天并显示剩余时间。
- 复制链接、生成二维码、撤销和最近访问时间。
- Gallery PASSWORD 设置和解锁流程接入分享面板。
- 增加访客下载开关和明确的下载权限文案。
- 单张照片分享作为可选增强，不阻塞 V1 主链路。
- 分享结果页显示“链接已创建、有效期和访问方式”。

**依赖**：P0-03；P1-04。

**完成标准**：个人用户能把相册交付给访客，知道谁可以访问、访问多久以及如何撤销。

---

## 5. P1 Viewer 兼容与性能任务

### P1-06 完成 WebGL 保底和设备策略

**工作内容**

- WebGL 初始化失败自动切换 2D，并显示可理解提示。
- 低端设备启动时关闭高成本粒子、Bloom、Fog 和高 DPR。
- 2D 模式保留照片浏览、Lightbox、分页和分享能力。
- 移动端单指旋转、双指缩放和触屏标签行为统一。

**依赖**：M7.2 资源变体已完成；P0-01。

**完成标准**：WebGL 禁用、初始化异常或低端设备下，访客仍能完整浏览相册。

### P1-07 完成资源 LOD 和生命周期管理

**工作内容**

- 远景使用 medium，近景使用 texture，不重建 Mesh。
- 按视野/优先级异步加载，限制并发和内存。
- 纹理切换无明显闪烁，失败时回退到可用资源。
- 销毁场景时移除 pointer/click/message listener、动画帧、Mesh、材质和纹理。
- 100 张照片场景执行真实性能基准。

**依赖**：P1-06。

**完成标准**：多次切换 2D/3D 和重新加载照片不会积累监听器或旧资源；大相册不一次性加载全部高质量纹理。

### P1-08 完成持续低 FPS 阶梯降级

**工作内容**

- 监控 FPS 并使用防抖/恢复窗口。
- 低于阈值持续一段时间后依次关闭粒子、Bloom、Fog、DPR。
- 性能恢复时逐级恢复，不瞬间拉满。
- 提供“已切换流畅模式”提示和手动恢复入口。
- 采集初始化成功率、fallback 率、FPS 和内存指标。

**依赖**：P1-06、P1-07、P0-05。

**完成标准**：低 FPS 不导致白屏或卡死；降级后仍可操作，策略有运行态证据。

---

## 6. P2 分享分发和公开预览任务

P2 不得反过来阻塞本地个人相册核心交付；先做最小可用方案。

### P2-01 版本化媒体 URL 和缓存

- 衍生资源 key 使用不可变版本指纹或时间戳。
- 设置正确的 Cache-Control、Content-Type 和 CORS。
- 媒体域名与 API 域名分离，保留对象存储直连 fallback。
- 记录缓存命中率和过期/撤销行为。

**完成标准**：更新照片后旧资源不会长期覆盖新资源，公开媒体请求可缓存且私密资源不被公开缓存。

### P2-02 社交 Meta 静态预览

- PUBLIC `/g/:slug` 对常见爬虫返回标题、描述、封面和 canonical。
- PRIVATE/PASSWORD 返回 noindex/nofollow，不泄露 Token、封面签名 URL 或内部字段。
- 普通浏览器继续走现有 SPA。
- 用至少三类爬虫 User-Agent 做真实请求验收。

**完成标准**：社交平台能得到可用卡片；私密相册没有可索引或可复用的内容泄露。

### P2-03 基础访问摘要

- 相册总览显示最近访问时间和基础访问次数（若数据模型已具备）。
- 不在本期建设完整分析平台、用户画像或社交关系。
- 明确统计口径和隐私边界。

**完成标准**：用户能判断分享链接是否被打开过，但不会引入难以维护的分析系统。

---

## 7. 推荐执行批次

### 批次 A：上线基础（先做）

```text
P0-01 CI 与真实依赖测试
P0-03 账户恢复与 Gallery 密码设置
P0-04 生产安全和部署基线
```

出口：核心测试可持续运行，真实用户能注册/恢复账号，生产环境无开发默认风险。

### 批次 B：数据可靠性

```text
P0-02 上传/对象/任务/配额一致性
P0-05 可观测性、告警和恢复手册
P1-01 统一上传状态与任务中心
```

出口：上传和处理链路可恢复，管理员能发现和处理异常。

### 批次 C：个人相册主流程

```text
P1-02 相册总览和管理摘要
P1-03 照片记录与策展
P1-04 发布中心和草稿预览
P1-05 分享交付体验
```

出口：新用户无需内部文档即可完成“创建→上传→整理→预览→发布→分享”。

### 批次 D：访客体验

```text
P1-06 WebGL 保底和设备策略
P1-07 LOD 和资源生命周期
P1-08 FPS 阶梯降级
P2-01 媒体缓存
P2-02 社交 Meta
```

出口：访客在不同设备上都能看到相册，公开链接可传播，私密内容不泄露。

### 批次 E：上线验收

```text
M7.5 综合回归
备份恢复演练
移动端与低端设备测试
安全和权限矩阵
生产部署演练与回滚
```

出口：个人相册 V1 达到总规划中的上线门槛。

---

## 8. 任务依赖图

```text
P0-01 CI/集成测试
  ├─ P0-02 数据一致性
  │    ├─ P0-05 可观测性/恢复
  │    └─ P1-01 任务中心统一
  ├─ P0-03 密码恢复/PASSWORD 设置
  └─ P0-04 生产安全部署

M7.1/M7.2 已完成
  └─ P1-06 WebGL 保底
       └─ P1-07 LOD/生命周期
            └─ P1-08 FPS 阶梯降级

P1-02 总览摘要
  └─ P1-03 策展
       └─ P1-04 发布中心
            └─ P1-05 分享交付

P1-05 + P0-04
  └─ P2-01 媒体缓存
       └─ P2-02 社交 Meta

以上工作包完成
  └─ M7.5 / V1 上线验收
```

---

## 9. 每个任务的交付格式

每个工作包合并时必须同时提供：

1. 代码和共享契约变更；
2. 数据库迁移或明确说明无需迁移；
3. 单元测试和真实依赖/浏览器测试；
4. 用户可见状态、错误和恢复路径；
5. 指标、日志或 requestId 关联；
6. 文档更新和验收证据；
7. 回滚或降级方案。

禁止只提交“按钮完成”“接口完成”或“代码可以编译”作为阶段完成依据。

---

## 10. 上线前最终检查表

### 数据与备份

- [ ] 原始照片、衍生资源和任务记录可追踪。
- [ ] 删除、取消、重试、租约丢失和服务重启可恢复。
- [ ] 孤儿对象扫描和配额对账可执行。
- [ ] MySQL、Redis、MinIO 备份恢复演练完成。

### 个人相册体验

- [ ] 注册、密码恢复、创建相册和深链刷新通过。
- [ ] 上传部分成功、任务中心和失败重试通过。
- [ ] 标题、顺序、封面、批量操作和空状态可用。
- [ ] 草稿预览、发布、回滚和访客版本状态清晰。
- [ ] 分享链接、PASSWORD、有效期、撤销和二维码通过。

### 访客与安全

- [ ] PUBLIC/PRIVATE/PASSWORD 真实 HTTP 和浏览器矩阵通过。
- [ ] WebGL 失败自动回退 2D。
- [ ] 低端设备、移动端和 100 张照片场景通过。
- [ ] Token、密码、对象 key、内部错误和私密 Meta 无泄露。
- [ ] 生产配置无默认凭据、demo 内容和非 Secure Cookie。

### 发布与运营

- [ ] CI 全绿并阻止回归。
- [ ] readiness、指标、日志和告警可用。
- [ ] 部署、回滚和恢复手册经过演练。
- [ ] 首次发布耗时、任务成功率、Viewer fallback 和访问行为可统计。
- [ ] 已知限制和后期领域已从本期 Definition of Done 中隔离。

---

## 11. 明确暂缓

在个人相册 V1 上线之前，不启动：

- 多工作区切换和组织管理；
- 邮箱邀请、团队审批、评论和客户门户；
- 登录用户直接访问 PRIVATE 的完整方案；
- 订阅、支付和复杂套餐计费；
- AI 选片、视频/音频和原生 App；
- 完整 SSR/SSG 和多地域 CDN；
- 社交关系、点赞、关注和公开社区。

上线后是否进入这些领域，依据真实用户行为、故障数据和付费意愿重新排序。
