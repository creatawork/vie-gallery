import * as THREE from 'three'
import type { ViewerContext, ViewerPlugin } from '../core/types'
import { resolvePhotoArrangement } from '@vie/gallery-contracts'
import { stageArrangement } from '../lib/stageArrangements'
import { stageFraming } from '../lib/stageFraming'
import { PaperBook } from '../core/PaperBook'

/** A single progress value drives the photographs, framing, and visitor navigation. */
export class SpatialStagePlugin implements ViewerPlugin {
  name = 'SpatialStage'
  version = '1.0.0'
  private context!: ViewerContext
  private installed = false
  private canvas!: HTMLCanvasElement
  private cursor = 0
  private target = 0
  private autoplay = true
  private configuredAutoplay = true
  private suspended = false
  private theatreActive = false
  private immersive = false
  private hovered: number | null = null
  private moving = false
  private dwell = 0
  private lastIndex = -1
  private pointer = new THREE.Vector2()
  private drag: { id: number; x: number; y: number; target: number } | null = null
  private wheelAt = -Infinity
  private cameraPosition = new THREE.Vector3()
  private photoPosition = new THREE.Vector3()
  private rotation = new THREE.Euler()
  private quaternion = new THREE.Quaternion()
  private known = new WeakSet<THREE.Mesh>()
  private entrances = new WeakMap<THREE.Mesh, number>()
  private entranceSignature = ''
  private paths = new THREE.Group()
  private book: PaperBook | null = null

  install(context: ViewerContext) {
    this.installed = true
    this.context = context
    this.known = new WeakSet()
    this.entrances = new WeakMap()
    this.lastIndex = -1
    this.cursor = 0; this.target = 0; this.dwell = 0
    this.suspended = false; this.theatreActive = false; this.immersive = false; this.hovered = null; this.pointer.set(0, 0)
    this.canvas = context.renderer.domElement
    this.autoplay = this.configuredAutoplay = !!context.config.camera?.autoRotate
    this.entranceSignature = JSON.stringify([context.config.effects.photoEntrance, context.config.effects.entranceDuration])
    context.on('stage:step', this.step)
    context.on('stage:reset', this.reset)
    context.on('stage:autoplay', this.setAutoplay)
    context.on('stage:suspend', this.setSuspended)
    context.on('stage:immersive', this.setImmersive)
    context.on('theatre:hover', this.hover)
    context.on('theatre:active', this.setTheatreActive)
    context.on('photos:loaded', this.photosChanged)
    context.on('config:update', this.configChanged)
    this.canvas.addEventListener('pointerdown', this.down)
    this.canvas.addEventListener('pointermove', this.move)
    this.canvas.addEventListener('pointerup', this.up)
    this.canvas.addEventListener('pointercancel', this.cancel)
    this.canvas.addEventListener('pointerleave', this.leave)
    this.canvas.addEventListener('wheel', this.wheel, { passive: false })
    this.canvas.addEventListener('keydown', this.key)
    // Fine orbital traces give the eye a continuous depth reference between works.
    for (let ring = 0; ring < 2; ring++) {
      const points = Array.from({ length: 193 }, (_, i) => {
        const a = i / 192 * Math.PI * 2
        return new THREE.Vector3(Math.sin(a) * (680 + ring * 55), Math.sin(a) * 175 - 70 - ring * 20, Math.cos(a) * 420 - 420)
      })
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color:ring ? '#ccb493' : '#8ba399',transparent:true,opacity:ring ? .09 : .15,depthWrite:false}))
      this.paths.add(line)
    }
    context.addToScene(this.paths)
    this.update(1, 0)
  }

  private step = (direction: number) => {
    if (this.suspended || this.theatreActive || this.context.photos.length < 2 || !Number.isFinite(direction) || direction === 0) return
    this.target = Math.round(this.target) + Math.sign(direction)
    this.dwell = 0
    this.context.emit('stage:interaction')
  }
  private reset = () => { this.target = 0; this.pointer.set(0, 0); this.dwell = 0 }
  private setImmersive = (enabled: boolean) => { this.immersive = enabled; this.pointer.set(0, 0) }
  private setAutoplay = (enabled: boolean) => { this.autoplay = enabled; this.dwell = 0 }
  private setTheatreActive = (active: boolean) => {
    this.theatreActive = active; this.cancel(); this.dwell = 0
    if (active) {
      this.book?.hide(); this.paths.visible = false
      if (this.moving) { this.moving = false; this.context.emit('transition:end') }
    } else this.known = new WeakSet()
  }
  private setSuspended = (suspended: boolean) => {
    this.suspended = suspended; this.dwell = 0
    if (suspended) { this.cancel(); this.target = Math.round(this.target); this.pointer.set(0, 0) }
  }
  private configChanged = () => {
    const enabled = !!this.context.config.camera?.autoRotate
    if (enabled !== this.configuredAutoplay) this.setAutoplay(enabled)
    this.configuredAutoplay = enabled
    const signature = JSON.stringify([this.context.config.effects.photoEntrance, this.context.config.effects.entranceDuration])
    if (signature !== this.entranceSignature) {
      this.entranceSignature = signature
      this.entrances = new WeakMap()
    }
  }
  private hover = (index: number | null) => { this.hovered = index }
  private photosChanged = () => { this.lastIndex = -1; this.dwell = 0 }
  private down = (event: PointerEvent) => {
    if (this.suspended || this.theatreActive || this.drag || this.context.photos.length < 2 || event.button !== 0 || event.isPrimary === false) return
    this.drag = { id:event.pointerId, x:event.clientX, y:event.clientY, target:this.target }
    this.canvas.setPointerCapture(event.pointerId)
    this.dwell = 0
  }
  private move = (event: PointerEvent) => {
    if (this.suspended || this.theatreActive) return
    const box = this.canvas.getBoundingClientRect()
    if (!box.width || !box.height) return
    this.pointer.set((event.clientX - box.left) / box.width - .5, (event.clientY - box.top) / box.height - .5)
    if (!this.drag || event.pointerId !== this.drag.id) return
    const dx = this.drag.x - event.clientX, dy = this.drag.y - event.clientY
    this.target = this.drag.target + (Math.abs(dx) > Math.abs(dy) ? dx : dy) / Math.max(130, box.width * .25)
    this.context.emit('stage:interaction')
  }
  private up = (event: PointerEvent) => {
    if (event.pointerId !== this.drag?.id) return
    this.target = Math.round(this.target)
    this.cancel()
  }
  private cancel = () => {
    if (this.drag && this.canvas.hasPointerCapture(this.drag.id)) this.canvas.releasePointerCapture(this.drag.id)
    this.drag = null
  }
  private leave = () => { this.pointer.set(0, 0); this.hovered = null }
  private wheel = (event: WheelEvent) => {
    if (this.suspended || this.theatreActive || this.context.photos.length < 2) return
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (Math.abs(delta) < 3 || performance.now() - this.wheelAt < 420) return
    this.wheelAt = performance.now()
    this.step(delta)
  }
  private key = (event: KeyboardEvent) => {
    if (this.suspended || this.theatreActive || !this.context.photos.length || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); this.step(event.key === 'ArrowRight' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault(); this.context.emit('stage:open', this.lastIndex)
    }
  }

  update(delta: number, elapsed: number) {
    if (this.theatreActive) return
    const context = this.context, count = context.photos.length
    const camera = context.camera as THREE.PerspectiveCamera
    const mobile = camera.aspect < .85
    const reduced = context.reducedMotion()
    const dt = Math.min(delta, .05)
    const transition = context.config.layout.transition
    const instant = reduced || transition?.style === 'none'
    const blend = instant ? 1 : 1 - Math.exp(-dt * 6 / (transition?.duration ?? 1.2))
    const speed = context.config.camera?.rotateSpeed ?? .5
    if (!this.suspended && this.autoplay && !reduced && !this.drag && count > 1) {
      // Dwell follows active time even when rendering is throttled to 20 fps.
      // The smaller interpolation step below is only for transform stability.
      this.dwell += Math.min(delta, .1) * speed * 2 * (this.hovered !== null ? .15 : 1)
      if (this.dwell > 5.5) { this.target = Math.round(this.target) + 1; this.dwell = 0 }
    }
    this.cursor += (this.target - this.cursor) * blend
    const moving = Math.abs(this.target - this.cursor) > .001
    if (moving !== this.moving) {
      this.moving = moving
      context.emit(moving ? 'transition:start' : 'transition:end')
    }
    // Normalize both values together so a long exhibition never accumulates huge coordinates.
    if (count && Math.abs(this.cursor) > count * 10) {
      const cycles = Math.trunc(this.cursor / count) * count
      this.cursor -= cycles; this.target -= cycles
    }
    const mode = context.config.layout.mode
    const params = context.config.layout.params
    const arrangement = resolvePhotoArrangement(context.config)
    const canvasHeight = this.canvas.clientHeight || 800
    const canvasWidth = this.canvas.clientWidth || canvasHeight * camera.aspect
    const preview = this.canvas.dataset?.presentation === 'preview'
    const frame = stageFraming(canvasWidth, canvasHeight, camera.fov, (mobile ? 1040 : 930) - 180, this.immersive, preview)
    if (arrangement === 'book') {
      if (!this.book) this.book = new PaperBook(context.scene)
      const distance = mobile ? 1040 : 1120
      this.cameraPosition.set(this.pointer.x * 12 * (reduced ? 0 : 1), mobile ? 48 : 55, distance)
      camera.position.lerp(this.cameraPosition, blend)
      camera.lookAt(0, 24, 30)
      const fullH = 2 * Math.tan(camera.fov * Math.PI / 360) * (distance - 60)
      const canvasH = canvasHeight
      this.book.render(context.photos, this.cursor, fullH * camera.aspect * .94,
        fullH * Math.max(.38, (canvasH - (preview ? 80 : this.immersive ? 100 : mobile ? 330 : 230)) / canvasH), params?.scale ?? 1)
      this.paths.visible = false
      this.reportIndex(count)
      return
    }
    this.book?.hide()
    const parallax = reduced || this.suspended ? 0 : 1
    this.cameraPosition.set(this.pointer.x * 32 * parallax, -this.pointer.y * 22 * parallax, mobile ? 1040 : 930)
    camera.position.lerp(this.cameraPosition, blend)
    camera.lookAt(0, mobile ? 12 : 0, -100)
    this.paths.visible = count > 2 && !mobile && arrangement !== 'tunnel'
    this.paths.rotation.z += ((mode === 'helix' ? -.12 : mode === 'grid' ? .14 : 0) - this.paths.rotation.z) * blend

    for (let i = 0; i < count; i++) {
      const mesh = context.photos[i]
      const d = ((i - this.cursor + count / 2) % count + count) % count - count / 2
      const a = Math.abs(d)
      // The wrap happens outside the visible ribbon. Opacity hides even a three-photo seam.
      const edge = count > 2 ? Math.min(1, Math.max(0, (count / 2 - a) * 2)) : 1
      const presence = arrangement === 'tunnel'
        ? Math.min(1, Math.max(0, d + .6) * 4, Math.max(0, 4.5 - d)) * edge
        : Math.min(1, Math.max(0, 5 - a)) * edge
      let { x, y, z, ry, rz } = stageArrangement(d, arrangement, mobile, params)
      if (count === 1) { x = 0; y = 0; z = 180; ry = 0; rz = 0 }
      y += frame.centerY
      if (!reduced && !this.suspended && context.config.effects.photoFloat) {
        y += Math.sin(elapsed * (context.config.effects.floatSpeed ?? 1) + i) * 5 * (context.config.effects.floatAmplitude ?? 1)
      }
      if (!this.entrances.has(mesh)) this.entrances.set(mesh, elapsed)
      const entranceProgress = reduced || context.config.effects.photoEntrance === 'none' ? 1
        : Math.min(1, Math.max(0, (elapsed - this.entrances.get(mesh)!) / (context.config.effects.entranceDuration ?? .5)))
      const entrance = 1 - Math.pow(1 - entranceProgress, 3)
      if (context.config.effects.photoEntrance === 'rise') y -= (1 - entrance) * 80
      this.photoPosition.set(x, y, z)
      this.rotation.set(0, ry, rz)
      this.quaternion.setFromEuler(this.rotation)
      const fresh = !this.known.has(mesh)
      if (fresh) { mesh.position.copy(this.photoPosition); mesh.quaternion.copy(this.quaternion); this.known.add(mesh) }
      else { mesh.position.lerp(this.photoPosition, blend); mesh.quaternion.slerp(this.quaternion, blend) }
      const geometry = mesh.geometry as THREE.PlaneGeometry
      const width = geometry.parameters.width || 80, height = geometry.parameters.height || 60
      const fit = Math.min(frame.width / width, frame.height / height)
      const hover = !reduced && !this.drag && !this.suspended && this.hovered === i ? 1.028 : 1
      const scale = fit * (params?.scale ?? 1) * (arrangement === 'tunnel' ? 1.12 : 1 - Math.min(a, 4) * .12) * hover
      mesh.scale.setScalar(fresh ? scale : THREE.MathUtils.lerp(mesh.scale.x, scale, blend))
      mesh.userData.layoutScale = mesh.scale.x
      mesh.visible = presence > .005
      const material = mesh.material as THREE.MeshStandardMaterial
      const depth = .36 + .64 * Math.exp(-a * .72)
      material.opacity = presence * entrance
      if (!material.transparent) { material.transparent = true; material.needsUpdate = true }
      // Preserve the photograph's own color and contrast through every viewing angle.
      material.color.setScalar(.28 * depth)
      material.emissiveIntensity = .85 * depth
      if (material.toneMapped) { material.toneMapped = false; material.needsUpdate = true }
      for (const child of mesh.children) {
        if (!(child instanceof THREE.Mesh) || child.material === material) continue
        const mat = child.material as THREE.MeshStandardMaterial
        mat.transparent = true; mat.opacity = presence * entrance
        child.scale.set((width + .65) / (width + 2), (height + .65) / (height + 2), 1)
      }
    }
    this.reportIndex(count)
  }

  private reportIndex(count: number) {
    const index = count ? ((Math.round(this.cursor) % count) + count) % count : 0
    if (index !== this.lastIndex) {
      this.lastIndex = index
      this.context.emit('stage:change', { index, count })
    }
  }

  uninstall() {
    if (!this.installed) return
    this.installed = false
    const context = this.context
    if (this.moving) { this.moving = false; context.emit('transition:end') }
    context.off('stage:step', this.step); context.off('stage:reset', this.reset)
    context.off('stage:autoplay', this.setAutoplay); context.off('stage:suspend', this.setSuspended)
    context.off('stage:immersive', this.setImmersive)
    context.off('theatre:hover', this.hover); context.off('photos:loaded', this.photosChanged)
    context.off('theatre:active', this.setTheatreActive)
    context.off('config:update', this.configChanged)
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel)
    this.canvas.removeEventListener('pointerleave', this.leave); this.canvas.removeEventListener('wheel', this.wheel)
    this.canvas.removeEventListener('keydown', this.key)
    this.cancel()
    this.book?.dispose(); this.book = null
    for (const mesh of context.photos) {
      mesh.visible = true
      const material = mesh.material as THREE.MeshStandardMaterial
      material.opacity = 1; material.color.set('#ffffff'); material.emissiveIntensity = .25; material.toneMapped = true; material.needsUpdate = true
      for (const child of mesh.children) if (child instanceof THREE.Mesh) { (child.material as THREE.Material).opacity = 1; child.scale.setScalar(1) }
    }
    this.paths.removeFromParent()
    for (const line of this.paths.children as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[]) { line.geometry.dispose(); line.material.dispose() }
    this.paths.clear()
  }
}
