# VIE Gallery 文档导航

本目录是 VIE Gallery 项目的文档中心，提供产品规划、技术设计、测试验收和运维手册的完整索引。

---

## 📌 快速导航

### 🚀 当前开发（优先阅读）

| 文档 | 说明 | 状态 |
|------|------|------|
| **[v1-post-one-month-roadmap.md](v1-post-one-month-roadmap.md)** | **V1 后一个月任务路线图**（2026-09-17 至 2026-10-17） | ✅ 执行中 |
| [testing-guide.md](testing-guide.md) | 测试和验收指南 | ✅ 有效 |
| [operations-recovery.md](operations-recovery.md) | 运维恢复手册 | ✅ 有效 |

### ✅ V1 验收基线

| 文档 | 说明 | 日期 |
|------|------|------|
| [v1-ready-signoff.md](v1-ready-signoff.md) | V1 Ready 综合验收报告 | 2026-09-12 |
| [v1-closeout-execution-tasks.md](v1-closeout-execution-tasks.md) | V1 收口执行任务清单 | 已完成 |
| [security-verification-v1.md](security-verification-v1.md) | V1 安全验证记录 | 2026-09-12 |
| [m7-testing-results.md](m7-testing-results.md) | M7 测试证据 | 2026-09-08 |

### 📋 规划与参考

| 文档 | 说明 | 状态 |
|------|------|------|
| [personal-album-v1-plan.md](personal-album-v1-plan.md) | 个人相册 V1 产品与工程总规划 | ✅ 已完成 |
| [personal-album-v1-next-tasks.md](personal-album-v1-next-tasks.md) | V1 后长期任务清单（参考） | 📖 参考 |

### 🎯 专项设计（Superpowers）

| 文档 | 说明 |
|------|------|
| [superpowers/plans/2026-09-10-personal-album-v1-phase-3-implementation.md](superpowers/plans/2026-09-10-personal-album-v1-phase-3-implementation.md) | V1 Phase 3 实施计划 |
| [superpowers/specs/2026-09-08-admin-login-immersive-design.md](superpowers/specs/2026-09-08-admin-login-immersive-design.md) | Admin 登录沉浸式设计 |
| [superpowers/specs/2026-09-09-config-live-preview-design.md](superpowers/specs/2026-09-09-config-live-preview-design.md) | 配置实时预览设计 |

### 📦 历史归档

| 文档 | 说明 |
|------|------|
| [archive/README.md](archive/README.md) | 历史文档归档说明 |
| archive/reconstruction-plan.md | 初始重构方案 |
| archive/m1-*, m3-* | 历史里程碑记录 |
| archive/BUGFIX-*.md | 故障分析记录 |

---

## 📖 文档使用指南

### 如何开始新的开发任务？

1. **查看当前路线图**：[v1-post-one-month-roadmap.md](v1-post-one-month-roadmap.md)
2. **了解测试要求**：[testing-guide.md](testing-guide.md)
3. **遇到问题查看**：[operations-recovery.md](operations-recovery.md)

### 如何了解产品背景？

1. **产品规划**：[personal-album-v1-plan.md](personal-album-v1-plan.md)
2. **验收标准**：[v1-ready-signoff.md](v1-ready-signoff.md)
3. **长期任务**：[personal-album-v1-next-tasks.md](personal-album-v1-next-tasks.md)

### 如何查找历史决策？

1. **查看归档目录**：[archive/README.md](archive/README.md)
2. **M1/M3 历史**：`archive/m1-*`、`archive/m3-*`
3. **故障记录**：`archive/BUGFIX-*.md`

---

## 🔄 文档更新规范

### 文档生命周期

1. **活跃文档**（根目录）：当前有效的规划、验收和运维文档
2. **参考文档**（根目录）：已完成但仍有参考价值的规划文档
3. **归档文档**（archive/）：历史阶段、过时设计、一次性验收记录

### 更新频率

- **路线图文档**：每周更新进度
- **测试指南**：功能变更时更新
- **运维手册**：发现新问题时更新
- **验收报告**：里程碑完成时创建，不再修改

### 文档归档标准

满足以下条件之一的文档应归档到 `archive/`：

- ✅ 已完成的里程碑设计文档（如 `p0-02-consistency-design.md`）
- ✅ 已完成的阶段验收记录（如 `p1-06-acceptance.md`）
- ✅ 历史重构方案和故障分析
- ✅ 一次性的实施计划（phase 1/2/3）

不应归档的文档：

- ❌ 当前执行的路线图
- ❌ 持续维护的运维手册
- ❌ 当前有效的测试指南
- ❌ 最终验收报告（如 `v1-ready-signoff.md`）

---

## 📚 文档模板

### 规划文档模板

```markdown
# [功能/阶段] 规划

> **文档定位**：...
> **规划日期**：YYYY-MM-DD
> **执行周期**：开始日期 至 结束日期
> **目标**：...

## 总体目标
## 任务清单
## 交付标准
## 验收方式
```

### 验收文档模板

```markdown
# [功能/阶段] 验收报告

> **验收日期**：YYYY-MM-DD
> **执行人**：...
> **环境**：...
> **验收基准**：...
> **最终结论**：✅ PASS / ❌ FAIL

## 验收清单
## 证据记录
## 已知限制
## 签署结论
```

---

## 🔗 相关资源

- 项目入口：[../README.md](../README.md)
- 贡献指南：[../CONTRIBUTING.md](../CONTRIBUTING.md)
- 代码仓库：位于项目根目录的 `apps/`、`packages/`、`infra/`

---

**文档维护者**：项目团队  
**最后更新**：2026-09-17  
**下次审查**：2026-10-17
