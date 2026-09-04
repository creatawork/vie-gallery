import type { ViewerPlugin, ViewerContext } from '../core/types'
import { LAYOUT_GENERATORS } from '../lib/layouts'
import type * as THREE from 'three'

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
 * 负责照片的布局切换和动画
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
    this.currentLayout = context.config.layout.mode

    // 监听布局切换事件
    context.on('layout:change', (mode: string) => {
      this.switchLayout(mode)
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

    // 更新所有动画
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i]
      const progress = (this.clock - anim.startTime) / anim.duration

      if (progress >= 1) {
        // 动画结束，设置最终位置
        anim.mesh.position.copy(anim.targetPos)
        anim.mesh.rotation.copy(anim.targetRot)
        this.animations.splice(i, 1)
      } else {
        // 缓动函数：easeInOutQuad
        const t = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2

        // 插值位置
        anim.mesh.position.lerpVectors(anim.startPos, anim.targetPos, t)

        // 插值旋转
        anim.mesh.rotation.x = anim.startRot.x + (anim.targetRot.x - anim.startRot.x) * t
        anim.mesh.rotation.y = anim.startRot.y + (anim.targetRot.y - anim.startRot.y) * t
        anim.mesh.rotation.z = anim.startRot.z + (anim.targetRot.z - anim.startRot.z) * t
      }
    }
  }

  /**
   * 切换布局
   */
  private switchLayout(mode: string): void {
    if (!this.context) return

    const generator = LAYOUT_GENERATORS[mode as keyof typeof LAYOUT_GENERATORS]
    if (!generator) {
      console.warn(`Unknown layout mode: ${mode}`)
      return
    }

    this.currentLayout = mode
    this.applyLayout(mode)
  }

  /**
   * 应用布局
   */
  private applyLayout(mode: string): void {
    if (!this.context) return

    const generator = LAYOUT_GENERATORS[mode as keyof typeof LAYOUT_GENERATORS]
    if (!generator) return

    const photos = this.context.photos
    if (photos.length === 0) return

    // 生成布局位置
    const params = this.context.config.layout.params || {}
    const positions = generator(photos.length, params)

    // 清空旧动画
    this.animations = []

    // 创建新动画
    photos.forEach((photo, i) => {
      const pos = positions[i]
      if (!pos) return

      this.animations.push({
        mesh: photo,
        startPos: photo.position.clone(),
        startRot: photo.rotation.clone(),
        targetPos: new (photo.position.constructor as any)(pos.x, pos.y, pos.z),
        targetRot: new (photo.rotation.constructor as any)(pos.rx, pos.ry, pos.rz),
        startTime: this.clock,
        duration: 1.5
      })
    })

    // 触发布局应用完成事件
    this.context.emit('layout:applied', { mode, positions })
  }
}
