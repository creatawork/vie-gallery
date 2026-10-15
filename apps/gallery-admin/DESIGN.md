---
name: VIE Gallery 摄影作品工作台
description: 暖纸白、深炭与青绿，以作品和清晰操作为中心
colors:
  bg-app: "#f4f3ef"
  bg-surface: "#fffefa"
  text-primary: "#202824"
  text-secondary: "#626b65"
  text-tertiary: "#69716b"
  brand-accent: "#26735d"
  brand-deep: "#1c5948"
  border-strong: "#dedfd7"
---

# 设计方向

2026-10-15 用户授权重做项目整体体验，本文件记录已实现的新视觉系统，替代此前薄荷玻璃展亭风格。历史规格保留为背景资料。

管理端服务于创作者完成整理、布展和发布。暖白工作台保持安静，清晰的深炭文字承担层次，青绿用于主要操作、选中状态和成功反馈。照片是页面主要的色彩来源。

## 基础系统

- 颜色以 src/styles.css 的变量为准；状态色分别使用 success、warning、error、info 变量。
- 字体使用本地 Segoe UI / PingFang SC / Microsoft YaHei 与系统回退，无远程字体请求；正文 14px，辅助 12–13px，页面标题 28–36px。
- 控件圆角 6–8px，内容卡片 12px，弹窗 16px。常规面板使用细边框，浮层使用柔和阴影。
- 主按钮实色、白字；次要操作使用纸白细边框或透明底。悬停不改变工作区控件的位置。
- 表单使用可见标签，输入聚焦以边框与焦点环反馈。键盘焦点、文字选择和滚动条均采用同一色系。

## 页面与交互

- 登录在桌面采用摄影场景和表单双栏，移动端优先完整表单。注册、找回和重置延续相同的颜色与控件。
- 空间列表让封面领先，筛选、搜索、排序与创建保持清楚分组。无数据、筛选无结果、加载和错误各有独立状态。
- 工作区按作品、风格、发布组织。发布状态可见；失败能够刷新或重试；访问设置在草稿期也可进入。
- 配置使用独立编辑区和实时预览，窄屏顺序排列并保留可用高度。参数修改、保存与发布是明确不同的状态。
- 分享、删除、成员操作等弹窗管理焦点，支持 Esc 与归还焦点；忙碌期间阻止重复提交。
- 动效用于短暂的状态切换、加载和照片反馈。减少动效偏好关闭非必要动画。避免无限发光、抖动、旋转与全局 hover 位移。

## 实现入口

src/styles.css、src/styles/overview.css、src/styles/members.css、GalleryWorkspaceView.vue、GalleryConfigPanel.vue 及 gallery-workspace / gallery-config 组件。
