import * as THREE from 'three'

/** One decaying signal shared by lighting, atmosphere and particles. */
export class MotionAtmosphere {
  private energy = 0
  private impulse = 0
  private pointer = new THREE.Vector2(2, 2)
  private light = new THREE.PointLight('#bed7ff', 0, 1600, 1)
  private wheel = (event: WheelEvent) => { this.impulse = Math.min(1, this.impulse + Math.abs(event.deltaY) / 1100) }
  private move = (event: PointerEvent) => {
    const box = this.canvas.getBoundingClientRect()
    this.pointer.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1)
    if (event.buttons) this.impulse = Math.min(1, this.impulse + Math.hypot(event.movementX, event.movementY) / 160)
  }
  private leave = () => this.pointer.set(2, 2)
  constructor(private canvas: HTMLCanvasElement, private scene: THREE.Scene) {
    this.light.position.set(0, 160, 620)
    scene.add(this.light)
    scene.userData.motionPointer = this.pointer
    canvas.addEventListener('wheel', this.wheel, { passive: true })
    canvas.addEventListener('pointermove', this.move, { passive: true })
    canvas.addEventListener('pointerleave', this.leave)
  }
  update(delta: number, reduced: boolean) {
    const dt = Math.min(.1, delta)
    this.impulse *= Math.exp(-dt * 2.8)
    this.energy = THREE.MathUtils.damp(this.energy, reduced ? 0 : this.impulse, 5, dt)
    this.scene.userData.motionEnergy = this.energy
    this.light.intensity = this.energy * 1.8
  }
  dispose() {
    this.canvas.removeEventListener('wheel', this.wheel)
    this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerleave', this.leave)
    this.scene.remove(this.light)
    this.light.dispose()
    delete this.scene.userData.motionPointer
    delete this.scene.userData.motionEnergy
  }
}
