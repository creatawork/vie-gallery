import type * as THREE from 'three'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'

/**
 * 照片网格对象
 */
export interface PhotoMesh extends THREE.Mesh {
  userData: {
    index: number
    url: string
    thumbnailUrl: string
    mediumUrl?: string | null
    textureUrl?: string | null
    title?: string
  }
}

/**
 * 相册配置
 */
export interface ViewerConfig {
  presetName?: string
  background?: { type: 'image' | 'none'; image?: { url: string } }
  // 基础
  quality: 'low' | 'mid' | 'high' | 'auto'

  // 布局
  layout: {
    mode: 'sphere' | 'carousel' | 'helix' | 'grid' | 'spiral' | 'random'
    params?: Record<string, any>
  }

  // 粒子系统
  particles: {
    enabled: boolean
    types: Array<'stars' | 'hearts' | 'sakura' | 'snow' | 'fireflies' | 'meteors'>
    density?: number
  }

  // 特效
  effects: {
    bloom?: {
      enabled: boolean
      strength?: number
      radius?: number
      threshold?: number
      /** 效果预设：fresh | warm | deep | minimal */
      preset?: 'fresh' | 'warm' | 'deep' | 'minimal'
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
      /** 效果预设：fresh | warm | deep | minimal */
      preset?: 'fresh' | 'warm' | 'deep' | 'minimal'
    }
    godRays?: {
      enabled: boolean
      source?: 'sun' | 'moon'
    }
    /** 照片常态悬浮微动；缺省视为开启（兼容历史配置） */
    photoFloat?: boolean
  }

  // 相机行为
  camera?: {
    autoRotate?: boolean
    /** 进场电影式运镜：开场从远景高位弧线推进到默认机位 */
    introFlight?: boolean
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

  // 光照系统
  lighting?: {
    /** 时间段模式：auto | sunrise | noon | sunset | night */
    timeOfDay?: 'auto' | 'sunrise' | 'noon' | 'sunset' | 'night'
    /** 是否根据照片主色调自动调整环境光 */
    autoColorAdapt?: boolean
    /** 颜色适应过渡时间（秒） */
    transitionDuration?: number
  }
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
  | 'config:update'
  | 'webgl:lost'
  | 'webgl:restored'
  | 'metrics:update'
  | 'resize'
  | 'destroy'
