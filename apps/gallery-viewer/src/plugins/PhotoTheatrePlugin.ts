import * as THREE from 'three'
import type { PhotoMesh, ViewerContext, ViewerPlugin } from '../core/types'
import { QUALITY_BUDGETS } from '../core/QualityController'
import { PaperBook } from '../core/PaperBook'
import { stageFraming } from '../lib/stageFraming'
import { createTheatrePoses, showCueAt, SHOW_DURATION, type TheatreCommand, type TheatreMode, type TheatrePose, type TheatreState } from '../lib/photoTheatre'

interface Move {
  photo: PhotoMesh; pose: TheatrePose; from: THREE.Vector3; rotation: THREE.Quaternion
  toRotation: THREE.Quaternion; scale: number; toScale: number; age: number; delay: number; duration: number
  arc: THREE.Vector3
}

/** Temporary visitor choreography. It never writes or changes the published viewer config. */
export class PhotoTheatrePlugin implements ViewerPlugin {
  name = 'PhotoTheatre'
  version = '1.0.0'
  private context: ViewerContext | null = null
  private state: TheatreState = { active: false, mode: 'cloud', status: 'idle', elapsed: 0, offset: 0, indices: [], reducedMotion: false }
  private moves: Move[] = []
  private counted = false
  private expanded = false
  private returnMode: TheatreMode | null = null
  private returnOffset = 0
  private layoutSignature = ''
  private pendingFocus: number | null = null
  private lastCue = -1
  private lastReportedSecond = -1
  private lastRingBeat = 0
  private floatTime = 0
  private poses: TheatrePose[] = []
  private book: PaperBook | null = null
  private bookCursor = 0
  private bookTarget = 0
  private lastBookBeat = 0
  private space: { width: number; height: number; limit?: number } = { width: 1100, height: 570 }
  private centerY = 0

  private layoutKey(): string {
    const layout = this.context?.config.layout
    return JSON.stringify([layout?.mode, layout?.params])
  }

  install(context: ViewerContext): void {
    this.context = context
    this.layoutSignature = this.layoutKey()
    context.on('theatre:command', this.command)
    context.on('theatre:hover', this.hover)
    context.on('photos:loaded', this.photosLoaded)
    context.on('photo:texture-ready', this.textureReady)
    context.on('photo:blur', this.blur)
    context.on('config:update', this.configUpdated)
    context.on('webgl:lost', this.exit)
  }
  uninstall(): void {
    this.exit()
    for (const [event, handler] of [
      ['theatre:command', this.command], ['theatre:hover', this.hover], ['photos:loaded', this.photosLoaded], ['photo:texture-ready', this.textureReady],
      ['photo:blur', this.blur], ['config:update', this.configUpdated], ['webgl:lost', this.exit]
    ] as const) this.context?.off(event, handler)
    this.context = null
    this.book?.dispose(); this.book = null
  }
  snapshot(): TheatreState { return { ...this.state, indices: [...this.state.indices] } }
  private report(): void { this.context?.emit('theatre:state', this.snapshot()) }
  private syncActivity(): void {
    const active = this.state.active && (this.state.status === 'playing' || ((this.moves.length > 0 || this.state.mode === 'book' && Math.abs(this.bookCursor - this.bookTarget) > .001) && this.state.status !== 'paused'))
    if (active !== this.counted) {
      this.counted = active
      this.context?.emit(active ? 'transition:start' : 'transition:end')
    }
  }
  private measure(): void {
    if (!this.context) return
    const camera = this.context.camera as THREE.PerspectiveCamera
    const canvas = this.context.renderer.domElement
    const height = canvas.clientHeight || 800, width = canvas.clientWidth || 1200
    const framing = stageFraming(width, height, camera.fov || 50, 1000, false, false, canvas.dataset?.hasMore ? 56 : 0)
    this.centerY = framing.centerY
    this.space = { width: framing.width, height: framing.height, limit: this.textureCapacity() }
  }
  private textureCapacity(): number | undefined {
    if (!this.context) return
    let largest = 0
    for (const photo of this.context.photos) {
      const material = (Array.isArray(photo.material) ? photo.material[0] : photo.material) as THREE.MeshStandardMaterial
      const image = material.map?.image as { width?: number; height?: number } | undefined
      if (image?.width && image.height) largest = Math.max(largest, image.width * image.height * 4 * 4 / 3)
    }
    // Leave room for transitions and the backdrop without increasing the existing texture budget.
    return largest ? Math.max(1, Math.floor(QUALITY_BUDGETS[this.context.getQuality()].bytes * .8 / largest)) : undefined
  }
  private textureReady = (): void => {
    if (!this.state.active) return
    const limit = this.textureCapacity()
    if (limit !== undefined && this.state.indices.length > limit) this.present(this.state.mode, .45)
  }
  private command = (command: TheatreCommand): void => {
    if (!this.context || !this.context.photos.length) return
    this.state.reducedMotion = this.context.reducedMotion()
    switch (command.type) {
      case 'exit': this.exit(); return
      case 'pause':
        if (this.state.status === 'playing') this.state.status = 'paused'
        this.syncActivity(); this.report(); return
      case 'play':
        this.pendingFocus = null
        if (this.state.reducedMotion) { this.state.status = 'idle'; this.present('cloud'); return }
        if (this.state.status !== 'paused') {
          this.state.elapsed = 0; this.state.offset = 0; this.lastCue = 0; this.lastRingBeat = 0; this.returnMode = null
          this.context.emit('photo:blur')
          this.state.status = 'playing'; this.present('cloud')
        } else { this.state.status = 'playing'; this.syncActivity(); this.report() }
        return
      case 'mode':
        this.state.status = 'idle'; this.returnMode = null; this.pendingFocus = null; this.expanded = false
        this.context.emit('photo:blur')
        this.present(command.mode); return
      case 'step': {
        this.state.status = 'idle'; this.pendingFocus = null
        if (this.state.mode === 'book') {
          this.bookTarget = Math.round(this.bookTarget) + Math.sign(command.direction)
          this.state.offset = ((this.bookTarget % this.context.photos.length) + this.context.photos.length) % this.context.photos.length
          if (this.state.reducedMotion) this.bookCursor = this.bookTarget
          this.renderBook(); this.syncActivity(); this.report(); return
        }
        const sequential = ['ring', 'fold', 'ribbon', 'stack', 'focus'].includes(this.state.mode)
        const stride = sequential ? 1 : Math.max(1, this.state.indices.length)
        this.state.offset = ((this.state.offset + Math.sign(command.direction) * stride) % this.context.photos.length + this.context.photos.length) % this.context.photos.length
        this.present(this.state.mode); return
      }
      case 'focus':
        if (!Number.isInteger(command.index) || !this.context.photos[command.index]) return
        this.state.status = 'idle'
        if (this.state.mode !== 'focus') { this.returnMode = this.state.mode; this.returnOffset = this.state.offset }
        this.state.offset = command.index; this.pendingFocus = command.index
        this.context.emit('photo:focus', { photo: this.context.photos[command.index] })
        this.present('focus', .75); return
      case 'blur': this.blur(); return
    }
  }
  private blur = (): void => {
    if (!this.state.active || !this.returnMode) return
    const mode = this.returnMode; this.returnMode = null; this.pendingFocus = null
    this.state.offset = this.returnOffset
    this.present(mode, .85)
  }
  private hover = (index: number | null): void => {
    if (!this.state.active || this.state.mode !== 'stack' || this.state.status === 'playing' || this.state.status === 'paused') return
    const expanded = index !== null
    if (expanded !== this.expanded) { this.expanded = expanded; this.present('stack', .45) }
  }
  private configUpdated = (): void => {
    if (!this.context) return
    const signature = this.layoutKey()
    if (signature !== this.layoutSignature) { this.layoutSignature = signature; this.exit(); return }
    this.state.reducedMotion = this.context.reducedMotion()
    if (this.state.reducedMotion) { this.state.status = 'idle'; this.finishMoves(); this.syncActivity() }
    if (this.state.active) this.report()
  }
  private photosLoaded = (): void => {
    if (this.state.active) this.present(this.state.mode, .7)
  }
  onResize(): void { if (this.state.active) this.present(this.state.mode, .35) }

  private present(mode: TheatreMode, duration = 1.45): void {
    if (!this.context) return
    const previous = this.state.mode
    if (!this.state.active) {
      this.state.active = true
      this.context.emit('theatre:active', true)
      this.context.emit('photo:blur')
    }
    this.state.mode = mode
    this.measure()
    if (mode === 'book') {
      this.moves = []
      this.bookCursor = this.bookTarget = this.state.offset
      this.lastBookBeat = 0
      this.renderBook(); this.syncActivity(); this.report(); return
    }
    this.book?.hide()
    const ratios = this.context.photos.map(photo => {
      photo.geometry.computeBoundingBox()
      const box = photo.geometry.boundingBox!
      return (box.max.x - box.min.x) / Math.max(.01, box.max.y - box.min.y)
    })
    this.poses = createTheatrePoses(ratios, mode, this.space, this.state.offset, this.expanded)
      .map(pose => ({ ...pose, y: pose.y + this.centerY }))
    const count = this.poses.length
    this.state.indices = this.poses.filter(p => p.visible)
      .sort((a, b) => (a.index - this.state.offset + count) % count - (b.index - this.state.offset + count) % count)
      .map(p => p.index)
    this.moves = []
    this.context.photos.forEach((photo, index) => {
      const pose = this.poses[index]
      if (!photo.visible && !pose.visible) return
      const wasVisible = photo.visible
      photo.visible = true
      photo.userData.entranceOffsetY = 0
      const box = photo.geometry.boundingBox!
      const toScale = pose.scale * 80 / Math.max(.01, box.max.x - box.min.x)
      if (!wasVisible) { photo.position.set(pose.x, pose.y - this.space.height * .14, -180); photo.scale.setScalar(toScale * .75) }
      const from = photo.position.clone()
      const arc = new THREE.Vector3()
      if (mode === 'ring') arc.set(-from.y * .22, from.x * .12, 110)
      else if (mode === 'tunnel') arc.set(Math.sin(index * 1.42) * this.space.width * .28, Math.cos(index * 1.42) * this.space.height * .3, 520)
      else if (mode === 'fold' || mode === 'ribbon') arc.set(0, Math.sin(index * .7) * this.space.height * .13, -70)
      else if (mode === 'stack' || mode === 'fan') arc.set(0, 65, index * 3)
      else if (mode === 'cloud') arc.set(Math.sin(index * 2.4) * 65, 45, 50)
      else if (mode === 'wall') arc.set(0, Math.sin(index % 6) * 70, 0)
      const order = mode === 'ring' ? index / Math.max(1, this.poses.length) : mode === 'wall' ? (index % 6) / 6 : (index % 7) / 7
      this.moves.push({ photo, pose, from, rotation: photo.quaternion.clone(),
        toRotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rx, pose.ry, pose.rz)),
        scale: photo.scale.x, toScale, age: 0, delay: mode === 'focus' ? 0 : order * .28,
        duration: previous === 'focus' ? .85 : duration, arc })
    })
    if (this.context.reducedMotion()) this.finishMoves()
    this.syncActivity(); this.report()
  }
  private renderBook(): void {
    if (!this.context) return
    if (!this.book) this.book = new PaperBook(this.context.scene)
    this.book.render(this.context.photos, this.bookCursor, this.space.width, this.space.height)
    this.book.group.position.y = this.centerY
    const count = this.context.photos.length
    this.state.indices = Array.from(new Set([this.state.offset, (this.state.offset - 1 + count) % count, (this.state.offset + 1) % count]))
  }
  private finishMoves(): void {
    for (const m of this.moves) {
      m.photo.position.set(m.pose.x, m.pose.y, m.pose.z)
      m.photo.quaternion.copy(m.toRotation)
      m.photo.scale.setScalar(m.toScale); m.photo.userData.layoutScale = m.toScale
      m.photo.visible = m.pose.visible
    }
    this.moves = []
    if (this.pendingFocus !== null) {
      const index = this.pendingFocus; this.pendingFocus = null
      this.context?.emit('theatre:focused', index)
    }
  }
  update(delta: number, _elapsed: number): void {
    if (!this.context || !this.state.active || this.state.status === 'paused') return
    if (this.state.status === 'playing') {
      this.state.elapsed = Math.min(SHOW_DURATION, this.state.elapsed + delta)
      const cue = showCueAt(this.state.elapsed)
      if (cue.at !== this.lastCue) { this.lastCue = cue.at; this.present(cue.mode, cue.mode === 'focus' ? .8 : 1.5) }
      if (cue.mode === 'ring') {
        const beat = Math.floor((this.state.elapsed - cue.at) / 2)
        if (beat > this.lastRingBeat) {
          this.lastRingBeat = beat
          this.state.offset = (this.state.offset + 1) % this.context.photos.length
          this.present('ring', 1.6)
        }
      }
      if (cue.mode === 'book') {
        const beat = Math.floor((this.state.elapsed - cue.at) / 2.3)
        if (beat > this.lastBookBeat) {
          this.bookTarget += beat - this.lastBookBeat; this.lastBookBeat = beat
          this.state.offset = this.bookTarget % this.context.photos.length
        }
      }
      if (this.state.elapsed >= SHOW_DURATION) this.state.status = 'finished'
      const second = Math.floor(this.state.elapsed)
      if (second !== this.lastReportedSecond) { this.lastReportedSecond = second; this.report() }
    }
    if (this.state.mode === 'book') {
      const distance = this.bookTarget - this.bookCursor
      // Bounded angular speed keeps a full page turn legible; a fast swipe can queue more pages.
      this.bookCursor += this.context.reducedMotion() ? distance : Math.sign(distance) * Math.min(Math.abs(distance), delta * .78)
      this.renderBook(); this.syncActivity(); return
    }
    if (this.context.reducedMotion()) this.finishMoves()
    for (const m of this.moves) {
      m.age += delta
      const progress = Math.min(1, Math.max(0, (m.age - m.delay) / m.duration))
      const t = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
      m.photo.position.set(
        THREE.MathUtils.lerp(m.from.x, m.pose.x, t) + Math.sin(Math.PI * t) * m.arc.x,
        THREE.MathUtils.lerp(m.from.y, m.pose.y, t) + Math.sin(Math.PI * t) * m.arc.y,
        THREE.MathUtils.lerp(m.from.z, m.pose.z, t) + Math.sin(Math.PI * t) * m.arc.z)
      m.photo.quaternion.slerpQuaternions(m.rotation, m.toRotation, t)
      m.photo.scale.setScalar(THREE.MathUtils.lerp(m.scale, m.toScale, t))
    }
    if (this.moves.length && this.moves.every(m => m.age >= m.duration + m.delay)) this.finishMoves()
    if (!this.moves.length && this.state.mode === 'cloud' && this.context.config.effects.photoFloat !== false && !this.context.reducedMotion()) {
      this.floatTime += delta
      for (const pose of this.poses) if (pose.visible) {
        const photo = this.context.photos[pose.index]
        photo.position.x = pose.x + Math.sin(this.floatTime * .55 + pose.index * 1.7) * 3
        photo.position.y = pose.y + Math.cos(this.floatTime * .7 + pose.index * 2.3) * 4
      }
    }
    this.syncActivity()
  }
  private exit = (): void => {
    if (!this.state.active) return
    this.moves = []; this.pendingFocus = null; this.returnMode = null; this.poses = []
    this.book?.hide()
    this.state = { ...this.state, active: false, status: 'idle', elapsed: 0, indices: [] }
    this.context?.photos.forEach(photo => { photo.visible = true; photo.userData.entranceOffsetY = 0 })
    this.syncActivity()
    this.context?.emit('photo:blur')
    this.context?.emit('theatre:active', false)
    this.report()
  }
}
