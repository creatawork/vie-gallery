# M7 开发文档索引

> 本索引汇总 M7 阶段所有文档，方便快速查找。

---

## 📚 文档列表

### 1. 核心规划文档

| 文档 | 用途 | 读者 | 链接 |
|------|------|------|------|
| [M7 实施计划](./next-slice-m7-implementation-plan.md) | 完整技术设计、API 契约、数据库设计 | 开发工程师 | [打开](./next-slice-m7-implementation-plan.md) |
| [执行摘要](./m7-executive-summary.md) | 管理层摘要、目标与 KPI | 产品经理/管理者 | [打开](./m7-executive-summary.md) |
| [快速启动](./m7-quickstart.md) | 开发环境准备、开发顺序、调试技巧 | 新加入开发者 | [打开](./m7-quickstart.md) |

### 2. 参考文档

| 文档 | 用途 | 链接 |
|------|------|------|
| [测试指南](./testing-guide.md) | M7 验收标准、测试矩阵 | [打开](./testing-guide.md) |
| [原始规划](./next-slice-m7-viewer-config-and-performance.md) | 初期规划（历史参考） | [打开](./next-slice-m7-viewer-config-and-performance.md) |
| [产品路线图](./open-gallery-product-roadmap.md) | 整体产品路线 | [打开](./open-gallery-product-roadmap.md) |

### 3. 代码与契约

| 文件类型 | 位置 | 说明 |
|----------|------|------|
| 数据库迁移 | `apps/gallery-api/gallery-api-boot/src/main/resources/db/migration/V9__m7_viewer_config_versions.sql` | 待创建 |
| 领域模型 | `apps/gallery-api/gallery-api-domain/src/main/java/cn/vie/vibe/gallery/domain/ViewerConfigVersion.java` | 待创建 |
| Repository | `apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/ViewerConfigVersionRepository.java` | 待创建 |
| Facade API | `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/GalleryViewerConfigFacade.java` | 待修改 |
| TextureProcessor | `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/TextureProcessor.java` | 待创建 |
| Admin UI | `apps/gallery-admin/src/views/ViewerConfigView.vue` | 待修改 |
| Viewer UI | `apps/gallery-viewer/src/App.vue` | 待修改 |
| Nginx 配置 | `infra/nginx/nginx.conf` | 待修改 |
| Meta 服务器 | `infra/meta-server/index.js` | 待创建 |

---

## 🎯 M7 阶段概览

### 目标
将 Viewer 从"功能可用"升级为"**配置可回溯、资源可分发、体验可降级、分享可传播**"。

### 子阶段

| 阶段 | 内容 | 优先级 | 周期 | 状态 |
|------|------|--------|------|------|
| M7.1 | 配置版本化（草稿/发布/回滚/schema 校验） | P0 | 2 周 | ✅ 代码完成，待运行态验收 |
| M7.2 | TEXTURE 阶段与资源分级（WebP/缩略图分级） | P1 | 1 周 | ✅ 代码完成，待 Docker/MinIO 验收 |
| M7.3 | 性能降级（LOD/自动降级/WebGL fallback） | P1 | 1 周 | ⏳ 待启动 |
| M7.4 | CDN 与社交预览（媒体子域/边缘 Meta） | P2 | 1 周 | ⏳ 待启动 |
| M7.5 | 综合验收与回归 | P0 | 2-3 天 | ⏳ 待启动 |

### KPI 目标

| 指标 | 当前 | M7 目标 |
|------|------|--------|
| 3D 加载时间（100 照片） | 8s | < 3s |
| 低端设备 FPS | 25 | > 40 |
| 内存使用（峰值） | 800MB | < 500MB |
| 首屏渲染时间 | 2s | < 1s |
| CDN 命中率 | 0% | > 80% |
| 社交分享预览成功率 | 30% | > 95% |

---

## 📋 实施里程碑

### Week 1-2: M7.1 配置版本化

- **Day 1-2**: 数据库迁移 V9
- **Day 3-4**: 领域模型 + Repository
- **Day 5-7**: Facade API（publish/rollback）
- **Day 8-10**: Admin 面板 UI
- **Day 11-14**: 集成测试

### Week 3: M7.2 TEXTURE + M7.3 性能优化

- **Day 15-17**: TEXTURE 阶段实现
- **Day 18-19**: 缩略图分级策略
- **Day 20-22**: LOD/自动降级/WebGL fallback
- **Day 23-26**: 移动端优化 + 测试

### Week 4: M7.4 CDN + M7.5 验收

- **Day 27-28**: 媒体子域 Nginx 配置
- **Day 29-31**: Meta 服务器实现
- **Day 32-33**: 全链路测试
- **Day 34-35**: 回归 + 文档

---

## 🔗 文档关系图

```
产品路线图
   ↓
开发生命周期
   ├─ M6.5（已完成）→ 基线
   ↓
M7 实施计划（本文档集）
   ├─ 执行摘要 → 管理层审批
   ├─ 快速启动 → 开发者上手
   └─ 实施计划 → 详细设计
        ├─ 数据库设计
        ├─ API 契约
        ├─ 前端方案
        └─ 测试指南 → 验收标准
```

---

## 🚀 快速导航

### 我是新加入 M7 开发的开发者

1. 阅读 [执行摘要](./m7-executive-summary.md) - 了解目标与范围
2. 阅读 [快速启动](./m7-quickstart.md) - 环境准备与开发顺序
3. 阅读 [实施计划](./next-slice-m7-implementation-plan.md) - 技术设计细节
4. 开始编码：`git checkout -b feat/m7-viewer-config-and-performance`

### 我是产品经理/管理者

1. 阅读 [执行摘要](./m7-executive-summary.md) - 目标、KPI、时间表
2. 阅读 [测试指南](./testing-guide.md) - 验收标准
3. 监控进度：查看 Git 提交与任务列表

### 我需要实现具体功能

| 功能 | 参考文档 |
|------|----------|
| 配置版本化数据库设计 | [实施计划 - 2.1](./next-slice-m7-implementation-plan.md#21-数据库迁移设计) |
| Facade API 实现 | [实施计划 - 2.3](./next-slice-m7-implementation-plan.md#23-facade 层 api 设计) |
| TEXTURE 阶段实现 | [实施计划 - 2.4](./next-slice-m7-implementation-plan.md#24-worker-texture 阶段实现) |
| Admin 配置面板 | [实施计划 - 2.5](./next-slice-m7-implementation-plan.md#25-前端 admin 配置面板调整) |
| Viewer 性能优化 | [实施计划 - 2.6](./next-slice-m7-implementation-plan.md#26-前端-viewer 性能优化) |
| CDN 与 Meta 服务器 | [实施计划 - 2.7](./next-slice-m7-implementation-plan.md#27-cdn 与社交预览方案) |

---

## 📝 文档更新记录

| 日期 | 版本 | 更新内容 | 作者 |
|------|------|----------|------|
| 2026-09-07 | v1.0 | 初始版本，创建完整文档集 | creatawork |

---

## 🔄 下一步行动

1. **M7.1 运行态验收**: 在 Docker/MySQL 环境执行 V1–V9 升级并验证发布/回滚 HTTP 流程
2. **浏览器验收**: 验证 Admin 保存草稿 → 发布 → 回滚，以及 VIEWER 只读权限
3. **补齐证据**: 记录迁移、API、浏览器验收结果后再将 M7.1 标记为完成
4. **启动 M7.2**: M7.1 证据闭环后实现 TEXTURE 阶段与资源分级

---

**状态**: M7.1 代码完成，待 Docker/Flyway 与浏览器运行态验收  
**最后更新**: 2026-09-07  
**维护者**: creatawork
