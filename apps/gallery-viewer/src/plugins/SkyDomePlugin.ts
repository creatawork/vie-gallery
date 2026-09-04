import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * SkyDome Plugin - 沉浸式天空穹顶插件
 *
 * 使用 THREE.MeshBasicMaterial 直接贴图渲染，确保 WebGL 绝对兼容与原生高保真色彩
 */
export class SkyDomePlugin implements ViewerPlugin {
  name = 'SkyDome'
  version = '1.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private mesh: THREE.Mesh | null = null
  private material: THREE.MeshBasicMaterial | null = null
  private canvas: HTMLCanvasElement | null = null
  private textureLoader = new THREE.TextureLoader()

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.background

    if (config.type !== 'sky') return

    const radius = 3500
    // 球体几何体
    const geometry = new THREE.SphereGeometry(radius, 60, 40)

    // 使用 MeshBasicMaterial + BackSide
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.renderOrder = -100
    this.mesh.frustumCulled = false

    context.addToScene(this.mesh)

    // 应用主题
    const theme = config.sky?.theme || 'starry'
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
        if (this.material.map) this.material.map.dispose()
        this.material.dispose()
      }
    }

    this.context?.off('config:change', this.handleConfigChange)
    this.context = null
    this.mesh = null
    this.material = null
  }

  update(): void {
    // 天穹中心跟随相机
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

    // 优先尝试加载静态真实全景贴图 (/textures/sky/{theme}.png)
    const texturePath = `/textures/sky/${theme}.png`
    this.textureLoader.load(
      texturePath,
      (loadedTexture) => {
        if (!this.material) return
        loadedTexture.colorSpace = THREE.SRGBColorSpace
        loadedTexture.minFilter = THREE.LinearFilter
        loadedTexture.magFilter = THREE.LinearFilter
        loadedTexture.wrapS = THREE.RepeatWrapping

        if (this.material.map) this.material.map.dispose()
        this.material.map = loadedTexture
        this.material.color.setHex(0xffffff)
        this.material.needsUpdate = true
      },
      undefined,
      () => {
        // Fallback: 使用程序化动态全景
        this.applyPlaceholderPanorama(theme)
      }
    )
  }

  private applyPlaceholderPanorama(theme: string): void {
    if (!this.material) return

    const canvas = this.createPlaceholderPanorama(theme)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.RepeatWrapping

    if (this.material.map) this.material.map.dispose()
    this.material.map = tex
    this.material.color.setHex(0xffffff)
    this.material.needsUpdate = true
  }

  private createPlaceholderPanorama(theme: string, w = 2048, h = 1024): HTMLCanvasElement {
    const canvas = this.canvas || document.createElement('canvas')
    this.canvas = canvas
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!

    const palettes = {
      forest: {
        sky: ['#060f09', '#0d1f14', '#1b3827', '#254b35', '#0f2418'],
        trees: ['#13241a', '#0d1a12', '#07100b']
      },
      ocean: {
        sky: ['#040e1c', '#0c223c', '#1b4168', '#2a5b8c', '#0d2238'],
        trees: ['#0c2138', '#071526', '#030b14']
      },
      starry: {
        sky: ['#03040a', '#080c1e', '#131b3d', '#1f2a58', '#080c1c'],
        trees: ['#0d132b', '#070b1c', '#02040d']
      },
      sunset: {
        sky: ['#2e0918', '#5e1531', '#942b46', '#c9485b', '#4a1124'],
        trees: ['#3d0d1e', '#2b0714', '#1a030b']
      }
    }

    const palette = palettes[theme as keyof typeof palettes] || palettes.starry

    // 天空背景渐变
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    palette.sky.forEach((color, i) => {
      sky.addColorStop(i / (palette.sky.length - 1), color)
    })
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // 星空特有：绘制高密度星云与闪耀繁星
    if (theme === 'starry') {
      const nebula = ctx.createRadialGradient(w * 0.4, h * 0.35, 20, w * 0.4, h * 0.35, w * 0.5)
      nebula.addColorStop(0, 'rgba(139, 92, 246, 0.28)')
      nebula.addColorStop(0.4, 'rgba(59, 130, 246, 0.16)')
      nebula.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = nebula
      ctx.fillRect(0, 0, w, h)

      for (let i = 0; i < 450; i++) {
        const x = Math.random() * w
        const y = Math.random() * h * 0.7
        const size = Math.random() * 1.8 + 0.4
        const alpha = Math.random() * 0.8 + 0.2
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 地平线雾气带
    const horizonY = h * 0.58
    const fog = ctx.createLinearGradient(0, horizonY - h * 0.08, 0, horizonY + h * 0.06)
    fog.addColorStop(0, 'rgba(255,255,255,0)')
    fog.addColorStop(0.5, 'rgba(255,255,255,0.08)')
    fog.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = fog
    ctx.fillRect(0, horizonY - h * 0.08, w, h * 0.14)

    // 剪影山脊与树林层
    const layers = [
      { baseY: horizonY + 6, height: h * 0.09, color: palette.trees[0], trunks: 42, jitter: 0.5, alpha: 0.6 },
      { baseY: horizonY + 28, height: h * 0.16, color: palette.trees[1], trunks: 30, jitter: 0.7, alpha: 0.8 },
      { baseY: horizonY + 64, height: h * 0.26, color: palette.trees[2], trunks: 20, jitter: 1.0, alpha: 0.95 }
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
