import type { ViewerPlugin, ViewerContext } from '../core/types'
import { LAYOUT_GENERATORS } from '../lib/layouts'
import * as THREE from 'three'

interface AnimationTarget {
  mesh: THREE.Mesh
  startPos: THREE.Vector3
  startRot: THREE.Euler
  targetPos: THREE.Vector3
  targetRot: THREE.Euler
  startTime: number
  duration: number
}

/**
 * 布局管理插件
 * 负责照片的三维几何布局切换和缓动动画
 */
export class LayoutPlugin implements ViewerPlugin {
  name = 'Layout'
  version = '1.0.0'

  private context: ViewerContext | null = null
  private currentLayout: string = 'sphere'
  private animations: AnimationTarget[] = []
  private clock = 0

  install(context: ViewerContext): void {
    this.context = context
    this.currentLayout = context.config.layout.mode || 'sphere'

    // 监听布局切换事件
    context.on('layout:change', (mode: string) => {
      this.switchLayout(mode)
    })

    // 监听相册照片加载事件
    context.on('photos:loaded', () => {
      this.applyLayout(this.currentLayout)
    })

    // 监听全局配置变更
    context.on('config:change', (data: any) => {
      if (data.layout?.mode && data.layout.mode !== this.currentLayout) {
        this.switchLayout(data.layout.mode)
      }
    })

    // 初始布局
    this.applyLayout(this.currentLayout)
  }

  uninstall(): void {
    this.context = null
    this.animations = []
  }

  update(delta: number, elapsed: number): void {
    this.clock = elapsed

    // 更新所有缓动过渡动画
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i]
      const progress = (this.clock - anim.startTime) / anim.duration

      if (progress >= 1) {
        // 动画结束，固定最终位置
        anim.mesh.position.copy(anim.targetPos)
        anim.mesh.rotation.copy(anim.targetRot)
        this.animations.splice(i, 1)
      } else {
        // 优雅的高阶缓动函数：easeInOutQuad
        const t = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2

        // 插值三维空间位置
        anim.mesh.position.lerpVectors(anim.startPos, anim.targetPos, t)

        // 插值空间旋转角
        anim.mesh.rotation.x = anim.startRot.x + (anim.targetRot.x - anim.startRot.x) * t
        anim.mesh.rotation.y = anim.startRot.y + (anim.targetRot.y - anim.startRot.y) * t
        anim.mesh.rotation.z = anim.startRot.z + (anim.targetRot.z - anim.startRot.z) * t
      }
    }
  }

  /**
   * 切换布局模式（带插值过渡动画）
   */
  switchLayout(mode: string, duration = 1.4): void {
    if (!this.context || !LAYOUT_GENERATORS[mode as keyof typeof LAYOUT_GENERATORS]) return
    this.currentLayout = mode

    const photos = this.context.photos
    if (!photos || photos.length === 0) return

    const generator = LAYOUT_GENERATORS[mode as keyof typeof LAYOUT_GENERATORS]
    const rawPositions = generator(photos.length)

    this.animations = []

    photos.forEach((photo, i) => {
      const p = rawPositions[i]
      if (!p) return

      const targetPos = new THREE.Vector3(p.x, p.y, p.z)
      const targetRot = new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0)

      this.animations.push({
        mesh: photo,
        startPos: photo.position.clone(),
        startRot: photo.rotation.clone(),
        targetPos,
        targetRot,
        startTime: this.clock,
        duration
      })
    })
  }

  /**
   * 应用布局模式（立即定位）
   */
  private applyLayout(mode: string): void {
    if (!this.context || !LAYOUT_GENERATORS[mode as keyof typeof LAYOUT_GENERATORS]) return
    const photos = this.context.photos
    if (!photos || photos.length === 0) return

    const generator = LAYOUT_GENERATORS[mode as keyof typeof LAYOUT_GENERATORS]
    const rawPositions = generator(photos.length)

    photos.forEach((photo, i) => {
      const p = rawPositions[i]
      if (p) {
        photo.position.set(p.x, p.y, p.z)
        photo.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0)
      }
    })
  }
}
