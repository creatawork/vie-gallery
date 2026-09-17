# M3 前端可配置架构实现进度

## 已完成 ✅

### 核心架构 (Phase 1)

#### 1. 类型系统 (`core/types.ts`)
- ✅ ViewerConfig - 完整的配置类型定义
- ✅ ViewerContext - 插件上下文接口
- ✅ ViewerPlugin - 插件接口规范
- ✅ ThemeColors - 主题色彩类型
- ✅ LayoutPosition - 布局位置类型
- ✅ PhotoMesh - 照片网格对象

#### 2. 事件系统 (`core/EventBus.ts`)
- ✅ on/off/emit - 基础事件订阅/发布
- ✅ once - 一次性事件监听
- ✅ clear - 清空所有事件
- ✅ listenerCount - 统计监听器数量
- ✅ 错误处理和隔离

#### 3. 插件管理器 (`core/PluginManager.ts`)
- ✅ register/registerAll - 插件注册
- ✅ install/installAll - 插件安装（支持依赖检查）
- ✅ uninstall/uninstallAll - 插件卸载
- ✅ 拓扑排序 - 自动处理插件依赖关系
- ✅ 生命周期管理 - UNINSTALLED/INSTALLING/INSTALLED/FAILED
- ✅ update - 统一更新循环
- ✅ onResize - 窗口调整通知

#### 4. 配置管理器 (`core/ConfigManager.ts`)
- ✅ 默认配置定义
- ✅ getConfig/updateConfig - 配置读写
- ✅ loadPreset - 加载预设配置
- ✅ importConfig/exportConfig - 配置导入导出
- ✅ autoAdjustForDevice - 设备性能自适应
- ✅ loadFromURL - URL 参数配置
- ✅ localStorage 持久化
- ✅ 深度合并和克隆

#### 5. 主引擎 (`core/ViewerEngine.ts`)
- ✅ Three.js 场景初始化
- ✅ 相机和渲染器管理
- ✅ 子系统集成（EventBus、PluginManager、ConfigManager）
- ✅ 照片数据管理
- ✅ 渲染循环 (start/stop/animate)
- ✅ 窗口调整响应
- ✅ 资源清理和销毁

### 布局系统 (Phase 2)

#### 1. 布局生成器 (`lib/layouts.ts`)
- ✅ sphereLayout - 球形/椭球布局（Fibonacci 投影）
- ✅ helixLayout - DNA 双螺旋布局
- ✅ gridLayout - 网格墙布局（响应式列数）
- ✅ spiralLayout - 银河旋臂布局
- ✅ randomLayout - 随机分散布局
- ✅ LAYOUT_GENERATORS - 统一接口映射

#### 2. 布局插件 (`plugins/LayoutPlugin.ts`)
- ✅ 布局切换管理
- ✅ GSAP 动画过渡
- ✅ 事件驱动架构 (layout:change → layout:applied)
- ✅ 参数化布局生成

### 视觉插件 (Phase 2)

#### 1. 渐变背景插件 (`plugins/GradientBackgroundPlugin.ts`)
- ✅ Shader 材质渐变
- ✅ 三种渐变方向（垂直/水平/径向）
- ✅ 主题色彩响应
- ✅ 性能优化（depthWrite: false）

#### 2. 点击涟漪插件 (`plugins/ClickRipplePlugin.ts`)
- ✅ 射线检测点击位置
- ✅ 动态涟漪生成
- ✅ GSAP 扩散动画
- ✅ 自动清理机制

## 架构特性

### 🎯 核心优势

1. **完全插件化**
   - 所有功能模块化为独立插件
   - 按需加载，减少初始包体积
   - 第三方可扩展

2. **配置驱动**
   - 单一配置对象控制所有行为
   - 预设系统快速切换风格
   - URL 参数分享配置
   - localStorage 持久化

3. **事件驱动**
   - 松耦合通信机制
   - 插件间无直接依赖
   - 易于调试和追踪

4. **性能优化**
   - 自动设备检测和降级
   - 移动端/桌面端差异化配置
   - 按需渲染和更新

5. **开发友好**
   - TypeScript 完整类型支持
   - 清晰的生命周期钩子
   - 统一的错误处理

### 📦 插件生态

已实现插件：
- ✅ LayoutPlugin - 布局管理
- ✅ GradientBackgroundPlugin - 渐变背景
- ✅ ClickRipplePlugin - 点击涟漪

待实现插件（可参考 vie-mei）：
- ⏳ SkyDomePlugin - 天空盒背景
- ⏳ StarDustPlugin - 星尘粒子
- ⏳ HeartParticlesPlugin - 心形粒子
- ⏳ SakuraPlugin - 樱花飘落
- ⏳ BloomPlugin - 辉光后处理
- ⏳ FogPlugin - 雾效
- ⏳ GodRaysPlugin - 体积光
- ⏳ CursorTrailPlugin - 光标拖尾
- ⏳ MagneticFieldPlugin - 磁场效果
- ⏳ ConstellationPlugin - 星座连线
- ⏳ TimeBasedThemePlugin - 时序主题
- ⏳ AudioManagerPlugin - 音频系统

### 🎨 使用示例

```typescript
import { ViewerEngine } from '@/core/ViewerEngine'
import { LayoutPlugin } from '@/plugins/LayoutPlugin'
import { GradientBackgroundPlugin } from '@/plugins/GradientBackgroundPlugin'
import { ClickRipplePlugin } from '@/plugins/ClickRipplePlugin'

// 创建引擎
const canvas = document.getElementById('viewer-canvas')
const engine = new ViewerEngine(canvas, {
  quality: 'auto',
  layout: { mode: 'sphere' },
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#F7F5F1', '#E7E3DA'],
      direction: 'vertical'
    }
  },
  interaction: {
    clickRipple: true
  }
})

// 注册插件
const pluginManager = engine.getPluginManager()
pluginManager.registerAll([
  new LayoutPlugin(),
  new GradientBackgroundPlugin(),
  new ClickRipplePlugin()
])

// 初始化
await engine.init()

// 安装插件
await pluginManager.installAll([
  'layout-manager',
  'gradient-background',
  'click-ripple'
])

// 设置照片
engine.setPhotos(photoMeshes)

// 启动渲染
engine.start()

// 运行时切换布局
engine.getEventBus().emit('layout:change', 'grid')

// 加载预设
await engine.getConfigManager().loadPreset('forest-dream')
```

### 🔧 配置系统使用

```typescript
// 导出当前配置
const json = configManager.exportConfig()
localStorage.setItem('my-config', json)

// 导入配置
const saved = localStorage.getItem('my-config')
if (saved) {
  configManager.importConfig(saved)
}

// 更新部分配置
configManager.updateConfig({
  particles: {
    enabled: true,
    types: ['stars', 'sakura']
  }
})

// 加载 URL 配置
// https://gallery.com/g/demo?layout=grid&particles=stars,hearts
const urlConfig = configManager.loadFromURL()
if (urlConfig) {
  configManager.updateConfig(urlConfig)
}
```

### 🔌 创建自定义插件

```typescript
import type { ViewerPlugin, ViewerContext } from '@/core/types'

export class MyCustomPlugin implements ViewerPlugin {
  name = 'my-custom-effect'
  version = '1.0.0'
  dependencies = ['layout-manager'] // 可选依赖

  private context: ViewerContext | null = null

  install(context: ViewerContext): void {
    this.context = context

    // 订阅事件
    context.on('photo:click', (data) => {
      console.log('Photo clicked:', data)
    })

    // 添加对象到场景
    const mesh = this.createCustomMesh()
    context.addToScene(mesh)
  }

  uninstall(): void {
    // 清理资源
  }

  update(delta: number, elapsed: number): void {
    // 每帧更新
  }

  onResize(width: number, height: number): void {
    // 响应窗口调整
  }

  private createCustomMesh() {
    // 创建自定义网格
  }
}
```

## 与 vie-mei 的对比

### vie-mei 的优势
- ✅ 完整的视觉特效库（粒子、后处理、交互）
- ✅ 成熟的时序主题引擎（昼夜变化）
- ✅ 丰富的音频系统（BGM、SFX）
- ✅ 精美的视觉设计

### vie-gallery 新架构的优势
- ✅ **完全插件化**：vie-mei 是单体应用，新架构模块化
- ✅ **用户可配置**：vie-mei 硬编码，新架构配置驱动
- ✅ **可扩展性**：第三方可开发插件
- ✅ **预设系统**：一键切换风格
- ✅ **更好的性能控制**：细粒度的降级策略

### 迁移策略

可以将 vie-mei 的特效逐个封装为插件：

1. `SkyDome` → `SkyDomePlugin`
2. `StarDust + HeartParticles` → `ParticlesPlugin`
3. `ThemeEngine` → `TimeBasedThemePlugin`
4. `AudioManager` → `AudioPlugin`
5. `CursorTrail + MagneticField` → 独立交互插件

## 下一步计划

### Phase 3: 高级特效插件
1. 从 vie-mei 迁移天空盒系统
2. 从 vie-mei 迁移粒子系统
3. 从 vie-mei 迁移后处理系统（Bloom、Fog、God Rays）
4. 从 vie-mei 迁移时序主题引擎

### Phase 4: UI 和工具
1. 创建配置面板组件（Vue）
2. 创建预设选择器
3. 创建插件市场界面
4. 编写文档和示例

### Phase 5: 集成和测试
1. 集成到 App.vue
2. 与后端 API 对接
3. 编写单元测试
4. 性能测试和优化

## 技术栈

- **核心**: Three.js + TypeScript
- **动画**: GSAP
- **状态**: Vue 3 Composition API
- **构建**: Vite
- **类型**: 完整的 TypeScript 类型定义

## 总结

当前已完成**核心架构层**的实现，这是整个可配置前端系统的基础：

- ✅ 插件系统完整实现（注册、安装、卸载、依赖管理）
- ✅ 配置系统完整实现（读写、预设、导入导出、持久化）
- ✅ 事件系统完整实现（订阅发布、错误隔离）
- ✅ 主引擎完整实现（Three.js 集成、渲染循环、资源管理）
- ✅ 布局系统完整实现（5 种布局 + 插件）
- ✅ 示例插件实现（渐变背景、点击涟漪）

这个架构可以无缝集成 vie-mei 的所有特效，同时提供了：
- 用户配置能力
- 预设系统
- 第三方扩展能力
- 更好的性能控制

**状态**: 核心架构已完成，可以开始迁移 vie-mei 的特效插件，或先集成到主应用进行测试。
