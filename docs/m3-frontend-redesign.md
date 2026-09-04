# M3 前端架构重新设计

## 设计目标

基于 vie-mei 项目的实现经验，重新设计一个**插件化、可配置**的前端架构，让用户可以自由组合：

- 🎨 **3D 背景**：天空盒、粒子系统、雾效、光束等
- ✨ **视觉特效**：bloom、后处理、镜头特效、过渡动画
- 📐 **布局模式**：球形、螺旋、网格、银河、随机等
- 🎵 **音频系统**：背景音乐、交互音效、随时间变化
- 🎭 **主题引擎**：时序主题（昼夜变化）、季节主题、自定义色彩

## 核心架构

### 1. 插件系统 (Plugin System)

```typescript
// 插件接口
interface ViewerPlugin {
  name: string
  version: string
  dependencies?: string[]
  
  // 生命周期
  install(context: ViewerContext): void
  uninstall(): void
  
  // 可选：配置界面
  getConfigPanel?(): HTMLElement
  
  // 可选：更新循环
  update?(delta: number, elapsed: number): void
}

// 插件上下文
interface ViewerContext {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  photos: PhotoMesh[]
  config: ViewerConfig
  
  // 事件系统
  on(event: string, handler: Function): void
  emit(event: string, data?: any): void
  
  // 资源管理
  addToScene(object: THREE.Object3D): void
  removeFromScene(object: THREE.Object3D): void
}
```

### 2. 配置系统 (Config System)

```typescript
// 相册配置
interface ViewerConfig {
  // 基础
  quality: 'low' | 'mid' | 'high' | 'auto'
  
  // 布局
  layout: {
    mode: 'sphere' | 'helix' | 'grid' | 'spiral' | 'random'
    params?: Record<string, any>
  }
  
  // 背景
  background: {
    type: 'sky' | 'gradient' | 'image' | 'none'
    sky?: {
      theme: 'forest' | 'ocean' | 'space' | 'sunset'
      timeOfDay?: 'auto' | number // 0-24 或 auto
    }
    gradient?: {
      colors: string[]
      direction: 'vertical' | 'horizontal' | 'radial'
    }
    image?: {
      url: string
      parallax?: boolean
    }
  }
  
  // 粒子系统
  particles: {
    enabled: boolean
    types: Array<'stars' | 'hearts' | 'sakura' | 'snow'>
    density?: number
  }
  
  // 特效
  effects: {
    bloom?: {
      enabled: boolean
      strength?: number
    }
    postGrade?: {
      enabled: boolean
      saturation?: number
      brightness?: number
    }
    fog?: {
      enabled: boolean
      density?: number
    }
    godRays?: {
      enabled: boolean
      source?: 'sun' | 'moon'
    }
  }
  
  // 交互特效
  interaction: {
    cursorTrail?: boolean
    clickRipple?: boolean
    magneticField?: boolean
    constellation?: boolean
  }
  
  // 音频
  audio: {
    bgm?: {
      enabled: boolean
      playlist?: string[]
      adaptive?: boolean // 随时间变化
    }
    sfx?: {
      enabled: boolean
    }
  }
  
  // 主题
  theme: {
    engine: 'time-based' | 'seasonal' | 'custom'
    timeBasedTheme?: {
      times: Array<{
        hour: number
        colors: ThemeColors
      }>
    }
    customColors?: ThemeColors
  }
}

interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  fog: string
}
```

### 3. 插件目录结构

```
apps/gallery-viewer/
├── src/
│   ├── core/                    # 核心系统
│   │   ├── ViewerEngine.ts     # 主引擎
│   │   ├── PluginManager.ts    # 插件管理器
│   │   ├── ConfigManager.ts    # 配置管理器
│   │   ├── EventBus.ts         # 事件总线
│   │   └── ResourceManager.ts  # 资源管理器
│   │
│   ├── plugins/                 # 内置插件
│   │   ├── backgrounds/        # 背景插件
│   │   │   ├── SkyDomePlugin.ts
│   │   │   ├── GradientPlugin.ts
│   │   │   └── ImagePlugin.ts
│   │   │
│   │   ├── particles/          # 粒子插件
│   │   │   ├── StarDustPlugin.ts
│   │   │   ├── HeartParticlesPlugin.ts
│   │   │   ├── SakuraPlugin.ts
│   │   │   └── SnowPlugin.ts
│   │   │
│   │   ├── effects/            # 特效插件
│   │   │   ├── BloomPlugin.ts
│   │   │   ├── PostGradePlugin.ts
│   │   │   ├── FogPlugin.ts
│   │   │   └── GodRaysPlugin.ts
│   │   │
│   │   ├── layouts/            # 布局插件
│   │   │   ├── SphereLayoutPlugin.ts
│   │   │   ├── HelixLayoutPlugin.ts
│   │   │   ├── GridLayoutPlugin.ts
│   │   │   └── SpiralLayoutPlugin.ts
│   │   │
│   │   ├── interactions/       # 交互插件
│   │   │   ├── CursorTrailPlugin.ts
│   │   │   ├── ClickRipplePlugin.ts
│   │   │   ├── MagneticFieldPlugin.ts
│   │   │   └── ConstellationPlugin.ts
│   │   │
│   │   ├── themes/             # 主题插件
│   │   │   ├── TimeBasedThemePlugin.ts
│   │   │   ├── SeasonalThemePlugin.ts
│   │   │   └── CustomThemePlugin.ts
│   │   │
│   │   └── audio/              # 音频插件
│   │       ├── BGMPlugin.ts
│   │       └── SFXPlugin.ts
│   │
│   ├── presets/                # 预设配置
│   │   ├── forest-dream.json   # 森林之梦
│   │   ├── ocean-breeze.json   # 海洋微风
│   │   ├── starry-night.json   # 星空夜曲
│   │   └── minimal.json        # 极简模式
│   │
│   ├── ui/                      # UI 组件
│   │   ├── ConfigPanel.vue     # 配置面板
│   │   ├── PluginSelector.vue  # 插件选择器
│   │   └── PresetSelector.vue  # 预设选择器
│   │
│   └── App.vue                  # 主应用
```

## 插件实现示例

### 示例 1: 天空盒插件

```typescript
// plugins/backgrounds/SkyDomePlugin.ts
import type { ViewerPlugin, ViewerContext } from '@/core/types'
import { SkyDome } from '@/lib/sky-dome'

export class SkyDomePlugin implements ViewerPlugin {
  name = 'sky-dome'
  version = '1.0.0'
  
  private skyDome: SkyDome | null = null
  private context: ViewerContext | null = null
  
  install(context: ViewerContext) {
    this.context = context
    
    const config = context.config.background?.sky || {}
    this.skyDome = new SkyDome(
      context.scene,
      config.theme || 'forest',
      config.timeOfDay
    )
    
    // 监听主题变化
    context.on('theme:update', (colors) => {
      this.skyDome?.updateColors(colors)
    })
  }
  
  uninstall() {
    this.skyDome?.dispose()
    this.skyDome = null
  }
  
  update(delta: number) {
    this.skyDome?.update(delta)
  }
}
```

### 示例 2: 布局插件

```typescript
// plugins/layouts/SphereLayoutPlugin.ts
import type { ViewerPlugin, ViewerContext } from '@/core/types'
import { sphereLayout } from '@/lib/layouts'

export class SphereLayoutPlugin implements ViewerPlugin {
  name = 'sphere-layout'
  version = '1.0.0'
  
  install(context: ViewerContext) {
    // 注册布局生成器
    context.on('layout:apply', (params) => {
      if (params.mode !== 'sphere') return
      
      const positions = sphereLayout(
        context.photos.length,
        params.params || {}
      )
      
      // 触发位置更新事件
      context.emit('layout:positions', positions)
    })
  }
  
  uninstall() {
    // 清理事件监听
  }
}
```

### 示例 3: 粒子插件

```typescript
// plugins/particles/StarDustPlugin.ts
import type { ViewerPlugin, ViewerContext } from '@/core/types'
import { StarDust } from '@/lib/particles'

export class StarDustPlugin implements ViewerPlugin {
  name = 'stardust'
  version = '1.0.0'
  
  private starDust: StarDust | null = null
  
  install(context: ViewerContext) {
    const config = context.config.particles
    if (!config?.enabled || !config.types?.includes('stars')) {
      return
    }
    
    this.starDust = new StarDust(
      context.scene,
      context.config.quality === 'low',
      config.density || 1.0
    )
    
    context.addToScene(this.starDust.mesh)
  }
  
  uninstall() {
    if (this.starDust) {
      this.context?.removeFromScene(this.starDust.mesh)
      this.starDust.dispose()
    }
  }
  
  update(delta: number) {
    this.starDust?.update(delta)
  }
}
```

## 配置预设示例

### 预设 1: 森林之梦 (forest-dream.json)

```json
{
  "name": "森林之梦",
  "quality": "auto",
  "layout": {
    "mode": "sphere"
  },
  "background": {
    "type": "sky",
    "sky": {
      "theme": "forest",
      "timeOfDay": "auto"
    }
  },
  "particles": {
    "enabled": true,
    "types": ["stars", "sakura"],
    "density": 0.8
  },
  "effects": {
    "bloom": {
      "enabled": true,
      "strength": 0.6
    },
    "fog": {
      "enabled": true,
      "density": 0.015
    },
    "godRays": {
      "enabled": true,
      "source": "sun"
    }
  },
  "interaction": {
    "cursorTrail": true,
    "clickRipple": true,
    "magneticField": true,
    "constellation": false
  },
  "audio": {
    "bgm": {
      "enabled": true,
      "adaptive": true
    }
  },
  "theme": {
    "engine": "time-based"
  }
}
```

### 预设 2: 极简模式 (minimal.json)

```json
{
  "name": "极简模式",
  "quality": "mid",
  "layout": {
    "mode": "grid"
  },
  "background": {
    "type": "gradient",
    "gradient": {
      "colors": ["#F7F5F1", "#E7E3DA"],
      "direction": "vertical"
    }
  },
  "particles": {
    "enabled": false
  },
  "effects": {
    "bloom": {
      "enabled": false
    }
  },
  "interaction": {
    "cursorTrail": false,
    "clickRipple": true
  },
  "audio": {
    "bgm": {
      "enabled": false
    }
  },
  "theme": {
    "engine": "custom",
    "customColors": {
      "primary": "#1E2227",
      "secondary": "#6B7077",
      "accent": "#3C5A78",
      "background": "#F7F5F1",
      "fog": "#E7E3DA"
    }
  }
}
```

## 用户配置界面设计

### 配置面板结构

```
┌─────────────────────────────────┐
│  🎨 视觉配置                      │
├─────────────────────────────────┤
│  预设模板                         │
│  [ 森林之梦 ] [ 星空夜曲 ]       │
│  [ 海洋微风 ] [ 极简模式 ]       │
├─────────────────────────────────┤
│  布局模式                         │
│  ○ 球形  ○ 螺旋  ● 网格         │
│  ○ 银河  ○ 随机                 │
├─────────────────────────────────┤
│  背景                             │
│  类型: [天空盒 ▼]               │
│  主题: [森林 ▼]                 │
│  时间: [自动 ▼]                 │
├─────────────────────────────────┤
│  粒子效果                         │
│  ☑ 星尘  ☑ 樱花  ☐ 雪花        │
│  密度: ──●─────── 80%          │
├─────────────────────────────────┤
│  特效                             │
│  ☑ 光晕 (Bloom)                 │
│  ☑ 雾效                          │
│  ☐ 光束 (God Rays)              │
├─────────────────────────────────┤
│  交互                             │
│  ☑ 光标拖尾                      │
│  ☑ 点击涟漪                      │
│  ☐ 磁场效果                      │
├─────────────────────────────────┤
│  音频                             │
│  ☑ 背景音乐                      │
│  ☑ 交互音效                      │
│  音量: ──●─────── 50%          │
├─────────────────────────────────┤
│  [重置]           [保存配置]     │
└─────────────────────────────────┘
```

## 性能优化策略

### 自动降级规则

```typescript
// 根据设备性能自动调整配置
function autoAdjustQuality(config: ViewerConfig): ViewerConfig {
  const isMobile = /Mobi|Android/i.test(navigator.userAgent)
  const memory = navigator.deviceMemory || 4
  const cores = navigator.hardwareConcurrency || 4
  
  // 低端设备
  if (isMobile || memory < 4 || cores < 4) {
    return {
      ...config,
      quality: 'low',
      particles: { ...config.particles, enabled: false },
      effects: {
        bloom: { enabled: false },
        fog: { enabled: false },
        godRays: { enabled: false }
      },
      interaction: {
        cursorTrail: false,
        magneticField: false
      }
    }
  }
  
  // 中端设备
  if (memory < 8 || cores < 8) {
    return {
      ...config,
      quality: 'mid',
      particles: {
        ...config.particles,
        density: 0.5
      },
      effects: {
        ...config.effects,
        godRays: { enabled: false }
      }
    }
  }
  
  // 高端设备
  return { ...config, quality: 'high' }
}
```

## 扩展能力

### 1. 第三方插件支持

用户可以加载外部插件：

```typescript
// 用户自定义插件
const myPlugin: ViewerPlugin = {
  name: 'my-custom-effect',
  version: '1.0.0',
  
  install(context) {
    // 自定义逻辑
  },
  
  uninstall() {
    // 清理
  }
}

// 注册插件
viewer.pluginManager.register(myPlugin)
```

### 2. 配置导入导出

```typescript
// 导出配置
const config = viewer.exportConfig()
localStorage.setItem('gallery-config', JSON.stringify(config))

// 导入配置
const saved = localStorage.getItem('gallery-config')
if (saved) {
  viewer.loadConfig(JSON.parse(saved))
}
```

### 3. URL 分享配置

```
https://gallery.example.com/g/demo?preset=forest-dream
https://gallery.example.com/g/demo?layout=grid&particles=stars,hearts
```

## 实现优先级

### Phase 1: 核心架构 (Week 1)
- ✅ ViewerEngine 主引擎
- ✅ PluginManager 插件系统
- ✅ ConfigManager 配置管理
- ✅ EventBus 事件总线

### Phase 2: 基础插件 (Week 2)
- ✅ 布局插件（sphere, grid, helix）
- ✅ 背景插件（gradient, sky）
- ✅ 基础特效（bloom, fog）

### Phase 3: 高级特效 (Week 3)
- ✅ 粒子系统插件
- ✅ 交互特效插件
- ✅ 主题引擎插件

### Phase 4: UI 和优化 (Week 4)
- ✅ 配置面板 UI
- ✅ 预设系统
- ✅ 性能优化
- ✅ 文档和示例

## 总结

这个新架构的核心优势：

1. **灵活性**：用户可自由组合任意插件
2. **可扩展**：第三方可开发自定义插件
3. **性能优化**：按需加载，自动降级
4. **易用性**：预设配置，开箱即用
5. **可维护**：模块化，职责清晰

从 vie-mei 项目中继承的精华：
- Three.js 3D 照片墙核心渲染
- 时序主题引擎（昼夜变化）
- 丰富的视觉特效库
- 优秀的性能优化策略

新增的关键能力：
- 完整的插件化架构
- 用户可配置界面
- 预设和分享机制
- 更好的移动端支持
