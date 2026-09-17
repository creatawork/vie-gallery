# 历史文档归档

本目录保存早期重构方案、M1/M3 实施记录、故障分析和已替代的阶段材料，仅用于回溯设计决策。归档内容不作为当前 API、端口、产品状态、测试命令或开发步骤的规范。

## 当前入口

新开发和验收只从以下文档开始：

- [`../../README.md`](../../README.md)：仓库入口与当前状态
- [`../personal-album-v1-plan.md`](../personal-album-v1-plan.md)：个人相册 V1 唯一产品与工程总规划
- [`../testing-guide.md`](../testing-guide.md)：当前运行、测试和上线验收入口
- [`../m7-testing-results.md`](../m7-testing-results.md)：M7 当前真实环境证据

历史文档中的旧 API、旧端口、旧文件路径和一次性环境记录不再维护；部分历史互链可能失效，不应据此恢复已删除的材料。

## 保留内容

### 架构与重构
- `reconstruction-plan.md`：初始重构方案和架构决策
- `next-slice-gallery-workspace-implementation.md`：Gallery 工作区切片的历史实施记录

### 里程碑记录
- `m1-*`、`m3-*`：历史里程碑演进记录
- `app-ui-*`：早期 UI 实施指南

### 故障与修复
- `BUGFIX-粒子系统切换问题.md`：粒子系统切换的根因与修复记录
- `BUGFIX-页面卡死问题.md`：EventBus 无限递归的根因与修复记录

### 设计与验收（2026-09-17 新增）
- `p0-02-consistency-design.md`：P0-02 上传/对象/任务/配额一致性设计（已完成实施）
- `p1-06-acceptance.md`：P1-06 Viewer WebGL 保底和设备策略验收记录（已完成）

---

**归档说明**：

- 旧测试清单、旧启动手册、一次性部署报告和旧 MCP 验收材料已由当前 `docs/testing-guide.md` 替代并删除，不再在归档目录维护。
- 已完成的阶段设计文档和验收记录在实施后归档，作为历史决策参考。
- 历史文档中的旧 API、旧端口、旧文件路径和一次性环境记录不再维护；部分历史互链可能失效，不应据此恢复已删除的材料。
