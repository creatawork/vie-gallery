# 视觉插件迁移完成报告

## 概述

已成功从 vie-mei 项目迁移核心视觉特效到 vie-gallery 的插件系统。所有特效均已封装为独立插件，支持按需加载和动态配置。

---

## 已迁移的插件

### 1. SkyDomePlugin - 天空盒背景

**源文件**: `vie-mei/static/js/sky-dome.js`  
**目标文件**: `apps/gallery-viewer/src/plugins/SkyDomePlugin.ts`

**功能**:
- 支持两种模式：渐变模式 / 全景模式
- 四种主题：forest（森林）、ocean（海洋）、starry（星空）、sunset（日落）
- 程序化生成占位全景图（多层树剪影 + 雾带）
- 天穹跟随相机移动
- 支持主题色调染色

**配置示例**:
```typescript
background: {
  type: 'sky',
  sky: {
    theme: 'forest',  // 'forest' | 'ocean' | 'starry' | 'sunset'
    timeOfDay: 'sunset'
  }
}
```

**技术特点**:
- Shader 驱动的渐变和全景混合
- equirectangular 映射
- 无缝循环的程序化森林生成
- 地平线雾效融合

---

### 2. ParticlesPlugin - 粒子系统

**源文件**: 
- `vie-mei/static/js/particles.js` (HeartParticles, StarDust)
- `vie-mei/static/js/effects/sakura-petals.js` (SakuraPetals)

**目标文件**: `apps/gallery-viewer/src/plugins/ParticlesPlugin.ts`

**功能**:
- **stars**: 星尘粒子（远景，配合 Bloom 发光）
- **sakura**: 樱花花瓣（下落 + 旋转动画）
- **hearts**: 心形粒子（上升 + 摆动）
- **snow**: 雪花（飘落 + 旋转）

**配置示例**:
```typescript
particles: {
  enabled: true,
  types: ['sakura', 'stars'],
  density: 1.0
}
```

**技术特点**:
- GPU 驱动的粒子系统（Shader 动画）
- 程序化生成粒子纹理（Canvas）
- 每帧只更新 uniform，CPU 零循环
- 垂直边界 wrap 循环
- 移动端自动降级粒子数量

**粒子系统对比**:

| 类型 | 数量（桌面） | 数量（移动） | 运动方向 | 特效 |
|------|------------|------------|---------|------|
| stars | 900 | 350 | 三轴缓慢漂移 | 四色调色板 |
| sakura | 90 | 40 | 下落 + 摆动 | 旋转 + 淡入淡出 |
| hearts | 180 | 80 | 上升 + 摆动 | 加法混合 |
| snow | 120 | 60 | 下落 + 摆动 | 旋转 + 淡入淡出 |

---

### 3. BloomPlugin - 辉光后处理

**源文件**: vie-mei 使用 three.js 内置 `UnrealBloomPass`  
**目标文件**: `apps/gallery-viewer/src/plugins/BloomPlugin.ts`

**功能**:
- UnrealBloomPass 辉光效果
- 可配置强度、半径、阈值
- 自动创建 EffectComposer 渲染管线

**配置示例**:
```typescript
effects: {
  bloom: {
    enabled: true,
    strength: 0.6,   // 辉光强度
    radius: 0.5,     // 辉光半径
    threshold: 0.2   // 亮度阈值
  }
}
```

**技术特点**:
- RenderPass → BloomPass → OutputPass 渲染管线
- 响应窗口调整自动更新分辨率
- 支持动态开关和参数调整

---

### 4. FogPlugin - 雾效

**源文件**: vie-mei 使用 three.js 内置 `FogExp2`  
**目标文件**: `apps/gallery-viewer/src/plugins/FogPlugin.ts`

**功能**:
- 指数雾效（距离越远越浓）
- 可配置颜色和密度
- 支持动态开关

**配置示例**:
```typescript
effects: {
  fog: {
    enabled: true,
    color: '#E7E3DA',
    density: 0.0008
  }
}
```

**技术特点**:
- 使用 Three.js 原生 FogExp2
- 轻量级，性能开销极小
- 与 SkyDome 的地平线雾色协调

---

## 插件架构

### 注册表系统

**文件**: `apps/gallery-viewer/src/plugins/index.ts`

支持按需懒加载：
```typescript
export const pluginRegistry = {
  SkyDome: () => import('./SkyDomePlugin').then(m => new m.SkyDomePlugin()),
  Particles: () => import('./ParticlesPlugin').then(m => new m.ParticlesPlugin()),
  Bloom: () => import('./BloomPlugin').then(m => new m.BloomPlugin()),
  Fog: () => import('./FogPlugin').then(m => new m.FogPlugin())
}
```

### 自动安装

**ViewerEngine** 根据配置自动安装插件：

```typescript
// 背景插件
if (config.background.type === 'sky') {
  pluginsToInstall.push('SkyDome')
}

// 粒子插件
if (config.particles?.enabled) {
  pluginsToInstall.push('Particles')
}

// 后处理特效
if (config.effects?.bloom?.enabled) {
  pluginsToInstall.push('Bloom')
}
```

---

## 使用方式

### 方式一：配置驱动（推荐）

```typescript
const engine = new ViewerEngine(canvas, {
  background: {
    type: 'sky',
    sky: { theme: 'forest' }
  },
  particles: {
    enabled: true,
    types: ['sakura', 'stars']
  },
  effects: {
    bloom: { enabled: true, strength: 0.8 },
    fog: { enabled: true, density: 0.001 }
  }
})

await engine.init('my-gallery-slug')
```

### 方式二：手动安装

```typescript
const engine = new ViewerEngine(canvas)
await engine.init()

const pm = engine.getPluginManager()
await pm.installAll(['SkyDome', 'Particles', 'Bloom'])
```

---

## 配置预设

已创建 6 个预设配置文件（`public/presets/*.json`）：

1. **minimal.json** - 极简模式（纯色背景）
2. **forest-dream.json** - 森林之梦（森林天空 + 樱花）
3. **starry-night.json** - 星空夜曲（星空 + 星尘）
4. **ocean-breeze.json** - 海洋微风（海洋天空 + 雾效）
5. **sunset-glow.json** - 日落余晖（日落天空 + 辉光）
6. **romantic.json** - 浪漫时光（粉色渐变 + 心形粒子）

---

## 性能优化

### 移动端自适应
- 粒子数量自动减半
- 降低像素比（1.0）
- 禁用抗锯齿

### GPU 驱动动画
- 粒子位置演化在 vertex shader 完成
- CPU 每帧只更新一个 `uTime` uniform
- 支持数百到上千粒子无卡顿

### 懒加载
- 插件按需加载（动态 import）
- 未使用的插件不会打包到初始 bundle

---

## 与 vie-mei 的差异

| 方面 | vie-mei | vie-gallery |
|------|---------|-------------|
| 架构 | 单体 JavaScript | 插件化 TypeScript |
| 加载 | 全部加载 | 按需懒加载 |
| 配置 | 硬编码 | 动态配置 + 预设 |
| 主题 | 手动切换 | 配置驱动 |
| 扩展性 | 需修改核心代码 | 新增插件即可 |

---

## 未迁移的特效（待续）

以下特效在 vie-mei 中存在，但尚未迁移：

1. **God Rays** - 体积光（需要遮挡贴图）
2. **Post Grade** - 暗角 + 颗粒 + 色散
3. **Constellation** - 星座连线
4. **Cursor Trail** - 鼠标轨迹
5. **Magnetic Field** - 磁场交互

这些可作为后续 M4/M5 阶段的增强功能。

---

## 下一步

现在核心视觉插件已迁移完成，可以：

1. **集成路由** - 将配置面板添加到管理端
2. **端到端测试** - 测试完整配置 → 保存 → 访客查看流程
3. **迁移剩余特效** - God Rays、Post Grade 等
4. **创建更多预设** - 节日主题、季节主题等

---

**实现日期**: 2026-09-03  
**状态**: 核心插件迁移完成 ✅ | 4 个插件 | 4 种粒子类型 | 4 种天空主题
