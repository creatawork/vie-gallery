import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * SkyDome Plugin - 生产级沉浸式天穹与大气环境插件
 *
 * 支持 360° 天空穹顶、星空微速漫游、大气散射光晕与高动态全景材质
 */
export class SkyDomePlugin implements ViewerPlugin {
  name = 'SkyDome'
  version = '2.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private mesh: THREE.Mesh | null = null
  private material: THREE.MeshBasicMaterial | null = null
  private canvas: HTMLCanvasElement | null = null
  private textureLoader = new THREE.TextureLoader()
  private currentTheme = 'starry'
  private rotationSpeed = 0.008

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.background

    if (config.type !== 'sky') return

    const radius = 3800
    // 球体几何体 (加大细分保证视口各角度圆润平滑)
    const geometry = new THREE.SphereGeometry(radius, 64, 48)

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
    this.currentTheme = config.sky?.theme || 'starry'
    this.applyTheme(this.currentTheme)

    // 只监听 config:update 事件，避免重复触发
    context.on('config:update', this.handleConfigChange)
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

    this.context?.off('config:update', this.handleConfigChange)
    this.context = null
    this.mesh = null
    this.material = null
  }

  update(delta: number): void {
    if (!this.context || !this.mesh) return

    // 1. 天穹球心跟随相机，制造无垠深空视差
    this.mesh.position.copy(this.context.camera.position)

    // 2. 空间天穹微速自然自转（星转斗移之美）
    this.mesh.rotation.y += delta * this.rotationSpeed
  }

  private handleConfigChange = (data: any): void => {
    const config = data.background
    if (config?.type === 'sky' && config.sky?.theme) {
      if (config.sky.theme !== this.currentTheme) {
        this.currentTheme = config.sky.theme
        this.applyTheme(this.currentTheme)
      }
    }
  }

  private applyTheme(theme: string): void {
    if (!this.material) return

    // 设定不同主题的自转角速度
    if (theme === 'starry') {
      this.rotationSpeed = 0.008
    } else if (theme === 'ocean') {
      this.rotationSpeed = 0.004
    } else {
      this.rotationSpeed = 0.003
    }

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
        // Fallback: 使用超高清程序化全景生成器
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
        sky: ['#040a06', '#09180f', '#13281c', '#1e3d2b', '#0f2418', '#07120b'],
        horizon: 'rgba(34, 197, 94, 0.15)',
        stars: 120
      },
      ocean: {
        sky: ['#030914', '#081a30', '#113358', '#1a4e80', '#0f2f50', '#051120'],
        horizon: 'rgba(56, 189, 248, 0.22)',
        stars: 180
      },
      starry: {
        sky: ['#020308', '#060a18', '#0f1632', '#18224a', '#0a0f24', '#03050c'],
        horizon: 'rgba(168, 85, 247, 0.2)',
        stars: 550
      },
      sunset: {
        sky: ['#1c050e', '#3d0c20', '#691834', '#9e2d45', '#451021', '#1a040d'],
        horizon: 'rgba(251, 146, 60, 0.35)',
        stars: 80
      }
    }

    const palette = palettes[theme as keyof typeof palettes] || palettes.starry

    // 1. 大气天顶渐变
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    palette.sky.forEach((color, i) => {
      sky.addColorStop(i / (palette.sky.length - 1), color)
    })
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // 2. 地平线散射光晕 (Atmospheric Horizon Glow)
    const horizonGlow = ctx.createLinearGradient(0, h * 0.45, 0, h * 0.75)
    horizonGlow.addColorStop(0, 'rgba(0,0,0,0)')
    horizonGlow.addColorStop(0.5, palette.horizon)
    horizonGlow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = horizonGlow
    ctx.fillRect(0, h * 0.45, w, h * 0.3)

    // 3. 星空与星云分层渲染
    if (theme === 'starry') {
      const nebula1 = ctx.createRadialGradient(w * 0.35, h * 0.32, 30, w * 0.35, h * 0.32, w * 0.45)
      nebula1.addColorStop(0, 'rgba(168, 85, 247, 0.32)')
      nebula1.addColorStop(0.5, 'rgba(59, 130, 246, 0.18)')
      nebula1.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = nebula1
      ctx.fillRect(0, 0, w, h)

      const nebula2 = ctx.createRadialGradient(w * 0.75, h * 0.28, 20, w * 0.75, h * 0.28, w * 0.35)
      nebula2.addColorStop(0, 'rgba(236, 72, 153, 0.22)')
      nebula2.addColorStop(0.6, 'rgba(147, 51, 234, 0.12)')
      nebula2.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = nebula2
      ctx.fillRect(0, 0, w, h)
    } else if (theme === 'sunset') {
      // 日落暖光太阳轮廓
      const sun = ctx.createRadialGradient(w * 0.5, h * 0.52, 10, w * 0.5, h * 0.52, w * 0.25)
      sun.addColorStop(0, 'rgba(254, 215, 170, 0.55)')
      sun.addColorStop(0.4, 'rgba(249, 115, 22, 0.35)')
      sun.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, w, h)
    }

    // 4. 繁星点缀
    for (let i = 0; i < palette.stars; i++) {
      const x = Math.random() * w
      const y = Math.random() * h * 0.65
      const size = Math.random() * 1.8 + 0.3
      const alpha = Math.random() * 0.8 + 0.2
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }

    return canvas
  }
}
