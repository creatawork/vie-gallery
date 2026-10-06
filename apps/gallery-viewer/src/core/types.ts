import type * as THREE from 'three'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import type { PostProcessingState } from './PostProcessing'
import type { TextureBudget } from './TexturePool'
import type { Quality, QualitySample, QualityDecision } from './QualityController'
import type { ParticleType } from '@vie/gallery-contracts'

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
    entranceOffsetY?: number
    layoutScale?: number
    inView?: boolean
    textureState?: 'placeholder' | 'ready' | 'failed'
  }
}

/**
 * 相册配置
 */
export type { ViewerConfig } from '@vie/gallery-contracts'
import type { ViewerConfig } from '@vie/gallery-contracts'

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
  getParticleBudget?(): number
  now(): number
  reducedMotion(): boolean
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

export interface ViewerDiagnostics {
  postProcessing: PostProcessingState
  requestedConfig: ViewerConfig
  effectiveConfig: ViewerConfig
  textures: { resident: number; bytes: number; pending: number; active: number; failed: number; budget: TextureBudget }
  background: { url: string | null; width: number; height: number; bytes: number; projection: 'flat' | 'equirectangular' | 'none' }
  cameraDirection: [number, number, number]
  requested: ViewerConfig
  effectiveQuality: Quality
  reason: string | null
  elapsed: number
  meshCount: number
  particleCounts: Record<ParticleType, number>
  geometryCount: number
  drawCalls: number
  fps: number
  frameIntervalMs: number
  cpuRenderMs: number
}
export interface ViewerDiagnosticApi {
  snapshot(): ViewerDiagnostics
  requestConfig(patch: Partial<ViewerConfig>): Promise<void>
  freezeTime(elapsed: number | null): void
  photoMeshIds(): string[]
  sampleQuality(sample: QualitySample): QualityDecision
  drainFrames(): Array<{ frameIntervalMs: number; cpuRenderMs: number; drawCalls: number }>
}
