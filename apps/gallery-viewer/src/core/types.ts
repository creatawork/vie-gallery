import type * as THREE from 'three'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'

/**
 * 照片网格对象
 */
export interface PhotoMesh extends THREE.Mesh {
  userData: {
    index: number
    url: string
    thumbnailUrl: string
    title?: string
  }
}

/**
 * 相册配置
 */
export interface ViewerConfig {
  // 基础
  quality: 'low' | 'mid' | 'high' | 'auto'

  // 布局
  layout: {
    mode: 'sphere' | 'carousel' | 'helix' | 'grid' | 'spiral' | 'random'
    params?: Record<string, any>
  }

  // 背景
  background: {
    type: 'sky' | 'gradient' | 'image' | 'none'
    sky?: {
      theme: 'forest' | 'ocean' | 'starry' | 'sunset'
      timeOfDay?: 'auto' | 'dawn' | 'day' | 'sunset' | 'night'
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
      radius?: number
      threshold?: number
    }
    postGrade?: {
      enabled: boolean
      saturation?: number
      brightness?: number
    }
    fog?: {
      enabled: boolean
      color?: string
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
      adaptive?: boolean
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

/**
 * 主题色彩
 */
export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  fog: string
}

/**
 * 插件上下文
 */
export interface ViewerContext {
  // Three.js 核心对象
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  composer: EffectComposer | null

  // 照片数据
  photos: PhotoMesh[]

  // 配置
  config: ViewerConfig

  // 事件系统
  on(event: string, handler: Function): void
  off(event: string, handler: Function): void
  emit(event: string, data?: any): void

  // 场景管理
  addToScene(object: THREE.Object3D): void
  removeFromScene(object: THREE.Object3D): void

  // 资源管理
  loadTexture(url: string): Promise<THREE.Texture>

  // 工具方法
  isMobile(): boolean
  getQuality(): 'low' | 'mid' | 'high'
}

/**
 * 插件接口
 */
export interface ViewerPlugin {
  // 元数据
  name: string
  version: string
  dependencies?: string[]

  // 生命周期
  install(context: ViewerContext): void | Promise<void>
  uninstall(): void

  // 可选：配置界面
  getConfigPanel?(): HTMLElement

  // 可选：更新循环
  update?(delta: number, elapsed: number): void

  // 可选：窗口调整
  onResize?(width: number, height: number): void
}

/**
 * 布局位置
 */
export interface LayoutPosition {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

/**
 * 事件类型
 */
export type ViewerEvent =
  | 'init'
  | 'ready'
  | 'photo:click'
  | 'photo:hover'
  | 'layout:change'
  | 'layout:apply'
  | 'layout:positions'
  | 'theme:update'
  | 'config:update'
  | 'resize'
  | 'destroy'
