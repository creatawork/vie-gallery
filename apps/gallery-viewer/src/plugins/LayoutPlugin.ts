import type { ViewerPlugin, ViewerContext } from '../core/types'
import { LAYOUT_GENERATORS } from '../lib/layouts'
import * as THREE from 'three'

interface MorphTarget {
  mesh: THREE.Mesh
  index: number
  startPos: THREE.Vector3
  startRot: THREE.Euler
  targetPos: THREE.Vector3
  targetRot: THREE.Euler
  midArc: THREE.Vector3 // 空间外膨胀弧线中继点
  startTime: number
  delay: number
  duration: number
}

interface RestPose {
  basePos: THREE.Vector3
  baseRot: THREE.Euler
  seed: number
}

/**
 * 生产级 3D 空间动态流体几何形变插件 (Dynamic Fluid Morphing Plugin)
 * 负责照片高阶拓扑排布、阶梯延时弧线形变与常态物理漂浮微动
 */
export class LayoutPlugin implements ViewerPlugin {
  name = 'Layout'
  version = '2.0.0'

  private context: ViewerContext | null = null
  private currentLayout: string = 'sphere'
  private morphs: MorphTarget[] = []
  private restPoses: Map<number, RestPose> = new Map()
  private clock = 0
  private isAnimating = false

  install(context: ViewerContext): void {
    this.context = context
    this.currentLayout = context.config.layout?.mode || 'sphere'

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

    context.on('config:update', (data: any) => {
      if (data.layout?.mode && data.layout.mode !== this.currentLayout) {
        this.switchLayout(data.layout.mode)
      }
    })

    // 初始布局
    this.applyLayout(this.currentLayout)
  }

  uninstall(): void {
    this.context = null
    this.morphs = []
    this.restPoses.clear()
    this.isAnimating = false
  }

  update(delta: number, elapsed: number): void {
    this.clock = elapsed

    // 1. 处理正在进行的流体形变转场动画
    if (this.morphs.length > 0) {
      for (let i = this.morphs.length - 1; i >= 0; i--) {
        const m = this.morphs[i]
        const animTime = this.clock - m.startTime - m.delay

        if (animTime < 0) {
          // 尚未到达该卡片的阶梯延时时间
          continue
        }

        const progress = Math.min(1, animTime / m.duration)

        if (progress >= 1) {
          // 动画结束，固定基准位置
          m.mesh.position.copy(m.targetPos)
          m.mesh.rotation.copy(m.targetRot)

          // 记录静止基准姿态，用于后续物理微浮
          this.restPoses.set(m.index, {
            basePos: m.targetPos.clone(),
            baseRot: m.targetRot.clone(),
            seed: m.index * 1.37
          })

          this.morphs.splice(i, 1)
        } else {
          // 高阶三次贝塞尔平滑缓动：easeInOutCubic
          const t = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2

          // 二次贝塞尔空间弧线插值 (从 startPos 经过 midArc 飞向 targetPos)
          const p0 = m.startPos
          const p1 = m.midArc
          const p2 = m.targetPos
          const oneMinusT = 1 - t

          m.mesh.position.x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x
          m.mesh.position.y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y
          m.mesh.position.z = oneMinusT * oneMinusT * p0.z + 2 * oneMinusT * t * p1.z + t * t * p2.z

          // 角度线性插值
          m.mesh.rotation.x = m.startRot.x + (m.targetRot.x - m.startRot.x) * t
          m.mesh.rotation.y = m.startRot.y + (m.targetRot.y - m.startRot.y) * t
          m.mesh.rotation.z = m.startRot.z + (m.targetRot.z - m.startRot.z) * t
        }
      }

      if (this.morphs.length === 0 && this.isAnimating) {
        this.isAnimating = false
        this.context?.emit('layout:applied', this.currentLayout)
        this.context?.emit('transition:end')
      }
    }

    // 2. 常态物理呼吸与空间漂浮微动 (Subtle Space Oscillation)
    if (this.restPoses.size > 0 && this.context?.photos) {
      const time = this.clock
      this.context.photos.forEach((photo, idx) => {
        const pose = this.restPoses.get(idx)
        // 仅在未处于形变动画中的照片上叠加微动
        if (pose && !this.morphs.some(m => m.index === idx)) {
          const swayY = Math.sin(time * 1.3 + pose.seed) * 3.2
          const swayX = Math.cos(time * 0.9 + pose.seed) * 1.8
          const tiltZ = Math.sin(time * 1.1 + pose.seed) * 0.015

          photo.position.x = pose.basePos.x + swayX
          photo.position.y = pose.basePos.y + swayY
          photo.position.z = pose.basePos.z
          photo.rotation.z = pose.baseRot.z + tiltZ
        }
      })
    }
  }

  /**
   * 切换几何排布模型（带阶梯延时与空间粒子弧线形变）
   */
  switchLayout(mode: string, baseDuration = 1.1): void {
    if (!this.context) return
    const key = (mode || 'sphere') as keyof typeof LAYOUT_GENERATORS
    const generator = LAYOUT_GENERATORS[key] || LAYOUT_GENERATORS.sphere
    this.currentLayout = mode

    const photos = this.context.photos
    if (!photos || photos.length === 0) return

    const rawPositions = generator(photos.length)

    this.morphs = []
    this.restPoses.clear()
    this.isAnimating = true

    this.context.emit('transition:start')

    photos.forEach((photo, i) => {
      const p = rawPositions[i]
      if (!p) return

      const startPos = photo.position.clone()
      const startRot = photo.rotation.clone()
      const targetPos = new THREE.Vector3(p.x, p.y, p.z)
      const targetRot = new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0)

      // 计算空间向外膨胀的弧线中继点 (Explosive Morph Arc)
      const centerVec = targetPos.clone().add(startPos).multiplyScalar(0.5)
      const normalDir = centerVec.clone().normalize()
      // 若处于中心点，赋予向上向前的法线偏移
      if (normalDir.lengthSq() < 0.01) {
        normalDir.set(0, 1, 0.5).normalize()
      }
      const arcExpansion = Math.min(220, startPos.distanceTo(targetPos) * 0.35)
      const midArc = centerVec.add(normalDir.multiplyScalar(arcExpansion))

      // 阶梯延时：每张照片依次错落启动
      const delay = Math.min(0.35, i * 0.035)

      this.morphs.push({
        mesh: photo,
        index: i,
        startPos,
        startRot,
        targetPos,
        targetRot,
        midArc,
        startTime: this.clock,
        delay,
        duration: baseDuration
      })
    })
  }

  /**
   * 初始应用几何排布（瞬间定位）
   */
  private applyLayout(mode: string): void {
    if (!this.context) return
    const key = (mode || 'sphere') as keyof typeof LAYOUT_GENERATORS
    const generator = LAYOUT_GENERATORS[key] || LAYOUT_GENERATORS.sphere
    this.currentLayout = mode

    const photos = this.context.photos
    if (!photos || photos.length === 0) return

    const rawPositions = generator(photos.length)
    this.restPoses.clear()

    photos.forEach((photo, i) => {
      const p = rawPositions[i]
      if (p) {
        photo.position.set(p.x, p.y, p.z)
        photo.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0)

        this.restPoses.set(i, {
          basePos: new THREE.Vector3(p.x, p.y, p.z),
          baseRot: new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0),
          seed: i * 1.37
        })
      }
    })

    this.context.emit('layout:applied', mode)
  }
}
