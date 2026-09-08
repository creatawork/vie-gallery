# M7 开发计划 - 执行摘要

> **阶段**: M7: Viewer 配置版本化与性能优化  
> **周期**: 3-4 周（2026-09-08 开始）  
> **优先级**: P0（发布前核心功能）  
> **文档**: [详细实施计划](./next-slice-m7-implementation-plan.md)

---

## 一、为什么是 M7？

M3.5-M6.5 已经实现了核心功能闭环：**上传、发布、协作、任务系统、生产化加固**。但面向访客的 Viewer 体验仍有明显短板：

- ❌ **配置误操作无法回滚** → 创作者不敢改配置
- ❌ **3D 渲染卡顿** → 大量照片时低端设备崩溃
- ❌ **前端宣称生成纹理但后端未实现** → 功能不一致
- ❌ **社交分享无爬虫友好预览** → 微信/Telegram 卡片为空
- ❌ **资源直连对象存储** → 无 CDN，流量压力大

M7 目标：将 Viewer 从"功能可用"升级为"**配置可回溯、资源可分发、体验可降级、分享可传播**"。

---

## 二、M7 做什么？（5 个子阶段）

### 📦 M7.1 配置版本化（2 周，P0）

**问题**: `GalleryViewerConfig` 覆盖式保存，误操作无法回滚。

**方案**:
- ✅ 草稿/发布分离（DRAFT 行 + 版本历史表）
- ✅ 发布按钮：创建新版本快照并生效
- ✅ 回滚功能：基于历史版本创建新发布版
- ✅ schema_version 校验：防止跨版本不兼容发布
- ✅ Admin 面板：保存草稿、发布确认、版本历史列表

**交付**:
- V9 数据库迁移（`gallery_viewer_config_version` 表）
- `publishConfig()` / `rollbackToVersion()` Facade API
- Admin 配置面板 UI 重构

**验收**:
- [ ] 发布后公开端立即生效
- [ ] 回滚后内容恢复，历史不丢失
- [ ] 旧 schema_version 发布失败
- [ ] VIEWER 角色 403 不可写

---

### 🖼️ M7.2 TEXTURE 阶段与资源分级（1 周，P1）

**问题**: 前端宣称"生成 3D 纹理"，但 Worker 仅有 VALIDATE/THUMBNAIL/FINALIZE。

**方案**:
- ✅ Worker 新增 TEXTURE 阶段（60% 进度）
- ✅ `TextureProcessor` 生成 WebP 纹理（2048px max，有损 0.8）
- ✅ 缩略图分级：medium（640px）/ high（1600px）/ texture（2048px）
- ✅ 仅 3D 模式相册生成纹理（节省存储）

**交付**:
- `TextureProcessor` 接口与 `ImageIoTextureProcessor` 实现
- Worker TEXTURE 阶段集成代码
- 前端文案对齐（"正在生成 3D 纹理"真实落地）

**验收**:
- [ ] 3D Gallery 上传后生成 WebP 纹理
- [ ] 2D Gallery 不生成纹理
- [ ] 进度条 60% 显示 TEXTURE 阶段
- [ ] MinIO 存在 `/{photoId}/texture` 文件

---

### ⚡ M7.3 性能降级与自适应（1 周，P1）

**问题**: 100+ 照片时一次性加载全部纹理，低端设备卡顿，无自动降级。

**方案**:
- ✅ 设备能力探测（DeviceMemory / 硬件核心/DPR/移动端）
- ✅ LOD 纹理切换（远处 medium / 近处 texture）
- ✅ 视野内懒加载（进入 viewport 异步加载）
- ✅ FPS 自动降级（FPS<40 持续 10 秒 → 关闭 particles → bloom → fog → DPR）
- ✅ WebGL 不可用自动切 2D 网格 + Toast 提示
- ✅ 移动端触控优化（单指旋转/双指缩放）

**交付**:
- `detectDeviceCapabilities()` 前端工具函数
- `updateTextureLOD()` 距离换图逻辑
- FPS 监控与降级策略引擎
- WebGL 检测与 2D fallback

**验收**:
- [ ] 低端设备启动自动降级
- [ ] 相机距离切换纹理无闪烁
- [ ] 低 FPS 持续后自动降级
- [ ] 禁用 WebGL 自动切 2D 并提示
- [ ] 移动端触控流畅

---

### 🌐 M7.4 CDN 与社交预览（1 周，P2）

**问题**: 资源直连 MinIO 签名 URL，无 CDN 缓存；社交分享爬虫拿不到正确 Meta。

**方案**:
- ✅ 媒体子域 `media.vie-vibe.cn` + Nginx 配置
- ✅ 对象 key 版本化（`/{photoId}-{hash}.webp`），缓存自然失效
- ✅ 签名 URL TTL 缩短（1 小时），配合 CDN 长缓存
- ✅ 边缘 Meta 服务器（Node.js/Express）：
  - UA 识别爬虫（微信/Telegram/百度/Facebook）
  - 返回静态 HTML 带完整 og/twitter meta
  - 私有/密码相册 noindex，无 token 泄漏
- ✅ 静态壳仅<title/description/cover>，SPA 仍走前端路由

**交付**:
- Nginx `media` 站点配置
- Meta 服务器 `index.js`
- CDN 缓存策略文档
- 私有相册 noindex 逻辑

**验收**:
- [ ] 微信分享拿到正确卡片
- [ ] CDN 命中率 > 80%
- [ ] 私有相册返回 noindex
- [ ] 签名 URL TTL < 1 小时

---

### ✅ M7.5 综合验收与回归（2-3 天，P0）

**方案**:
- ✅ Docker Compose 全服务启动
- ✅ CLI 测试流程（注册 → 上传 → 配置 → 发布）
- ✅ 浏览器 MCP 验证（OWNER/EDITOR/VIEWER 权限）
- ✅ M4（发布/SEO）/ M5（授权）/ M6（任务）回归测试
- ✅ 移动端模拟测试（Chrome DevTools）
- ✅ 社交调试器检查（微信公众平台/Telegram Debugger）

**验收**:
- [ ] 全链路测试通过
- [ ] M4/M5/M6 回归无回归
- [ ] 移动端兼容性通过
- [ ] 社交分享预览成功率 > 95%

---

## 三、实施顺序与时间表

```
Week 1-2: M7.1 配置版本化
  ├─ Day 1-2: V9 数据库迁移
  ├─ Day 3-4: 领域模型 + Repository
  ├─ Day 5-7: Facade API（publish/rollback）
  ├─ Day 8-10: Admin 面板 UI
  └─ Day 11-14: 集成测试

Week 3: M7.2 TEXTURE + M7.3 性能优化
  ├─ Day 15-17: TEXTURE 阶段实现
  ├─ Day 18-19: 缩略图分级策略
  ├─ Day 20-22: LOD/自动降级/WebGL fallback
  └─ Day 23-26: 移动端优化 + 测试

Week 4: M7.4 CDN + M7.5 验收
  ├─ Day 27-28: 媒体子域 Nginx 配置
  ├─ Day 29-31: Meta 服务器实现
  ├─ Day 32-33: 全链路测试
  └─ Day 34-35: 回归 + 文档
```

**总周期**: 35 天（约 5 周），含缓冲时间

---

## 四、关键风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| WebP 编码慢 | 纹理生成耗时 | 异步队列 + 限制并发 |
| 前端内存泄漏 | 大量纹理 OOM | LRU 缓存 + 视野外卸载 |
| 旧版本迁移失败 | 配置丢失 | 备份表 + 回滚脚本 |
| CDN 缓存失效 | 旧内容可见 | 版本化 key + purge 备用 |

---

## 五、交付物清单

### 代码
- [ ] `V9__m7_viewer_config_versions.sql`
- [ ] `ViewerConfigVersion.java` + Repository
- [ ] `GalleryViewerConfigFacade.publishConfig()` / `rollbackToVersion()`
- [ ] `TextureProcessor.java` + 实现
- [ ] `PhotoProcessingWorker.java` TEXTURE 集成
- [ ] `ViewerConfigView.vue` Admin 面板重构
- [ ] `App.vue` Viewer 性能优化
- [ ] `nginx.conf` 媒体子域
- [ ] `meta-server/index.js`

### 文档
- [ ] `next-slice-m7-implementation-plan.md`（详细）
- [ ] `docs/m7-api-changes.md`（API 变更）
- [ ] `docs/m7-db-migration-guide.md`（升级指南）
- [ ] `docs/m7-testing-results.md`（测试结果）
- [ ] `CHANGELOG.md`（阶段日志）

### 测试
- [ ] 后端单元测试覆盖率 > 85%
- [ ] Playwright E2E 脚本
- [ ] 性能基准报告（FPS/内存/加载时间）
- [ ] 移动端兼容性报告

---

## 六、KPI 目标

| 指标 | 当前 | M7 目标 |
|------|------|--------|
| 3D 加载时间（100 照片） | 8s | < 3s |
| 低端设备 FPS | 25 | > 40（降级后） |
| 内存使用（峰值） | 800MB | < 500MB |
| 首屏渲染时间 | 2s | < 1s |
| CDN 命中率 | 0% | > 80% |
| 社交分享预览成功率 | 30% | > 95% |

---

## 七、下一步行动

1. **M7.1 启动**（Day 1）: 创建 `V9__m7_viewer_config_versions.sql` 迁移脚本
2. **领域模型**（Day 2-3）: `ViewerConfigVersion` + Repository
3. **Facade API**（Day 4-6）: publish/rollback 方法
4. **Admin UI**（Day 7-9）: 保存草稿/发布/版本历史
5. **集成测试**（Day 10-12）: 前后端联调

---

**状态**: M7.1 代码完成，待 Docker/Flyway 与浏览器运行态验收  
**联系人**: creatawork  
**文档版本**: v1.1