import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * Particles Plugin - 粒子系统插件
 *
 * 支持多种粒子类型：
 * - stars: 星尘粒子（远景）
 * - sakura: 樱花花瓣
 * - hearts: 心形粒子
 * - snow: 雪花
 */
export class ParticlesPlugin implements ViewerPlugin {
  name = 'Particles'
  version = '1.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private systems: Map<string, ParticleSystem> = new Map()

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.particles

    if (!config.enabled) return

    const isMobile = context.isMobile()

    // 根据配置创建粒子系统
    for (const type of config.types || []) {
      let system: ParticleSystem

      switch (type) {
        case 'stars':
          system = new StarDustSystem(context.scene, isMobile)
          break
        case 'sakura':
          system = new SakuraSystem(context.scene, isMobile)
          break
        case 'hearts':
          system = new HeartsSystem(context.scene, isMobile)
          break
        case 'snow':
          system = new SnowSystem(context.scene, isMobile)
          break
        default:
          continue
      }

      this.systems.set(type, system)
    }

    context.on('config:change', this.handleConfigChange)
  }

  uninstall(): void {
    for (const system of this.systems.values()) {
      system.dispose()
    }
    this.systems.clear()

    this.context?.off('config:change', this.handleConfigChange)
    this.context = null
  }

  update(_delta: number, elapsed: number): void {
    for (const system of this.systems.values()) {
      system.update(elapsed)
    }
  }

  private handleConfigChange = (data: any): void => {
    if (!data.particles) return

    // 简单实现：重新安装
    this.uninstall()
    if (this.context) {
      this.install(this.context)
    }
  }
}

interface ParticleSystem {
  update(elapsed: number): void
  dispose(): void
}

/**
 * 星尘粒子系统
 */
class StarDustSystem implements ParticleSystem {
  private mesh: THREE.Points
  private material: THREE.ShaderMaterial

  constructor(scene: THREE.Scene, isMobile: boolean) {
    const count = isMobile ? 350 : 900
    const geometry = new THREE.BufferGeometry()

    const positions = new Float32Array(count * 3)
    const paletteIdx = new Float32Array(count)
    const phase = new Float32Array(count)
    const drift = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * 1100
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * 700
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * 1100

      paletteIdx[i] = Math.floor(Math.random() * 4)
      phase[i] = Math.random() * Math.PI * 2
      drift[i] = 8 + Math.random() * 18
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aPaletteIdx', new THREE.BufferAttribute(paletteIdx, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geometry.setAttribute('aDrift', new THREE.BufferAttribute(drift, 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 1.8 },
        uOpacity: { value: 0.5 },
        uTime: { value: 0 },
        uC0: { value: new THREE.Color(1.0, 1.0, 1.0) },
        uC1: { value: new THREE.Color(1.0, 0.85, 0.90) },
        uC2: { value: new THREE.Color(0.95, 0.88, 1.0) },
        uC3: { value: new THREE.Color(1.0, 0.95, 0.80) }
      },
      vertexShader: /* glsl */ `
        attribute float aPaletteIdx;
        attribute float aPhase;
        attribute float aDrift;
        uniform float uSize;
        uniform float uTime;
        uniform vec3 uC0;
        uniform vec3 uC1;
        uniform vec3 uC2;
        uniform vec3 uC3;
        varying vec3 vColor;

        void main() {
          vec3 c = uC0;
          if (aPaletteIdx > 2.5) c = uC3;
          else if (aPaletteIdx > 1.5) c = uC2;
          else if (aPaletteIdx > 0.5) c = uC1;
          vColor = c;

          vec3 p = position;
          p.x += sin(uTime * 0.12 + aPhase) * aDrift;
          p.y += cos(uTime * 0.09 + aPhase * 1.3) * aDrift * 0.6;
          p.z += sin(uTime * 0.1 + aPhase * 0.7) * aDrift;

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = uSize * (300.0 / max(-mvPos.z, 1.0));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float dist = length(d);
          float alpha = (1.0 - smoothstep(0.35, 0.5, dist)) * uOpacity;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.mesh = new THREE.Points(geometry, this.material)
    scene.add(this.mesh)
  }

  update(elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed
    this.mesh.rotation.y = elapsed * 0.003
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * 樱花粒子系统
 */
class SakuraSystem implements ParticleSystem {
  private mesh: THREE.Points
  private material: THREE.ShaderMaterial
  private texture: THREE.CanvasTexture

  constructor(scene: THREE.Scene, isMobile: boolean) {
    const count = isMobile ? 40 : 90
    const bound = 700

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const vels = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const sizes = new Float32Array(count)
    const spins = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1600
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1400
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1200
      vels[i * 3] = 0
      vels[i * 3 + 1] = -(8 + Math.random() * 14)
      vels[i * 3 + 2] = 0
      phases[i] = Math.random() * Math.PI * 2
      sizes[i] = 14 + Math.random() * 18
      spins[i] = (Math.random() - 0.5) * 1.8
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aVel', new THREE.BufferAttribute(vels, 3))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aSpin', new THREE.BufferAttribute(spins, 1))

    this.texture = this.createPetalTexture()

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: this.texture },
        uBoundY: { value: bound }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aVel;
        attribute float aPhase;
        attribute float aSize;
        attribute float aSpin;
        uniform float uTime;
        uniform float uBoundY;
        varying float vAlpha;
        varying float vSpin;

        void main() {
          vec3 p = position;
          p.y = mod(p.y + aVel.y * uTime + uBoundY, uBoundY * 2.0) - uBoundY;
          p.x += sin(uTime * 0.55 + aPhase) * 30.0;
          p.z += cos(uTime * 0.42 + aPhase * 1.3) * 18.0;

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * (320.0 / max(-mvPos.z, 1.0));

          float topFade = 1.0 - smoothstep(uBoundY * 0.75, uBoundY, p.y);
          float botFade = smoothstep(-uBoundY, -uBoundY * 0.75, p.y);
          vAlpha = topFade * botFade;
          vSpin = uTime * aSpin + aPhase;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying float vSpin;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vSpin), s = sin(vSpin);
          uv = mat2(c, -s, s, c) * uv;
          uv += 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
          vec4 tex = texture2D(uMap, uv);
          gl_FragColor = vec4(tex.rgb, tex.a * vAlpha * 0.92);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })

    this.mesh = new THREE.Points(geometry, this.material)
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  private createPetalTexture(): THREE.CanvasTexture {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!

    ctx.translate(size / 2, size / 2)

    // 5瓣花瓣
    for (let i = 0; i < 5; i++) {
      ctx.save()
      ctx.rotate((i / 5) * Math.PI * 2)
      const grad = ctx.createRadialGradient(0, -22, 2, 0, -22, 28)
      grad.addColorStop(0, 'rgba(255,255,255,0.95)')
      grad.addColorStop(0.5, '#ffc0d4')
      grad.addColorStop(1, 'rgba(255,180,210,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(0, -22, 14, 22, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // 花蕊
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 12)
    cg.addColorStop(0, 'rgba(255,230,150,0.95)')
    cg.addColorStop(1, 'rgba(255,200,140,0)')
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.arc(0, 0, 12, 0, Math.PI * 2)
    ctx.fill()

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  update(elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}

/**
 * 心形粒子系统
 */
class HeartsSystem implements ParticleSystem {
  private mesh: THREE.Points
  private material: THREE.ShaderMaterial
  private texture: THREE.CanvasTexture

  constructor(scene: THREE.Scene, isMobile: boolean) {
    const count = isMobile ? 80 : 180
    const geometry = new THREE.BufferGeometry()

    const aBasePos = new Float32Array(count * 3)
    const aVel = new Float32Array(count * 3)
    const aPhase = new Float32Array(count)
    const aSize = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      aBasePos[i * 3] = (Math.random() - 0.5) * 2400
      aBasePos[i * 3 + 1] = (Math.random() - 0.5) * 1200
      aBasePos[i * 3 + 2] = (Math.random() - 0.5) * 800

      aVel[i * 3] = (Math.random() - 0.5) * 0.15 * 60
      aVel[i * 3 + 1] = (0.25 + Math.random() * 0.5) * 60
      aVel[i * 3 + 2] = (Math.random() - 0.5) * 0.08 * 60

      aPhase[i] = Math.random() * Math.PI * 2
      aSize[i] = 28 * (0.4 + Math.random() * 1.2)
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(aBasePos, 3))
    geometry.setAttribute('aVel', new THREE.BufferAttribute(aVel, 3))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1))

    this.texture = this.createHeartTexture()

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: this.texture },
        uBoundY: { value: 700.0 }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aVel;
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uBoundY;
        varying float vAlpha;

        void main() {
          vec3 p = position;
          float yProgress = mod(p.y + aVel.y * uTime + uBoundY, uBoundY * 2.0) - uBoundY;
          p.y = yProgress;
          p.x += aVel.x * uTime + sin(uTime * 0.6 + aPhase) * 18.0;
          p.z += aVel.z * uTime;

          vAlpha = 1.0 - smoothstep(uBoundY * 0.7, uBoundY, abs(yProgress));

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * (300.0 / max(-mvPos.z, 1.0));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(tex.rgb, tex.a * vAlpha * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.mesh = new THREE.Points(geometry, this.material)
    scene.add(this.mesh)
  }

  private createHeartTexture(): THREE.CanvasTexture {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!

    ctx.clearRect(0, 0, size, size)

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255, 107, 157, 1)')
    grad.addColorStop(0.5, 'rgba(255, 143, 163, 0.8)')
    grad.addColorStop(1, 'rgba(255, 200, 220, 0)')

    ctx.save()
    ctx.translate(size / 2, size / 2 + 4)
    ctx.scale(0.55, 0.55)
    ctx.beginPath()
    ctx.moveTo(0, -30)
    ctx.bezierCurveTo(0, -60, -50, -60, -50, -30)
    ctx.bezierCurveTo(-50, 0, 0, 40, 0, 60)
    ctx.bezierCurveTo(0, 40, 50, 0, 50, -30)
    ctx.bezierCurveTo(50, -60, 0, -60, 0, -30)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }

  update(elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}

/**
 * 雪花粒子系统
 */
class SnowSystem implements ParticleSystem {
  private mesh: THREE.Points
  private material: THREE.ShaderMaterial
  private texture: THREE.CanvasTexture

  constructor(scene: THREE.Scene, isMobile: boolean) {
    const count = isMobile ? 60 : 120
    const bound = 700

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const vels = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const sizes = new Float32Array(count)
    const spins = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1600
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1400
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1200
      vels[i * 3] = 0
      vels[i * 3 + 1] = -(5 + Math.random() * 10)
      vels[i * 3 + 2] = 0
      phases[i] = Math.random() * Math.PI * 2
      sizes[i] = 10 + Math.random() * 14
      spins[i] = (Math.random() - 0.5) * 1.2
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aVel', new THREE.BufferAttribute(vels, 3))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aSpin', new THREE.BufferAttribute(spins, 1))

    this.texture = this.createSnowTexture()

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: this.texture },
        uBoundY: { value: bound }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aVel;
        attribute float aPhase;
        attribute float aSize;
        attribute float aSpin;
        uniform float uTime;
        uniform float uBoundY;
        varying float vAlpha;
        varying float vSpin;

        void main() {
          vec3 p = position;
          p.y = mod(p.y + aVel.y * uTime + uBoundY, uBoundY * 2.0) - uBoundY;
          p.x += sin(uTime * 0.4 + aPhase) * 25.0;
          p.z += cos(uTime * 0.3 + aPhase * 1.2) * 15.0;

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * (320.0 / max(-mvPos.z, 1.0));

          float topFade = 1.0 - smoothstep(uBoundY * 0.75, uBoundY, p.y);
          float botFade = smoothstep(-uBoundY, -uBoundY * 0.75, p.y);
          vAlpha = topFade * botFade;
          vSpin = uTime * aSpin + aPhase;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying float vSpin;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vSpin), s = sin(vSpin);
          uv = mat2(c, -s, s, c) * uv;
          uv += 0.5;
          vec4 tex = texture2D(uMap, uv);
          gl_FragColor = vec4(tex.rgb, tex.a * vAlpha * 0.9);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })

    this.mesh = new THREE.Points(geometry, this.material)
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  private createSnowTexture(): THREE.CanvasTexture {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!

    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.3, 'rgba(220,235,255,0.7)')
    g.addColorStop(1, 'rgba(200,220,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  update(elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}
