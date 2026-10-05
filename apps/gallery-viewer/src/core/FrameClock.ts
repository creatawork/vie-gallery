export class FrameClock {
  private last: number | null = null
  private seconds = 0
  private suspended = true
  get elapsed(): number { return this.seconds }
  tick(nowMs: number): { delta: number; elapsed: number } {
    if (this.suspended) return { delta: 0, elapsed: this.seconds }
    const delta = this.last === null ? 0 : Math.min(.1, Math.max(0, (nowMs - this.last) / 1000))
    this.last = nowMs
    this.seconds += delta
    return { delta, elapsed: this.seconds }
  }
  suspend(): void { this.suspended = true; this.last = null }
  resume(nowMs: number): void { this.last = nowMs; this.suspended = false }
}
