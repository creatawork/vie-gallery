import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * SkyDome Plugin - 天空盒背景插件
 *
 * 支持两种模式：
 * 1. 渐变模式 - 垂直渐变色
 * 2. 全景模式 - equirectangular 全景图
 *
 * 主题：forest, ocean, starry, sunset
 */
export class SkyDomePlugin implements ViewerPlugin {
  name = 'SkyDome'
  version = '1.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private mesh: THREE.Mesh | null = null
  private material: THREE.ShaderMaterial | null = null
  private canvas: HTMLCanvasElement | null = null

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.background

    if (config.type !== 'sky') return

    const radius = 3000
    const exponent = 0.9
    const geometry = new THREE.SphereGeometry(radius, 48, 24)

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color('#0e1a14') },
        uBottom: { value: new THREE.Color('#2e4a38') },
        uExponent: { value: exponent },
        uTexture: { value: null },
        uHasTexture: { value: 0.0 },
        uTint: { value: new THREE.Color('#2e4a38') },
        uTintAmount: { value: 0.35 },
        uBrightness: { value: 1.0 },
        uHorizonFog: { value: new THREE.Color('#24402f') }
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform float uExponent;
        uniform sampler2D uTexture;
        uniform float uHasTexture;
        uniform vec3 uTint;
        uniform float uTintAmount;
        uniform float uBrightness;
        uniform vec3 uHorizonFog;
        varying vec3 vDir;

        #define PI 3.141592653589793

        vec2 dirToEquirect(vec3 d) {
          float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
          float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
          return vec2(u, v);
        }

        void main() {
          float h = vDir.y * 0.5 + 0.5;

          if (uHasTexture > 0.5) {
            vec2 uv = dirToEquirect(normalize(vDir));
            vec3 tex = texture2D(uTexture, uv).rgb;
            tex = mix(tex, tex * (uTint * 1.6), uTintAmount);
            tex *= uBrightness;
            float horizon = smoothstep(0.55, 0.42, h);
            tex = mix(tex, uHorizonFog * uBrightness, horizon * 0.6);
            gl_FragColor = vec4(tex, 1.0);
          } else {
            float t = pow(clamp(h, 0.0, 1.0), uExponent);
            vec3 col = mix(uBottom, uTop, t) * uBrightness;
            gl_FragColor = vec4(col, 1.0);
          }
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false
    this.mesh.layers.set(0)

    context.addToScene(this.mesh)

    // 应用主题
    const theme = config.sky?.theme || 'forest'
    this.applyTheme(theme)

    context.on('config:change', this.handleConfigChange)
  }

  uninstall(): void {
    if (this.context && this.mesh) {
      this.context.removeFromScene(this.mesh)
    }

    if (this.mesh) {
      this.mesh.geometry.dispose()
      if (this.material) {
        const tex = this.material.uniforms.uTexture.value
        if (tex && tex.dispose) tex.dispose()
        this.material.dispose()
      }
    }

    this.context?.off('config:change', this.handleConfigChange)
    this.context = null
    this.mesh = null
    this.material = null
  }

  update(): void {
    // 让天穹跟随相机
    if (this.context && this.mesh) {
      this.mesh.position.copy(this.context.camera.position)
    }
  }

  private handleConfigChange = (data: any): void => {
    const config = data.background
    if (config?.type === 'sky' && config.sky?.theme) {
      this.applyTheme(config.sky.theme)
    }
  }

  private applyTheme(theme: string): void {
    if (!this.material) return

    const themes = {
      forest: {
        top: new THREE.Color('#0e1a14'),
        bottom: new THREE.Color('#2e4a38'),
        fog: new THREE.Color('#24402f')
      },
      ocean: {
        top: new THREE.Color('#0a1e3c'),
        bottom: new THREE.Color('#4a7ba2'),
        fog: new THREE.Color('#667eea')
      },
      starry: {
        top: new THREE.Color('#0f0520'),
        bottom: new THREE.Color('#1e3c72'),
        fog: new THREE.Color('#2a5298')
      },
      sunset: {
        top: new THREE.Color('#d53369'),
        bottom: new THREE.Color('#ffecd2'),
        fog: new THREE.Color('#f5576c')
      }
    }

    const colors = themes[theme as keyof typeof themes] || themes.forest

    this.material.uniforms.uTop.value.copy(colors.top)
    this.material.uniforms.uBottom.value.copy(colors.bottom)
    this.material.uniforms.uTint.value.copy(colors.bottom)
    this.material.uniforms.uHorizonFog.value.copy(colors.fog)

    // 生成程序化全景图
    this.applyPlaceholderPanorama(theme)
  }

  private applyPlaceholderPanorama(theme: string): void {
    if (!this.material) return

    const canvas = this.createPlaceholderForest(theme)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.RepeatWrapping

    const old = this.material.uniforms.uTexture.value
    if (old && old.dispose) old.dispose()

    this.material.uniforms.uTexture.value = tex
    this.material.uniforms.uHasTexture.value = 1.0
    this.material.needsUpdate = true
  }

  private createPlaceholderForest(theme: string, w = 2048, h = 1024): HTMLCanvasElement {
    const canvas = this.canvas || document.createElement('canvas')
    this.canvas = canvas
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!

    // 根据主题调整颜色
    const palettes = {
      forest: {
        sky: ['#0a140d', '#16291d', '#3a5c42', '#24402f', '#0c1810'],
        trees: ['#1d3326', '#142519', '#0a1610']
      },
      ocean: {
        sky: ['#0a1e3c', '#1e3a5f', '#4a7ba2', '#667eea', '#0f2847'],
        trees: ['#1a3d5c', '#0f2847', '#0a1e3c']
      },
      starry: {
        sky: ['#0f0520', '#1e1a3c', '#2a3c72', '#1e3c72', '#0a0f20'],
        trees: ['#1a1a3c', '#0f0f2a', '#0a0a20']
      },
      sunset: {
        sky: ['#d53369', '#f093fb', '#ffecd2', '#fcb69f', '#d53369'],
        trees: ['#8d2048', '#6d1838', '#4d0f28']
      }
    }

    const palette = palettes[theme as keyof typeof palettes] || palettes.forest

    // 天空渐变
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    palette.sky.forEach((color, i) => {
      sky.addColorStop(i / (palette.sky.length - 1), color)
    })
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // 地平线
    const horizonY = h * 0.56
    const fog = ctx.createLinearGradient(0, horizonY - h * 0.08, 0, horizonY + h * 0.06)
    fog.addColorStop(0, 'rgba(120,170,130,0)')
    fog.addColorStop(0.5, 'rgba(150,190,150,0.35)')
    fog.addColorStop(1, 'rgba(120,170,130,0)')
    ctx.fillStyle = fog
    ctx.fillRect(0, horizonY - h * 0.08, w, h * 0.14)

    // 树剪影层
    const layers = [
      { baseY: horizonY + 6, height: h * 0.10, color: palette.trees[0], trunks: 46, jitter: 0.5, alpha: 0.55 },
      { baseY: horizonY + 30, height: h * 0.18, color: palette.trees[1], trunks: 34, jitter: 0.7, alpha: 0.75 },
      { baseY: horizonY + 70, height: h * 0.30, color: palette.trees[2], trunks: 24, jitter: 1.0, alpha: 0.92 }
    ]

    for (const L of layers) {
      ctx.save()
      ctx.globalAlpha = L.alpha
      ctx.fillStyle = L.color
      const step = w / L.trunks
      for (let i = 0; i <= L.trunks; i++) {
        const x = i * step + (Math.random() - 0.5) * step * L.jitter
        const treeH = L.height * (0.6 + Math.random() * 0.8)
        const trunkW = step * (0.12 + Math.random() * 0.12)

        ctx.fillRect(x - trunkW / 2, L.baseY, trunkW, treeH * 0.5)

        const crownW = step * (0.5 + Math.random() * 0.7)
        const crownH = treeH
        const topY = L.baseY - crownH + treeH * 0.5

        ctx.beginPath()
        ctx.moveTo(x, topY)
        ctx.lineTo(x - crownW / 2, L.baseY + treeH * 0.5)
        ctx.lineTo(x + crownW / 2, L.baseY + treeH * 0.5)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    return canvas
  }
}
