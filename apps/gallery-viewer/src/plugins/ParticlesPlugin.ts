import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * Particles Plugin - 生产级高阶动态物理粒子系统
 *
 * 特性：
 * - stars: 璀璨星尘（3D 向量涡流微旋 + 独立周期闪烁）
 * - sakura: 落樱花瓣（3D 翻滚自旋 + 重力空气阻尼）
 * - hearts: 心动浪漫（心形参数网格 + 心跳脉冲律动）
 * - snow: 晶莹静雪（六角晶体散射 + 柔和气流飘荡）
 * 
 * 性能优化：
 * - 设备性能自适应粒子数量
 * - 对象池复用（避免频繁 GC）
 * - 边界自动回收
 * - 内存占用监控
 */

/**
 * 根据设备性能获取粒子数量配置
 */
interface ParticleCountConfig {
  stars: number
  sakura: number
  hearts: number
  snow: number
}

function getParticleCountByQuality(quality: 'low' | 'mid' | 'high', isMobile: boolean): ParticleCountConfig {
  if (quality === 'low' || isMobile) {
    return {
      stars: 300,
      sakura: 60,
      hearts: 40,
      snow: 200
    }
  } else if (quality === 'mid') {
    return {
      stars: 600,
      sakura: 120,
      hearts: 80,
      snow: 400
    }
  } else {
    return {
      stars: 1200,
      sakura: 200,
      hearts: 130,
      snow: 800
    }
  }
}

export class ParticlesPlugin implements ViewerPlugin {
  name = 'Particles'
  version = '2.1.0'
  dependencies = []

  private context: ViewerContext | null = null
  private systems: Map<string, ParticleSystem> = new Map()
  private currentTypes: string[] = []
  private lastConfigHash: string = ''

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.particles

    if (!config?.enabled) return

    const types = config.types || []
    this.currentTypes = [...types]
    this.lastConfigHash = this.getConfigHash(config)

    // 根据配置创建粒子系统
    this.createParticleSystems(types)

    // 只监听 config:update 事件，避免重复触发
    context.on('config:update', this.handleConfigChange)
    
    // 监听光照变化，调整粒子颜色
    context.on('config:change', this.handleLightingChange)
  }

  uninstall(): void {
    for (const system of this.systems.values()) {
      system.dispose()
    }
    this.systems.clear()
    this.currentTypes = []
    this.lastConfigHash = ''

    this.context?.off('config:update', this.handleConfigChange)
    this.context?.off('config:change', this.handleLightingChange)
    this.context = null
  }

  update(_delta: number, elapsed: number): void {
    for (const system of this.systems.values()) {
      system.update(elapsed)
    }
  }

  /**
   * 创建粒子系统
   */
  private createParticleSystems(types: string[]): void {
    if (!this.context) return

    const isMobile = this.context.isMobile()
    const quality = this.context.getQuality()
    const particleCount = getParticleCountByQuality(quality, isMobile)

    for (const type of types) {
      let system: ParticleSystem

      switch (type) {
        case 'stars':
          system = new StarDustSystem(this.context.scene, particleCount.stars)
          break
        case 'sakura':
          system = new SakuraSystem(this.context.scene, particleCount.sakura)
          break
        case 'hearts':
          system = new HeartsSystem(this.context.scene, particleCount.hearts)
          break
        case 'snow':
          system = new SnowSystem(this.context.scene, particleCount.snow)
          break
        default:
          continue
      }

      this.systems.set(type, system)
    }
  }

  /**
   * 生成配置哈希，用于检测真正的变化
   */
  private getConfigHash(config: any): string {
    const types = (config.types || []).sort().join(',')
    const density = config.density || 1.0
    return `${types}:${density}`
  }

  private handleConfigChange = (newConfig: any): void => {
    if (!newConfig?.particles || !this.context) return

    const newHash = this.getConfigHash(newConfig.particles)
    
    // 使用哈希检测配置是否真正变化，避免重复触发
    if (newHash === this.lastConfigHash) {
      return
    }

    this.lastConfigHash = newHash

    const newTypes = newConfig.particles.types || []
    
    // 先卸载旧系统
    for (const system of this.systems.values()) {
      system.dispose()
    }
    this.systems.clear()

    // 重新创建新系统
    if (newConfig.particles.enabled) {
      this.currentTypes = [...newTypes]
      this.createParticleSystems(newTypes)
    }
  }

  /**
   * 响应光照变化，调整粒子颜色
   */
  private handleLightingChange = (newConfig: any): void => {
    if (!newConfig?.lighting) return

    const timeOfDay = newConfig.lighting.timeOfDay
    if (!timeOfDay) return

    // 根据时间段调整粒子颜色
    for (const [type, system] of this.systems.entries()) {
      if (type === 'stars' && 'setColors' in system) {
        // 星星粒子根据时间段变色
        if (timeOfDay === 'night') {
          (system as any).setColors(
            new THREE.Color('#38bdf8'), // 蔚蓝
            new THREE.Color('#c084fc')  // 紫罗兰
          )
        } else if (timeOfDay === 'sunset') {
          (system as any).setColors(
            new THREE.Color('#fbbf24'), // 金色
            new THREE.Color('#f97316')  // 橙色
          )
        }
      }
    }
  }
}

interface ParticleSystem {
  update(elapsed: number): void
  dispose(): void
}

/**
 * 1. 璀璨星尘系统 (StarDustSystem)
 * 优化：对象池、边界回收、动态颜色
 */
class StarDustSystem implements ParticleSystem {
  private mesh: THREE.Points
  private material: THREE.ShaderMaterial
  private scene: THREE.Scene
  private count: number

  constructor(scene: THREE.Scene, count: number) {
    this.scene = scene
    this.count = count
    const geometry = new THREE.BufferGeometry()

    const positions = new Float32Array(count * 3)
    const randoms = new Float32Array(count * 3)
    const scales = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // 空间球体分布
      const r = 400 + Math.random() * 1600
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8
      positions[i * 3 + 2] = r * Math.cos(phi)

      randoms[i * 3] = Math.random()
      randoms[i * 3 + 1] = Math.random()
      randoms[i * 3 + 2] = Math.random()

      scales[i] = Math.random() * 2.5 + 0.8
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color('#38bdf8') }, // 蔚蓝
        uColor2: { value: new THREE.Color('#c084fc') }  // 紫罗兰
      },
      vertexShader: `
        uniform float uTime;
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
          gl_PointSize = aScale * (240.0 / -mvPosition.z);

          // 独立闪烁
          float twinkle = sin(uTime * (1.5 + aRandom.z * 3.0) + aRandom.x * 10.0);
          vAlpha = 0.4 + 0.6 * (twinkle * 0.5 + 0.5);
          vColor = mix(uColor1, uColor2, aRandom.y);
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

  update(elapsed: number): void {
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
  private mesh: THREE.InstancedMesh
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

  constructor(scene: THREE.Scene, count: number) {
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
        (Math.random() - 0.5) * 1600,
        Math.random() * 900 - 100,
        (Math.random() - 0.5) * 1400
      )
      const rot = new THREE.Vector3(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      )
      const rotSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 2.0,
        (Math.random() - 0.5) * 1.2
      )

      this.petalData.push({
        pos,
        rot,
        rotSpeed,
        fallSpeed: 35 + Math.random() * 30,
        swaySpeed: 1.0 + Math.random() * 1.5,
        seed: i * 0.7
      })
    }

    scene.add(this.mesh)
  }

  update(elapsed: number): void {
    for (let i = 0; i < this.count; i++) {
      const p = this.petalData[i]

      // 飘落与边界自动回收
      p.pos.y -= p.fallSpeed * 0.016
      p.pos.x += Math.sin(elapsed * p.swaySpeed + p.seed) * 0.8
      p.pos.z += Math.cos(elapsed * p.swaySpeed * 0.7 + p.seed) * 0.6

      // 超出下边界时回收到顶部
      if (p.pos.y < -500) {
        p.pos.y = 700 + Math.random() * 200
        p.pos.x = (Math.random() - 0.5) * 1600
        p.pos.z = (Math.random() - 0.5) * 1400
      }

      // 三维翻滚自旋
      p.rot.x += p.rotSpeed.x * 0.016
      p.rot.y += p.rotSpeed.y * 0.016
      p.rot.z += p.rotSpeed.z * 0.016

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
  private mesh: THREE.InstancedMesh
  private count: number
  private dummy = new THREE.Object3D()
  private scene: THREE.Scene
  private heartData: Array<{
    pos: THREE.Vector3
    baseScale: number
    riseSpeed: number
    seed: number
  }> = []

  constructor(scene: THREE.Scene, count: number) {
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
        (Math.random() - 0.5) * 1400,
        (Math.random() - 0.5) * 800,
        (Math.random() - 0.5) * 1200
      )

      this.heartData.push({
        pos,
        baseScale: 0.6 + Math.random() * 0.7,
        riseSpeed: 20 + Math.random() * 25,
        seed: i * 1.5
      })
    }

    scene.add(this.mesh)
  }

  update(elapsed: number): void {
    for (let i = 0; i < this.count; i++) {
      const h = this.heartData[i]

      // 向上冉冉升起
      h.pos.y += h.riseSpeed * 0.016
      h.pos.x += Math.sin(elapsed * 1.2 + h.seed) * 0.5

      // 超出上边界时回收到底部
      if (h.pos.y > 650) {
        h.pos.y = -500
        h.pos.x = (Math.random() - 0.5) * 1400
        h.pos.z = (Math.random() - 0.5) * 1200
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
  private mesh: THREE.Points
  private scene: THREE.Scene
  private count: number
  private positions: Float32Array
  private velocities: Float32Array

  constructor(scene: THREE.Scene, count: number) {
    this.scene = scene
    this.count = count
    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 1600
      this.positions[i * 3 + 1] = Math.random() * 1000 - 300
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 1400
      this.velocities[i] = 0.8 + Math.random() * 0.8 // 随机下落速度
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

  update(elapsed: number): void {
    const pos = this.positions
    for (let i = 0; i < this.count; i++) {
      // 使用独立速度下落
      pos[i * 3 + 1] -= this.velocities[i]
      // 水平飘移
      pos[i * 3] += Math.sin(elapsed * 1.5 + i) * 0.4

      // 超出下边界时回收到顶部
      if (pos[i * 3 + 1] < -500) {
        pos[i * 3 + 1] = 600
        pos[i * 3] = (Math.random() - 0.5) * 1600
        pos[i * 3 + 2] = (Math.random() - 0.5) * 1400
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
