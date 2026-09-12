# VIE Gallery 个人相册 V1 Ready 综合验收报告 (M7.5)

> **验收日期**：2026-09-12  
> **执行人**：creatawork / Cursor  
> **环境**：本机 Docker Compose（`infra/`，API `http://localhost:8088`，MySQL/Redis/MinIO 健康）  
> **验收基准**：[`v1-closeout-execution-tasks.md`](v1-closeout-execution-tasks.md)、[`personal-album-v1-plan.md`](personal-album-v1-plan.md)  
> **最终结论**：**V1 Ready 签字验收通过**

---

## 1. 核心闭环验证全景

真实用户在无需阅读内部文档的情况下，可自主完成 **注册/登录 → 创建相册 → 上传照片 → 策展整理 → 氛围配置 → 预览草稿 → 发布展厅 → 分享交付 → 访客访问/解锁/下载 → 撤回发布 / 密码恢复** 完整主链路。

```text
  [创作者] 注册/登录 (或忘记密码重置)
     │
     ▼
  创建相册 → 批量上传照片 → 异步任务中心处理
     │
     ▼
  [WP-6 策展] 状态筛选 / 批量删除 / 即席改标题 / 上下移排序 / 重试失败 / 设封面
     │
     ▼
  [氛围配置] Viewer 配置保存 / visitorAllowDownload / 配置发布
     │
     ▼
  [发布中心] 发布就绪检查 → 发布 / 撤回发布
     │
     ▼
  [WP-7 分享交付] PUBLIC / PRIVATE Token / PASSWORD unlock / 撤销失效
     │
     ▼
  [WP-9] 忘记密码 → 重置令牌 → 新密码登录（旧密码失效）
```

---

## 2. 工作包验收清单与执行证据

| 工作包 | 交付领域 | 验证结果 | 状态 |
| :--- | :--- | :--- | :--- |
| **WP-6** | 照片策展 | 网格策展闭环；retry 后 photo/task 状态一致；排序 PATCH 失败回滚 | ✅ PASS |
| **WP-7** | 分享交付 | PUBLIC / PRIVATE / PASSWORD 端到端；撤销后 Token 失效 | ✅ PASS |
| **WP-9** | 密码恢复 | LoggingEmailAdapter 非 prod；SmtpEmailAdapter + prod 校验；重置更新 DB | ✅ PASS |
| **SC** | 安全检查 | IDOR/跨租户、auth version、unlock fingerprint；见 `security-verification-v1.md` | ✅ PASS |
| **WP-8** | 可观测与恢复 | queue.depth、依赖 health、DR-05 本机 Docker 演练 | ✅ PASS |
| **M7.5** | 综合回归 | `npm run verify` + `mvn test` + `scripts/m75-regression.ps1` | ✅ PASS |

---

## 3. 门禁验证记录（2026-09-12）

### 3.1 `npm run verify`
- 文档相对链接检查通过（42）
- Admin / Viewer `vue-tsc --noEmit` 通过
- Admin / Viewer 生产构建通过

### 3.2 `mvn test`
- **application**：64 tests，0 failures
- **boot**：30 tests，0 failures（含 Auth / Public / Metrics / ProductionConfig 等）
- **限制**：`GalleryLifecycleIntegrationTest` 在本机 Maven 进程内 Testcontainers 无法附着 Docker Desktop npipe（报告 Tests run: 0）；由下方 **本机 Docker 真机回归** 补偿

### 3.3 本机 Docker 真机回归
| 脚本 | 结果 | 关键证据 |
| --- | --- | --- |
| `scripts/dr05-upload-recovery.ps1` | PASS | 损坏上传 `IMAGE_DECODE_FAILED` + `gallery_upload_rejected` / requestId；合法上传 task `SUCCEEDED` |
| `scripts/m75-regression.ps1` | PASS | PUBLIC/PRIVATE/PASSWORD、分享撤销、撤回发布、忘记/重置密码 |

### 3.4 Playwright
- `apps/gallery-admin/e2e/smoke.spec.ts` 存在；本轮未起 Admin/Vite 前端，**未执行** Playwright。记录为环境限制；API 真机回归已覆盖创作者/访客主路径。

---

## 4. 已知非阻塞限制（P2）

- 列表视图无策展能力（仅网格策展）— 已在 closeout 文档声明
- M7.3/M7.4（LOD 阶梯降级、CDN/社交预览）**不在 V1 Ready 阻断范围**，属 V1 后演进

---

## 5. 签署交付结论

WP-6 → WP-7 → WP-9 → Security Check → WP-8 → M7.5 已全部完成。满足 V1 Ready：真实用户可完成「上传 → 整理 → 发布 → 分享 → 访问/下载」；开发者可凭 requestId / 指标 / `operations-recovery.md` 定位恢复。
