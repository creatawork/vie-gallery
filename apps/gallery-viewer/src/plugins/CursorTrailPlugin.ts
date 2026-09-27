import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * CursorTrail Plugin - 星迹拖尾插件
 *
 * 指针划过画面时沿视线方向撒出金色星尘，星尘带惯性漂移、
 * 尺寸收缩与闪烁渐隐，形成"指尖流星"般的拖尾。
 *
 * - 粒子池固定（桌面 96 / 移动 48），指针移动时循环复用，无 GC 压力
 * - 发射节流至每 24ms 一批，快速甩动也不会糊成一片
 */
export class CursorTrailPlugin implements ViewerPlugin {
  name = 'CursorTrail'
  version = '1.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private mesh: THREE.Points | null = null
  private geometry: THREE.BufferGeometry | null = null
  private material: THREE.ShaderMaterial | null = null

  private poolSize = 96
  private positions: Float32Array = new Float32Array(0)
  private life: Float32Array = new Float32Array(0)
  private seeds: Float32Array = new Float32Array(0)
  private velocities: Float32Array = new Float32Array(0)
  private cursor = 0
  private lastEmit = 0
  private lastElapsed = 0

  private canvas: HTMLCanvasElement | null = null
  private handleMove: ((event: PointerEvent) => void) | null = null

  install(context: ViewerContext): void {
    this.context = context

    if (context.isMobile() || context.getQuality() === 'low') {
      this.poolSize = 48
    }

    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(this.poolSize * 3)
    this.life = new Float32Array(this.poolSize)
    this.seeds = new Float32Array(this.poolSize)
    this.velocities = new Float32Array(this.poolSize * 3)

    for (let i = 0; i < this.poolSize; i++) {
      this.seeds[i] = Math.random()
      this.positions[i * 3 + 1] = 99999 // 初始藏到视野外
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float aLife;
        attribute float aSeed;
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // 生命后期收缩，前段保持明亮
          float size = mix(1.0, 0.25, 1.0 - aLife);
          gl_PointSize = (2.0 + aSeed * 3.0) * size * (260.0 / -mvPosition.z);

          // 闪烁渐隐
          float twinkle = 0.75 + 0.25 * sin(aLife * 40.0 + aSeed * 20.0);
          vAlpha = smoothstep(0.0, 0.15, aLife) * aLife * twinkle;

          // 月白到鎏金的星尘色
          vColor = mix(vec3(1.0, 0.98, 0.9), vec3(1.0, 0.78, 0.35), aSeed);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          float glow = pow(1.0 - dist * 2.0, 2.0);
          gl_FragColor = vec4(vColor, vAlpha * glow);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    this.geometry = geometry
    this.mesh = new THREE.Points(geometry, this.material)
    this.mesh.frustumCulled = false
    context.addToScene(this.mesh)

    // 指针移动时沿视线撒出星尘（挂到渲染画布上，与 OrbitControls 手势共存）
    this.handleMove = (event: PointerEvent) => this.emitTrail(event)
    this.canvas = context.renderer.domElement
    this.canvas.addEventListener('pointermove', this.handleMove, { passive: true })
  }

  /**
   * 将指针位置反投影为相机前固定深度的世界坐标，并发射一小批星尘
   */
  private emitTrail(event: PointerEvent): void {
    if (!this.context || !this.mesh) return

    const now = performance.now()
    if (now - this.lastEmit < 24) return
    this.lastEmit = now

    const canvas = this.canvas
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1

    // 沿视线方向取相机前 520 单位处，避免星尘贴脸或落到相纸后方
    const direction = new THREE.Vector3(ndcX, ndcY, 0.5)
      .unproject(this.context.camera)
      .sub(this.context.camera.position)
      .normalize()

    const batch = 2
    for (let b = 0; b < batch; b++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % this.poolSize

      const jitter = 26
      this.positions[i * 3] = this.context.camera.position.x + direction.x * 520 + (Math.random() - 0.5) * jitter
      this.positions[i * 3 + 1] = this.context.camera.position.y + direction.y * 520 + (Math.random() - 0.5) * jitter
      this.positions[i * 3 + 2] = this.context.camera.position.z + direction.z * 520 + (Math.random() - 0.5) * jitter

      // 轻微上飘与随机漂移惯性
      this.velocities[i * 3] = (Math.random() - 0.5) * 30
      this.velocities[i * 3 + 1] = 12 + Math.random() * 22
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 30

      this.life[i] = 1
    }
  }

  update(_delta: number, elapsed: number): void {
    if (!this.mesh || !this.geometry) return

    // 帧率无关的生命周期与位移积分
    const dt = Math.min(0.1, Math.max(0, elapsed - this.lastElapsed))
    this.lastElapsed = elapsed

    let alive = false
    for (let i = 0; i < this.poolSize; i++) {
      if (this.life[i] <= 0) continue
      alive = true

      // 生命周期约 0.9s，随时间与漂移惯性更新
      this.life[i] = Math.max(0, this.life[i] - dt / 0.9)

      this.positions[i * 3] += this.velocities[i * 3] * dt
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt

      // 星尘缓缓沉降消散
      this.velocities[i * 3 + 1] -= 14 * dt

      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = 99999
      }
    }

    if (alive) {
      this.geometry.attributes.position.needsUpdate = true
      this.geometry.attributes.aLife.needsUpdate = true
    }
  }

  uninstall(): void {
    if (this.canvas && this.handleMove) {
      this.canvas.removeEventListener('pointermove', this.handleMove)
    }

    if (this.context && this.mesh) {
      this.context.removeFromScene(this.mesh)
    }

    this.geometry?.dispose()
    this.material?.dispose()
    this.geometry = null
    this.material = null
    this.mesh = null
    this.canvas = null
    this.handleMove = null
    this.context = null
  }
}
