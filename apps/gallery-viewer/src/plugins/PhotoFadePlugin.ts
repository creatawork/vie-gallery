import type { ViewerPlugin, ViewerContext, PhotoMesh } from '../core/types'
interface FadeState { start: number; from: number; to: number; duration: number; rise: number }
export class PhotoFadePlugin implements ViewerPlugin {
  name = 'PhotoFade'
  version = '2.0.0'
  private context: ViewerContext | null = null
  private states = new Map<PhotoMesh, FadeState>()
  private seen = new WeakSet<PhotoMesh>()
  private transitioning = false
  install(context: ViewerContext): void {
    this.context = context
    context.on('photos:loaded', this.handlePhotosLoaded)
    context.on('photo:texture-ready', this.handleTextureReady)
    context.on('photo:focus', this.handleFocus)
    context.on('photo:blur', this.handleBlur)
    context.on('webgl:lost', this.handleContextLost)
    this.handlePhotosLoaded(context.photos)
  }
  uninstall(): void {
    this.context?.off('photos:loaded', this.handlePhotosLoaded)
    this.context?.off('photo:texture-ready', this.handleTextureReady)
    this.context?.off('photo:focus', this.handleFocus)
    this.context?.off('photo:blur', this.handleBlur)
    this.context?.off('webgl:lost', this.handleContextLost)
    this.resetAllOpacity()
    this.context = null
    this.seen = new WeakSet()
  }
  update(_delta: number, elapsed: number): void {
    const photos = new Set(this.context?.photos)
    for (const [mesh, state] of this.states) {
      if (!photos.has(mesh)) { this.states.delete(mesh); continue }
      const progress = this.context?.reducedMotion() ? 1 : Math.min(1, Math.max(0, (elapsed - state.start) / state.duration))
      const eased = 1 - (1 - progress) ** 3
      this.setMeshOpacity(mesh, state.from + (state.to - state.from) * eased)
      mesh.userData.entranceOffsetY = progress === 1 || state.rise === 0 ? 0 : -state.rise * (1 - eased)
      if (progress === 1) this.states.delete(mesh)
    }
    this.syncTransition()
  }
  private handlePhotosLoaded = (photos: PhotoMesh[]): void => {
    if (!this.context) return
    const config = this.context.config.effects
    const fresh = photos.filter(mesh => !this.seen.has(mesh) && (!mesh.userData.textureState || mesh.userData.textureState === 'ready'))
    fresh.forEach((mesh, index) => {
      this.seen.add(mesh)
      if (this.context!.reducedMotion() || config.photoEntrance === 'none') {
        this.setMeshOpacity(mesh, 1); mesh.userData.entranceOffsetY = 0; return
      }
      this.setMeshOpacity(mesh, 0)
      const rise = config.photoEntrance === 'rise' ? 40 : 0
      mesh.userData.entranceOffsetY = -rise
      this.states.set(mesh, { start: this.context!.now() + Math.min(1, index * .05), from: 0, to: 1, duration: config.entranceDuration ?? .5, rise })
    })
    this.syncTransition()
  }
  private handleFocus = (data: { photo: PhotoMesh }) => {
    this.context?.photos.forEach(mesh => this.fadeTo(mesh, mesh === data.photo ? 1 : .6))
  }
  private handleTextureReady = (mesh: PhotoMesh) => this.handlePhotosLoaded([mesh])
  private handleBlur = () => this.context?.photos.forEach(mesh => this.fadeTo(mesh, 1))
  private handleContextLost = () => this.resetAllOpacity()
  fadeIn(mesh: PhotoMesh, duration = .5, targetOpacity = 1): void { this.fadeTo(mesh, targetOpacity, duration) }
  fadeOut(mesh: PhotoMesh, duration = .3): void { this.fadeTo(mesh, 0, duration) }
  fadeTo(mesh: PhotoMesh, targetOpacity: number, duration = .3): void {
    if (!this.context) return
    if (this.context.reducedMotion()) { this.setMeshOpacity(mesh, targetOpacity); return }
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    this.states.set(mesh, { start: this.context.now(), from: material.opacity, to: Math.max(0, Math.min(1, targetOpacity)), duration, rise: 0 })
    this.syncTransition()
  }
  private setMeshOpacity(mesh: PhotoMesh, opacity: number): void {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material.transparent) { material.transparent = true; material.needsUpdate = true }
      material.opacity = Math.max(0, Math.min(1, opacity))
    }
  }
  private syncTransition(): void {
    const active = this.states.size > 0
    if (active !== this.transitioning) { this.transitioning = active; this.context?.emit(active ? 'transition:start' : 'transition:end') }
  }
  setAllOpacity(opacity: number): void { this.context?.photos.forEach(mesh => { this.setMeshOpacity(mesh, opacity); mesh.userData.entranceOffsetY = 0 }) }
  resetAllOpacity(): void { this.setAllOpacity(1); this.states.clear(); this.syncTransition() }
}
