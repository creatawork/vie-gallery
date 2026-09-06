# M3 配置面板 UI 实现完成

## 概述

已完成管理端配置面板 UI 的实现，相册所有者可以通过可视化界面配置展示效果。

---

## 已创建的组件

### 1. GalleryConfigPanel.vue (主配置面板)

**路径**: `apps/gallery-admin/src/views/GalleryConfigPanel.vue`

**功能**:
- 加载和保存相册配置
- 预设选择
- 布局设置
- 背景配置（渐变/天空盒）
- 粒子特效开关
- 后处理特效（辉光、雾效）
- 交互设置
- 音频设置
- 预览、重置、保存操作

**核心方法**:
```typescript
loadConfig()      // 从服务端加载配置
save()           // 保存配置到服务端
reset()          // 删除配置，恢复默认
preview()        // 打开新窗口预览效果
applyPreset()    // 应用预设配置
```

**API 调用**:
- `GET /api/galleries/{galleryId}/viewer-config` - 加载
- `PUT /api/galleries/{galleryId}/viewer-config` - 保存
- `DELETE /api/galleries/{galleryId}/viewer-config` - 删除

### 2. PresetSelector.vue (预设选择器)

**路径**: `apps/gallery-admin/src/components/PresetSelector.vue`

**功能**:
- 展示 6 种预设风格
- 视觉化预览（渐变色）
- 选中状态标识

**预设列表**:
1. 极简模式 - 干净清爽
2. 森林之梦 - 森林天空 + 樱花
3. 星空夜曲 - 星空 + 星尘
4. 海洋微风 - 海洋 + 雾效
5. 日落余晖 - 日落 + 辉光
6. 浪漫时光 - 粉色渐变 + 心形粒子

### 3. LayoutSettings.vue (布局设置)

**路径**: `apps/gallery-admin/src/components/LayoutSettings.vue`

**功能**:
- 5 种布局模式选择
- SVG 图标可视化
- 响应式网格布局

**布局选项**:
1. 球形 - Fibonacci 球面
2. 螺旋 - DNA 双螺旋
3. 网格 - 规则网格墙
4. 银河 - 旋臂布局
5. 随机 - 自由分散

---

## 预设配置文件

已创建 6 个预设 JSON 文件在 `apps/gallery-viewer/public/presets/`:

### 1. minimal.json (极简模式)
```json
{
  "layout": { "mode": "grid" },
  "background": { "type": "gradient" },
  "particles": { "enabled": false },
  "effects": { "bloom": { "enabled": false } }
}
```

### 2. forest-dream.json (森林之梦)
```json
{
  "layout": { "mode": "sphere" },
  "background": { "type": "sky", "sky": { "theme": "forest" } },
  "particles": { "enabled": true, "types": ["sakura"] },
  "effects": { "bloom": { "enabled": true } }
}
```

### 3. starry-night.json (星空夜曲)
```json
{
  "layout": { "mode": "sphere" },
  "background": { "type": "sky", "sky": { "theme": "starry" } },
  "particles": { "enabled": true, "types": ["stars"], "density": 1.5 },
  "effects": { "bloom": { "enabled": true, "strength": 0.8 } }
}
```

### 4. ocean-breeze.json (海洋微风)
```json
{
  "layout": { "mode": "helix" },
  "background": { "type": "sky", "sky": { "theme": "ocean" } },
  "effects": { "fog": { "enabled": true } }
}
```

### 5. sunset-glow.json (日落余晖)
```json
{
  "layout": { "mode": "spiral" },
  "background": { "type": "sky", "sky": { "theme": "sunset" } },
  "effects": { "bloom": { "enabled": true, "strength": 1.0 } }
}
```

### 6. romantic.json (浪漫时光)
```json
{
  "layout": { "mode": "sphere" },
  "background": { "type": "gradient", "colors": ["#ffecd2", "#fcb69f"] },
  "particles": { "enabled": true, "types": ["hearts"] }
}
```

---

## UI 设计特点

### 设计系统
- **色彩**: 沿用设计规范的柔和配色
  - 背景: `#F7F5F1`
  - 主色: `#3C5A78`
  - 文本: `#1E2227`
  - 边框: `#E7E3DA`

- **排版**: 清晰的层次结构
  - 标题: 2rem / 1.25rem
  - 正文: 1rem / 0.875rem

- **交互**: 平滑过渡和悬停效果
  - 卡片悬停上浮 2px
  - 0.2s 过渡动画
  - 选中状态 3px 边框

### 响应式布局
- 预设网格: `minmax(200px, 1fr)`
- 布局网格: `minmax(140px, 1fr)`
- 自适应列数

---

## 使用流程

### 管理员配置流程
1. 访问管理端 → 进入相册配置页面
2. 选择快速预设 或 手动调整配置
3. 点击"预览效果"查看实时效果
4. 点击"保存配置"提交到服务端
5. 访客访问时自动应用该配置

### 前端加载流程
1. 访客打开相册 `/g/{slug}`
2. `ViewerEngine.init(slug)` 自动调用 `loadFromServer(slug)`
3. 获取相册配置并应用
4. 如果没有配置，使用系统默认

---

## 集成步骤

### 1. 添加路由 (管理端)

```typescript
// apps/gallery-admin/src/router/index.ts
{
  path: '/galleries/:id/config',
  name: 'GalleryConfig',
  component: () => import('@/views/GalleryConfigPanel.vue'),
  meta: { requiresAuth: true }
}
```

### 2. 添加导航入口

在相册管理页面添加"配置展示效果"按钮：

```vue
<router-link :to="`/galleries/${gallery.id}/config`">
  <button>配置展示效果</button>
</router-link>
```

### 3. 确保 token 存储

配置面板使用 `localStorage.getItem('token')` 获取认证令牌。

---

## 配置选项说明

### 布局模式
- **sphere**: 照片排列在 Fibonacci 球面上
- **helix**: DNA 双螺旋结构
- **grid**: 规则的网格墙
- **spiral**: 银河旋臂效果
- **random**: 随机自由分散

### 背景类型
- **gradient**: 渐变背景（可配置颜色和方向）
- **sky**: 天空盒（森林/海洋/星空/日落）
- **image**: 自定义图片背景
- **none**: 透明背景

### 粒子类型
- **stars**: 星尘粒子
- **sakura**: 樱花飘落
- **hearts**: 心形粒子
- **snow**: 雪花效果

### 后处理特效
- **bloom**: 辉光效果（增强明亮区域）
- **fog**: 雾效（增加景深）

---

## 下一步

现在配置面板 UI 已完成，可以：

1. **集成到管理端** - 添加路由和导航
2. **测试端到端流程** - 配置 → 保存 → 访客查看
3. **迁移 vie-mei 插件** - 实现天空盒、粒子等插件
4. **优化 UI** - 添加更多配置选项和实时预览

---

**实现日期**: 2026-09-03  
**状态**: UI 完成 ✅ | 预设配置 ✅ | 路由集成 ⏳
