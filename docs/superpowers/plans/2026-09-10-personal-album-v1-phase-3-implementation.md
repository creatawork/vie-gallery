# 个人相册 V1 阶段 3 实现计划（V1 Ready 闭环）

> **For agentic workers:** **严格按固定顺序执行，禁止插队或并行扩展新功能。** 每包合并前跑 `npm run verify`、`mvn test`（涉及 API 时加集成测试），并更新 `docs/testing-guide.md` 与 `docs/personal-album-v1-next-tasks.md`。
>
> **V1 Ready 核心标准：** 真实用户**无需阅读内部文档**即可完成 **上传 → 整理 → 发布 → 分享 → 访问/下载**；出现问题时能通过 **requestId / 指标 / 手册** 定位并恢复。
>
> **阶段纪律：** V1 **不再扩展功能面**，只补齐闭环、安全边界、可观测与回归证据。P1-06+ Viewer 性能、P2 分发、拖拽排序、单张分享等 **全部移出 V1 Ready 路径**。
>
> **Tech Stack:** Spring Boot 17、Vue 3 + TypeScript、MySQL 8.4、Redis 7、MinIO、Testcontainers、Playwright、`apps/gallery-admin/DESIGN.md`
>
> **基线:** P1-01/02/04、P0-01~04 已完成；设计权威见 `apps/gallery-admin/PRODUCT.md`、`DESIGN.md`

## Global Constraints

- 提交作者：`creatawork` / `113406486+creatawork@users.noreply.github.com`；commit message 禁止 AI trailer。
- Admin 新 UI 遵循 `DESIGN.md`：CSS 变量、Plus Jakarta Sans、功能文字 ≥ 12px。
- 软删除：「删除照片」= 从展厅移除、不可撤销；V1 不做恢复/永久清理 UI。
- 「精选」= **封面 `cover`**，不新增 `featured`。
- 分享 rawToken 仅在创建响应出现一次。
- **M7.5 只做回归，禁止新增功能或「顺手优化」。**

---

## V1 Ready 闭环（六段，顺序固定）

```text
① 整理照片      WP-6   P1-03  策展能力做完整
② 分享交付      WP-7   P1-05  链接 / 密码 / 下载权限（二维码可降级）
③ 用户自助      WP-9   P0-03  忘记密码 / 重置密码 Admin UI
④ 安全检查      SC     独立验证，不与其他 WP 混做
⑤ 可观测        WP-8   P0-05  指标 / 日志 / requestId / 恢复手册
⑥ 综合验收      M7.5   全链路回归，不新增功能
```

```text
WP-6 → WP-7 → WP-9 → Security Check → WP-8 → M7.5
```

| 阶段 | 工作包 | 产出物 | 阻塞关系 |
|------|--------|--------|----------|
| ① | **WP-6** | 筛选、批量删、标题、排序、重试、封面 | 分享前用户能整理完毕 |
| ② | **WP-7** | 分享面板、有效期、复制、密码、下载权限 | 用户能交付访客 |
| ③ | **WP-9** | 忘记/重置密码 UI | 真实用户可自助恢复账号 |
| ④ | **SC** | 安全矩阵证据 + 修复项 | V1 Ready 上线门槛 |
| ⑤ | **WP-8** | 指标、结构化日志、恢复手册 | 出问题可定位恢复 |
| ⑥ | **M7.5** | 回归报告 | V1 签字验收 |

---

## 当前缺口快照

| 领域 | 已有 | 缺口 |
|------|------|------|
| 策展 UI | `GalleryPhotoGrid.vue`（筛选/多选/批量删 emit）；单张删/封面 | **未接入**工作区；无标题、排序、批量重试 |
| 分享 UI | 基础模态：有效期、复制、撤销 | 无交付确认态、剩余时间、最近访问、密码/下载权限入口 |
| 用户自助 | Auth/Gallery 密码 API | Admin 无忘记/重置密码页 |
| 安全 | 单元/集成测试部分覆盖 | 无独立 IDOR/租户/Token/上传边界矩阵 |
| 可观测 | requestId、`DependencyHealthIndicator` | 无业务指标、无恢复手册 |
| 验收 | `testing-guide.md` 分散步骤 | 无 M7.5 一次性回归清单与证据 |

---

## WP-6：P1-03 照片记录与策展（① 整理照片）

**目标：** 策展能力 **一次做完整**，用户上传后能筛选、批量删、改标题、调顺序、重试失败、设封面，无需逐张重复操作。

**策略：** 接入已有 `GalleryPhotoGrid.vue`；批量删除前端 `Promise.allSettled` + 现有 `DELETE`；排序用 `PATCH sortOrder` + 上移/下移（**不做拖拽**）。

### Task 6.1：接入网格与状态筛选
- [ ] `GalleryWorkspaceView` 改用 `GalleryPhotoGrid`（保留 Dropzone）
- [ ] 列表视图与网格共享多选状态（或文档明确列表不支持多选）
- [ ] 筛选：`全部 | 已就绪 | 处理中 | 失败`；状态角标全中文
- [ ] 选中态使用 `var(--brand-accent)`

### Task 6.2：批量删除
- [ ] `useGalleryWorkspace.deletePhotos(ids[])`
- [ ] 浮动底栏 + `ConfirmModal`：「从展厅移除，不可撤销」
- [ ] 汇总成功/失败 toast；完成后 `reload()` + 清空选择

### Task 6.3：标题编辑
- [ ] `updatePhotoTitle` → `PATCH { title }`；Lightbox 内可编辑（Enter 保存）

### Task 6.4：排序
- [ ] `movePhoto(up|down)` 或 `reorderPhotos`；重赋 `0..n-1` sortOrder
- [ ] Lightbox/卡片菜单「前移 / 后移」

### Task 6.5：批量重试失败
- [ ] 筛选「失败」时底栏「重试失败项」→ `POST .../tasks/{id}/retry`
- [ ] 无 taskId 时明确 toast

### Task 6.6：封面（回归 + 曝光）
- [ ] 确认设封面后总览缩略图、发布预览顺序正确（已有 API，补验收步骤）

### Task 6.7：契约与文档
- [ ] `gallery-contracts`：`UpdatePhotoRequest`
- [ ] `testing-guide.md` 策展步骤；`next-tasks.md` P1-03 标完成

**WP-6 出口标准**
- [ ] 5 张上传 → 筛选/删/排序/标题/封面/重试全通过且刷新后一致
- [ ] 无英文状态泄漏；符合 `DESIGN.md`

---

## WP-7：P1-05 分享交付体验（② 分享交付）

**目标：** 用户理解「访客如何进入、链接多久有效、能否下载」，并完成复制与撤销。**二维码为 P2 增强，V1 可降级或省略。**

### Task 7.1：分享面板（必做）
- [ ] `ShareDeliveryPanel.vue` + `useShareDelivery.ts`
- [ ] 区块：访问方式（公开/私密/密码）→ 创建链接（7/30/90/永久）→ **交付确认态**（链接已创建 + 剩余时间 + 复制）
- [ ] 已有链接列表：状态、创建时间、**最近访问**、撤销

### Task 7.2：剩余时间与最近访问（必做）
- [ ] `ShareLink` 契约对齐 API（含 `lastAccessedAt`）
- [ ] `formatRemaining`；「尚未访问」文案

### Task 7.3：Gallery 密码（必做）
- [ ] `PUT/DELETE .../password` 接入分享/发布相关面板（OWNER）
- [ ] PASSWORD 馆未设密码时引导设置；文案说明访客解锁流程

### Task 7.4：访客下载权限（必做）
- [ ] 配置 schema：`visitorAllowDownload: boolean`（默认 `false`）
- [ ] 分享面板只读展示 + 跳转配置；Viewer 按配置显隐下载（medium 质量）
- [ ] 服务端必要时校验下载 URL（防仅藏 UI）

### Task 7.5：二维码（**降级 / 可选**）
- [ ] **V1 Ready 不阻塞**；时间允许再做「显示二维码」
- [ ] 若省略：交付确认态仅保留复制 + 说明文案

### Task 7.6：文档
- [ ] `testing-guide.md` 分享矩阵；`next-tasks.md` P1-05 标完成

**WP-7 出口标准**
- [ ] PUBLIC 已发布：生成链接 → 复制 → 访客可访问
- [ ] 撤销后旧链接失效；PASSWORD + 下载开/关各验一条

---

## WP-9：P0-03 用户自助（③ 忘记/重置密码）

**目标：** 用户忘记密码可自助恢复，不依赖管理员或内部文档。

### Task 9.1：忘记密码
- [ ] 登录卡「忘记密码？」→ `POST /api/auth/forgot-password`
- [ ] 统一成功文案（不泄露邮箱是否存在）

### Task 9.2：重置密码
- [ ] 路由 `/reset-password?token=` → `POST /api/auth/reset-password`
- [ ] 成功后跳转登录

### Task 9.3：文档
- [ ] `testing-guide.md` 密码恢复步骤；`next-tasks.md` P0-03 Admin UI 标完成

**WP-9 出口标准**
- [ ] 本地/测试环境完成一次「忘记 → 邮件/日志 token → 重置 → 登录」

> **说明：** Gallery 密码设置 UI 在 **WP-7 Task 7.3** 交付；WP-9 仅负责 **账户级** 密码恢复。

---

## Security Check：独立安全检查（④ 安全）

**目标：** 在功能闭环后、可观测与 M7.5 前，**单独一轮**验证安全边界；发现问题 **先修复再进入 WP-8**。

**禁止：** 与安全改造混在同一功能 PR；禁止「顺便加权限」式扩散。

### 检查矩阵（须留证据：测试用例 / 手工记录 / 集成测试）

| 类别 | 验证点 | 建议位置 |
|------|--------|----------|
| **IDOR** | 用户 A 不能 `GET/PATCH/DELETE` 用户 B 的 gallery/photo/task/share-link | 集成测试 + 手工 |
| **租户隔离** | 所有写操作带 tenant 上下文；跨 tenant UUID 返回 404 非 403 泄露 | `WorkspaceAuthorizationPolicy` 测试 |
| **分享 Token** | 撤销/过期 token 不可访问；rawToken 不出现在列表/日志；PRIVATE 无 token 404 | `PublicAccessFacadeTest` 扩展 |
| **预览 Token** | 无 preview 时 DRAFT 404；ARCHIVED 恒 404；令牌不写入公开 URL | 已有用例回归 |
| **密码** | Gallery 密码 BCrypt；重置 token 单次+TTL；错误次数不泄露存在性 | `AuthFacadeTest` 回归 |
| **文件上传** | 类型/大小/尺寸限制；路径不可遍历；非图片拒绝 | `PhotoFacade` + 413 用例 |
| **会话** | 登出后 cookie 失效；prod Secure cookie | `SecurityConfig` + 配置审查 |
| **限流** | 登录/解锁限流生效 | `RedisRateLimiterTest` 回归 |

### 交付物
- [ ] Create: `docs/security-verification-v1.md`（矩阵 + 结果 + 未修复项）
- [ ] 失败项必须修完或记入 **V1 已知限制**（需产品确认）；不得无声带过
- [ ] 修复 PR 独立合并，更新相关测试

**SC 出口标准**
- [ ] 矩阵全绿或已知限制已书面确认
- [ ] 无 P0/P1 开放安全缺陷

---

## WP-8：P0-05 可观测性（⑤ 可观测）

**目标：** 上线后能发现异常；运维能用 **requestId → 日志 → 任务/对象** 排障；有恢复手册。

> **顺序原因：** 放在 Security Check **之后**，避免为赶进度跳过安全；指标设计可参照 SC 发现的高风险路径。

### Task 8.1：业务指标（Micrometer）
- [ ] `gallery.upload.accepted` / `rejected`
- [ ] `gallery.task.failed` / `gallery.task.queue.depth`
- [ ] `gallery.storage.put.error`
- [ ] `gallery.public.access`（按 slug 标签，注意基数）

### Task 8.2：结构化日志 + requestId
- [ ] 上传/任务/公开访问关键路径：`requestId`、`taskId`、`photoId`、`galleryId`
- [ ] 禁止：密码、rawToken、完整分享 URL 入日志

### Task 8.3：恢复手册
- [ ] Create: `docs/operations-recovery.md`
- [ ] 章节：上传失败、队列积压、孤儿对象、备份恢复、部署回滚
- [ ] 附演练记录表（至少一次填写的证据）

### Task 8.4：文档
- [ ] `next-tasks.md` P0-05 标完成；`testing-guide.md` 引用 requestId 排障步骤

**WP-8 出口标准**
- [ ] 人为制造一次失败上传，用 requestId 在日志中定位任务
- [ ] metrics 可读；手册可独立执行一次排障

---

## M7.5：综合验收（⑥ 回归 only）

**目标：** 全链路一次性回归，**不新增任何功能**；产出 V1 Ready 签字证据。

### 范围（创作者 + 访客）

```text
注册/登录 → 忘记密码(若已部署邮件) → 创建相册 → 上传 → 策展(WP-6)
→ 配置(可选最小) → 预览 → 发布 → 分享(WP-7) → 访客访问/解锁/下载
→ 撤销链接 → 撤回发布 → 成员权限抽测(OWNER/EDITOR/VIEWER)
```

### 交付物
- [ ] Update: `docs/m7-testing-results.md` 或新建 `docs/v1-ready-signoff.md`
- [ ] 含：环境、日期、执行人、通过/失败项、截图或日志引用
- [ ] Playwright smoke + 手工矩阵合并为一份清单
- [ ] 移动端/窄屏抽测（非全矩阵，记录已知限制）

### 禁止项
- ❌ 新 API、新 UI 功能、新配置项
- ❌ P1-06 WebGL、P2 Meta/CDN、拖拽排序、二维码（若 WP-7 未做）
- ❌ 「顺手」重构或设计大改

**M7.5 出口标准 = V1 Ready**
- [ ] 上表主路径全绿
- [ ] SC 矩阵无开放 P0/P1
- [ ] WP-8 手册与 requestId 排障演练有记录
- [ ] `personal-album-v1-plan.md` 上线检查表关键项可勾选

---

## 横切（随 WP-6/7/9 顺带，不单独排期）

- [ ] 新 UI 使用 `styles.css` CSS 变量（见 `DESIGN.md`）
- [ ] `LightboxModal` 字体统一 Jakarta
- [ ] 错误文案中文、含 requestId（API 已有则前端展示）

---

## 明确移出 V1 Ready 路径

| 项 | 处置 |
|----|------|
| P1-06~08 Viewer 性能 | V1 后独立里程碑 |
| P2 社交 Meta / CDN / 媒体缓存 | V1 后 |
| 拖拽排序 | V1 用上移/下移 |
| 单张照片分享 | V1 后 |
| 二维码 | WP-7 可选，不阻塞 Ready |
| 照片软删除恢复 UI | V1 不做 |
| CI 自动 `push` 触发 | 等生产域名 |
| 新功能 / 新配置面 | **M7.5 前一律拒绝** |

---

## 参考文件索引

| 领域 | 路径 |
|------|------|
| 设计权威 | `apps/gallery-admin/DESIGN.md` |
| 照片网格 | `apps/gallery-admin/src/components/gallery-workspace/GalleryPhotoGrid.vue` |
| 工作区 | `apps/gallery-admin/src/views/GalleryWorkspaceView.vue` |
| 分享 API | `apps/gallery-api/.../ShareLinkController.java` |
| 密码 API | `.../AuthController.java`、`GalleryController.java` |
| 公开访问 | `.../PublicAccessFacade.java` |
| 任务清单 | `docs/personal-album-v1-next-tasks.md` |
| 验收 | `docs/testing-guide.md` |

---

## 合并检查单（每 WP / SC）

1. 仅做本 WP 范围；不夹带新功能。
2. `npm run verify` + 相关 `mvn test` 绿。
3. 更新 `testing-guide.md`、`personal-album-v1-next-tasks.md`。
4. 符合 `DESIGN.md`；用户可见错误可恢复。
5. 不提交 `dist/`、critique 临时文件。

---

*文档版本：2026-09-10 rev.2 · V1 Ready 固定顺序：WP-6 → WP-7 → WP-9 → SC → WP-8 → M7.5*
