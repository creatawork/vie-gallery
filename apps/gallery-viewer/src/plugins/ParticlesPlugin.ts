import * as THREE from 'three'
import type { ParticleType } from '@vie/gallery-contracts'
import type { ViewerPlugin, ViewerContext, ViewerConfig } from '../core/types'
import { allocateParticleCounts } from '../lib/particleBudget'

interface ParticleCountConfig {
  stars: number
  sakura: number
  hearts: number
  snow: number
  fireflies: number
  meteors: number
}

function getParticleCountByQuality(quality: 'low' | 'mid' | 'high', isMobile: boolean): ParticleCountConfig {
  if (quality === 'low' || isMobile) {
    return {
      stars: 300,
      sakura: 60,
      hearts: 40,
      snow: 200,
      fireflies: 70,
      meteors: 8
    }
  } else if (quality === 'mid') {
    return {
      stars: 600,
      sakura: 120,
      hearts: 80,
      snow: 400,
      fireflies: 140,
      meteors: 14
    }
  } else {
    return {
      stars: 1200,
      sakura: 200,
      hearts: 130,
      snow: 800,
      fireflies: 240,
      meteors: 22
    }
  }
}

export class ParticlesPlugin implements ViewerPlugin {
  name = 'Particles'
  version = '3.0.0'
  private context: ViewerContext | null = null
  private systems = new Map<ParticleType, ParticleSystem>()
  private counts: Record<ParticleType, number> = { stars: 0, hearts: 0, sakura: 0, snow: 0, fireflies: 0, meteors: 0 }
  private signature = ''
  private activeTime = 0
  private parameters = new WeakMap<ParticleSystem, { size: number; color?: THREE.Color }>()
  constructor(private readonly random: () => number = Math.random) {}
  install(context: ViewerContext): void {
    this.context = context
    this.refresh()
    context.on('config:update', this.handleConfigChange)
  }
  uninstall(): void {
    this.context?.off('config:update', this.handleConfigChange)
    for (const system of this.systems.values()) system.dispose()
    this.systems.clear()
    this.context = null
    this.signature = ''
    this.activeTime = 0
    this.counts = { stars: 0, hearts: 0, sakura: 0, snow: 0, fireflies: 0, meteors: 0 }
  }
  getParticleCounts(): Readonly<Record<ParticleType, number>> { return { ...this.counts } }
  update(delta: number, _elapsed: number): void {
    const speed = this.context?.reducedMotion() ? 0 : this.context?.config.particles.speed ?? 1
    const dt = Math.min(.1, Math.max(0, delta)) * speed
    if (dt === 0) return
    this.activeTime += dt
    for (const system of this.systems.values()) system.update(this.activeTime, dt)
  }
  private handleConfigChange = (_config: ViewerConfig) => this.refresh()
  private refresh(): void {
    if (!this.context) return
    const config = this.context.config.particles
    const quality = this.context.getQuality()
    const budget = this.context.getParticleBudget?.() ?? { low: 200, mid: 700, high: 1600 }[quality]
    const counts = allocateParticleCounts(getParticleCountByQuality(quality, this.context.isMobile()), config.enabled ? config.types : [], config.density ?? 1, budget)
    const signature = JSON.stringify(counts)
    if (signature !== this.signature) {
      this.signature = signature
      for (const system of this.systems.values()) system.dispose()
      this.systems.clear()
      this.counts = counts
      this.activeTime = 0
      const constructors = { stars: StarDustSystem, hearts: HeartsSystem, sakura: SakuraSystem, snow: SnowSystem, fireflies: FirefliesSystem, meteors: MeteorSystem }
      for (const type of Object.keys(counts) as ParticleType[]) {
        if (counts[type] === 0) continue
        const system = new constructors[type](this.context.scene, counts[type], this.random)
        system.mesh.frustumCulled = false
        system.update(0, 0)
        this.systems.set(type, system)
      }
    }
    for (const system of this.systems.values()) this.setParameters(system, config.size ?? 1, config.color)
  }
  private setParameters(system: ParticleSystem, size: number, color?: string): void {
    const mesh = system.mesh
    const material = mesh.material as THREE.Material & { color?: THREE.Color; size?: number; uniforms?: Record<string, THREE.IUniform> }
    let previous = this.parameters.get(system)
    if (!previous) { previous = { size: 1, color: material.color?.clone() }; this.parameters.set(system, previous) }
    if (material.uniforms) {
      material.uniforms.uSize.value = size
      material.uniforms.uColor.value.set(color ?? '#ffffff')
      material.uniforms.uUseColor.value = color ? 1 : 0
    } else {
      if (material.color) material.color.copy(color ? new THREE.Color(color) : previous.color!)
      if (mesh instanceof THREE.InstancedMesh) mesh.geometry.scale(size / previous.size, size / previous.size, size / previous.size)
      else if (typeof material.size === 'number') material.size *= size / previous.size
      if (system instanceof MeteorSystem) system.size = size
    }
    previous.size = size
  }
}

interface ParticleSystem {
  mesh: THREE.Points | THREE.InstancedMesh | THREE.LineSegments
  update(elapsed: number, delta: number): void
  dispose(): void
}

/**
 * 1. 璀璨星尘系统 (StarDustSystem)
 * 优化：对象池、边界回收、动态颜色
 */
class StarDustSystem implements ParticleSystem {
  readonly mesh: THREE.Points
  private material: THREE.ShaderMaterial
  private scene: THREE.Scene
  private count: number

  constructor(scene: THREE.Scene, count: number, private readonly random: () => number = Math.random) {
    this.scene = scene
    this.count = count
    const geometry = new THREE.BufferGeometry()

    const positions = new Float32Array(count * 3)
    const randoms = new Float32Array(count * 3)
    const scales = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // 空间球体分布
      const r = 400 + this.random() * 1600
      const theta = this.random() * Math.PI * 2
      const phi = Math.acos(2 * this.random() - 1)

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8
      positions[i * 3 + 2] = r * Math.cos(phi)

      randoms[i * 3] = this.random()
      randoms[i * 3 + 1] = this.random()
      randoms[i * 3 + 2] = this.random()

      scales[i] = this.random() * 2.5 + 0.8
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSize: { value: 1 }, uColor: { value: new THREE.Color() }, uUseColor: { value: 0 },
        uColor1: { value: new THREE.Color('#38bdf8') }, // 蔚蓝
        uColor2: { value: new THREE.Color('#c084fc') }  // 紫罗兰
      },
      vertexShader: `
        uniform float uTime;
        uniform float uSize;
        uniform vec3 uColor;
        uniform float uUseColor;
        attribute vec3 aRandom;
        attribute float aScale;
        varying float vAlpha;
        varying vec3 vColor;
        uniform vec3 uColor1;
        uniform vec3 uColor2;

        void main() {
          vec3 pos = position;

          // 涡流三维微旋
          float angle = uTime * 0.08 * (aRandom.x * 0.5 + 0.5);
          float cosA = cos(angle);
          float sinA = sin(angle);
          vec2 rotXY = vec2(pos.x * cosA - pos.z * sinA, pos.x * sinA + pos.z * cosA);
          pos.x = rotXY.x;
          pos.z = rotXY.y;
          pos.y += sin(uTime * 0.6 + aRandom.y * 6.28) * 15.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // 距离自适应大小
          gl_PointSize = aScale * uSize * (240.0 / -mvPosition.z);

          // 独立闪烁
          float twinkle = sin(uTime * (1.5 + aRandom.z * 3.0) + aRandom.x * 10.0);
          vAlpha = 0.4 + 0.6 * (twinkle * 0.5 + 0.5);
          vColor = mix(mix(uColor1, uColor2, aRandom.y), uColor, uUseColor);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          // 圆形发光星点
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          float strength = 1.0 - (dist * 2.0);
          strength = pow(strength, 1.8);

          gl_FragColor = vec4(vColor, vAlpha * strength);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    this.mesh = new THREE.Points(geometry, this.material)
    scene.add(this.mesh)
  }

  update(elapsed: number, delta: number): void {
    if (this.material.uniforms?.uTime) {
      this.material.uniforms.uTime.value = elapsed
    }
  }

  /**
   * 动态设置星星颜色（响应光照变化）
   */
  setColors(color1: THREE.Color, color2: THREE.Color): void {
    if (this.material.uniforms?.uColor1) {
      this.material.uniforms.uColor1.value = color1
    }
    if (this.material.uniforms?.uColor2) {
      this.material.uniforms.uColor2.value = color2
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * 2. 落樱花瓣系统 (SakuraSystem)
 * 优化：可配置粒子数量、边界自动回收
 */
class SakuraSystem implements ParticleSystem {
  readonly mesh: THREE.InstancedMesh
  private count: number
  private dummy = new THREE.Object3D()
  private scene: THREE.Scene
  private petalData: Array<{
    pos: THREE.Vector3
    rot: THREE.Vector3
    rotSpeed: THREE.Vector3
    fallSpeed: number
    swaySpeed: number
    seed: number
  }> = []

  constructor(scene: THREE.Scene, count: number, private readonly random: () => number = Math.random) {
    this.scene = scene
    this.count = count

    // 花瓣双曲面几何
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.bezierCurveTo(4, 5, 8, 12, 0, 16)
    shape.bezierCurveTo(-8, 12, -4, 5, 0, 0)
    const geometry = new THREE.ShapeGeometry(shape, 8)
    geometry.scale(1.2, 1.2, 1.2)

    const material = new THREE.MeshBasicMaterial({
      color: 0xffb7c5, // 樱花淡粉
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    })

    this.mesh = new THREE.InstancedMesh(geometry, material, count)

    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(
        (this.random() - 0.5) * 1600,
        this.random() * 900 - 100,
        (this.random() - 0.5) * 1400
      )
      const rot = new THREE.Vector3(
        this.random() * Math.PI * 2,
        this.random() * Math.PI * 2,
        this.random() * Math.PI * 2
      )
      const rotSpeed = new THREE.Vector3(
        (this.random() - 0.5) * 1.5,
        (this.random() - 0.5) * 2.0,
        (this.random() - 0.5) * 1.2
      )

      this.petalData.push({
        pos,
        rot,
        rotSpeed,
        fallSpeed: 35 + this.random() * 30,
        swaySpeed: 1.0 + this.random() * 1.5,
        seed: i * 0.7
      })
    }

    scene.add(this.mesh)
  }

  update(elapsed: number, delta: number): void {
    for (let i = 0; i < this.count; i++) {
      const p = this.petalData[i]

      // 飘落与边界自动回收
      p.pos.y -= p.fallSpeed * delta
      p.pos.x += Math.sin(elapsed * p.swaySpeed + p.seed) * 0.8 * delta * 60
      p.pos.z += Math.cos(elapsed * p.swaySpeed * 0.7 + p.seed) * 0.6 * delta * 60

      // 超出下边界时回收到顶部
      if (p.pos.y < -500) {
        p.pos.y = 700 + this.random() * 200
        p.pos.x = (this.random() - 0.5) * 1600
        p.pos.z = (this.random() - 0.5) * 1400
      }

      // 三维翻滚自旋
      p.rot.x += p.rotSpeed.x * delta
      p.rot.y += p.rotSpeed.y * delta
      p.rot.z += p.rotSpeed.z * delta

      this.dummy.position.copy(p.pos)
      this.dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }

    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.petalData = []
  }
}

/**
 * 3. 心动浪漫粒子系统 (HeartsSystem)
 * 优化：可配置粒子数量、边界自动回收
 */
class HeartsSystem implements ParticleSystem {
  readonly mesh: THREE.InstancedMesh
  private count: number
  private dummy = new THREE.Object3D()
  private scene: THREE.Scene
  private heartData: Array<{
    pos: THREE.Vector3
    baseScale: number
    riseSpeed: number
    seed: number
  }> = []

  constructor(scene: THREE.Scene, count: number, private readonly random: () => number = Math.random) {
    this.scene = scene
    this.count = count

    // 心形参数形状
    const heartShape = new THREE.Shape()
    heartShape.moveTo(0, 0)
    heartShape.bezierCurveTo(0, 3, 4, 6, 7, 6)
    heartShape.bezierCurveTo(11, 6, 11, 1, 11, 1)
    heartShape.bezierCurveTo(11, -3, 8, -6.5, 0, -11)
    heartShape.bezierCurveTo(-8, -6.5, -11, -3, -11, 1)
    heartShape.bezierCurveTo(-11, 1, -11, 6, -7, 6)
    heartShape.bezierCurveTo(-4, 6, 0, 3, 0, 0)

    const geometry = new THREE.ShapeGeometry(heartShape, 8)
    geometry.scale(0.8, 0.8, 0.8)

    const material = new THREE.MeshBasicMaterial({
      color: 0xf43f5e, // 玫瑰粉红
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.mesh = new THREE.InstancedMesh(geometry, material, count)

    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(
        (this.random() - 0.5) * 1400,
        (this.random() - 0.5) * 800,
        (this.random() - 0.5) * 1200
      )

      this.heartData.push({
        pos,
        baseScale: 0.6 + this.random() * 0.7,
        riseSpeed: 20 + this.random() * 25,
        seed: i * 1.5
      })
    }

    scene.add(this.mesh)
  }

  update(elapsed: number, delta: number): void {
    for (let i = 0; i < this.count; i++) {
      const h = this.heartData[i]

      // 向上冉冉升起
      h.pos.y += h.riseSpeed * delta
      h.pos.x += Math.sin(elapsed * 1.2 + h.seed) * 0.5 * delta * 60

      // 超出上边界时回收到底部
      if (h.pos.y > 650) {
        h.pos.y = -500
        h.pos.x = (this.random() - 0.5) * 1400
        h.pos.z = (this.random() - 0.5) * 1200
      }

      // 周期性心跳缩放脉冲 (Heartbeat Pulse)
      const pulse = Math.sin(elapsed * 3.5 + h.seed) * 0.15 + 1.0
      const currentScale = h.baseScale * pulse

      this.dummy.position.copy(h.pos)
      this.dummy.rotation.set(0, Math.sin(elapsed + h.seed) * 0.4, 0)
      this.dummy.scale.set(currentScale, currentScale, currentScale)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }

    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.heartData = []
  }
}

/**
 * 4. 晶莹静雪系统 (SnowSystem)
 * 优化：可配置粒子数量、边界自动回收
 */
class SnowSystem implements ParticleSystem {
  readonly mesh: THREE.Points
  private scene: THREE.Scene
  private count: number
  private positions: Float32Array
  private velocities: Float32Array

  constructor(scene: THREE.Scene, count: number, private readonly random: () => number = Math.random) {
    this.scene = scene
    this.count = count
    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = (this.random() - 0.5) * 1600
      this.positions[i * 3 + 1] = this.random() * 1000 - 300
      this.positions[i * 3 + 2] = (this.random() - 0.5) * 1400
      this.velocities[i] = 0.8 + this.random() * 0.8 // 随机下落速度
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 4.5,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    this.mesh = new THREE.Points(geometry, material)
    scene.add(this.mesh)
  }

  update(elapsed: number, delta: number): void {
    const pos = this.positions
    for (let i = 0; i < this.count; i++) {
      // 使用独立速度下落
      pos[i * 3 + 1] -= this.velocities[i] * delta * 60
      // 水平飘移
      pos[i * 3] += Math.sin(elapsed * 1.5 + i) * 0.4 * delta * 60

      // 超出下边界时回收到顶部
      if (pos[i * 3 + 1] < -500) {
        pos[i * 3 + 1] = 600
        pos[i * 3] = (this.random() - 0.5) * 1600
        pos[i * 3 + 2] = (this.random() - 0.5) * 1400
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

/**
 * 5. 夏夜萤火系统 (FirefliesSystem)
 * 特点：多频正弦游走漂移 + 呼吸/脉冲式明灭发光，琥珀金与萤绿双色
 */
class FirefliesSystem implements ParticleSystem {
  readonly mesh: THREE.Points
  private material: THREE.ShaderMaterial
  private scene: THREE.Scene

  constructor(scene: THREE.Scene, count: number, private readonly random: () => number = Math.random) {
    this.scene = scene
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const scales = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (this.random() - 0.5) * 1800
      positions[i * 3 + 1] = -250 + this.random() * 800
      positions[i * 3 + 2] = (this.random() - 0.5) * 1600
      seeds[i] = this.random() * 100
      scales[i] = 0.7 + this.random() * 1.3
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSize: { value: 1 }, uColor: { value: new THREE.Color() }, uUseColor: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uSize;
        uniform vec3 uColor;
        uniform float uUseColor;
        attribute float aSeed;
        attribute float aScale;
        varying float vGlow;
        varying vec3 vColor;

        void main() {
          vec3 pos = position;

          // 多频正弦叠加的无规则游走漂移
          float t = uTime * 0.35 + aSeed;
          pos.x += sin(t * 0.9 + aSeed) * 60.0 + sin(t * 0.37) * 40.0;
          pos.y += sin(t * 0.7 + aSeed * 2.0) * 45.0;
          pos.z += cos(t * 0.5 + aSeed) * 55.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aScale * uSize * (200.0 / -mvPosition.z);

          // 呼吸式明灭 + 偶发高亮脉冲（萤火虫只在瞬间最亮）
          float breath = 0.3 + 0.3 * sin(uTime * (0.8 + fract(aSeed) * 0.8) + aSeed);
          float flash = pow(max(0.0, sin(uTime * 0.45 + aSeed * 3.7)), 14.0);
          vGlow = clamp(breath + flash, 0.04, 1.0);

          // 琥珀金与萤绿之间取色
          vColor = mix(mix(vec3(1.0, 0.75, 0.15), vec3(0.64, 0.9, 0.2), fract(aSeed * 7.31)), uColor, uUseColor);
        }
      `,
      fragmentShader: `
        varying float vGlow;
        varying vec3 vColor;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          float glow = pow(1.0 - dist * 2.0, 2.2);
          gl_FragColor = vec4(vColor, vGlow * glow);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    this.mesh = new THREE.Points(geometry, this.material)
    scene.add(this.mesh)
  }

  update(elapsed: number, delta: number): void {
    if (this.material.uniforms?.uTime) {
      this.material.uniforms.uTime.value = elapsed
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * 6. 流星雨系统 (MeteorSystem)
 * 特点：渐隐拖尾划痕 + 随机划落周期，帧率无关的位移积分
 */
class MeteorSystem implements ParticleSystem {
  size = 1
  readonly mesh: THREE.LineSegments
  private scene: THREE.Scene
  private count: number
  private positions: Float32Array
  private colors: Float32Array
  private lastElapsed = 0
  private meteors: Array<{
    head: THREE.Vector3
    dir: THREE.Vector3
    speed: number
    tail: number
    active: boolean
    respawnAt: number
  }> = []

  constructor(scene: THREE.Scene, count: number, private readonly random: () => number = Math.random) {
    this.scene = scene
    this.count = count
    this.positions = new Float32Array(count * 6)
    this.colors = new Float32Array(count * 6)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    this.mesh = new THREE.LineSegments(geometry, material)
    scene.add(this.mesh)

    for (let i = 0; i < this.count; i++) {
      this.meteors.push({
        head: new THREE.Vector3(),
        dir: new THREE.Vector3(0, -1, 0),
        speed: 0,
        tail: 0,
        active: false,
        respawnAt: this.random() * 6
      })
      this.hideMeteor(i)
    }
  }

  /** 隐藏流星：两端收缩为同一点即可让线段不可见 */
  private hideMeteor(index: number): void {
    const base = index * 6
    for (let v = 0; v < 6; v++) {
      this.positions[base + v] = 99999
    }
  }

  private respawn(meteor: (typeof this.meteors)[number]): void {
    meteor.head.set(
      (this.random() - 0.5) * 2200,
      450 + this.random() * 550,
      (this.random() - 0.5) * 1800
    )
    // 斜向下划落，方向带随机扰动
    meteor.dir.set(
      0.55 + this.random() * 0.35,
      -(0.5 + this.random() * 0.4),
      (this.random() - 0.5) * 0.35
    ).normalize()
    meteor.speed = 900 + this.random() * 700
    meteor.tail = 160 + this.random() * 140
    meteor.active = true
  }

  update(elapsed: number, delta: number): void {
    const dt = Math.min(0.1, Math.max(0, elapsed - this.lastElapsed))
    this.lastElapsed = elapsed

    for (let i = 0; i < this.count; i++) {
      const meteor = this.meteors[i]
      const base = i * 6

      if (!meteor.active) {
        if (elapsed >= meteor.respawnAt) this.respawn(meteor)
        else continue
      }

      meteor.head.addScaledVector(meteor.dir, meteor.speed * dt)

      // 头亮尾暗（加色混合下暗色即视觉透明）
      this.positions[base] = meteor.head.x
      this.positions[base + 1] = meteor.head.y
      this.positions[base + 2] = meteor.head.z
      this.positions[base + 3] = meteor.head.x - meteor.dir.x * meteor.tail * this.size
      this.positions[base + 4] = meteor.head.y - meteor.dir.y * meteor.tail * this.size
      this.positions[base + 5] = meteor.head.z - meteor.dir.z * meteor.tail * this.size

      this.colors[base] = 0.92
      this.colors[base + 1] = 0.96
      this.colors[base + 2] = 1.0
      this.colors[base + 3] = 0.06
      this.colors[base + 4] = 0.07
      this.colors[base + 5] = 0.12

      // 划出边界后进入随机等待，营造"偶发"感
      if (
        meteor.head.y < -600 ||
        Math.abs(meteor.head.x) > 2400 ||
        Math.abs(meteor.head.z) > 2200
      ) {
        meteor.active = false
        meteor.respawnAt = elapsed + 1.5 + this.random() * 6
        this.hideMeteor(i)
      }
    }

    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.attributes.color.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.meteors = []
  }
}
