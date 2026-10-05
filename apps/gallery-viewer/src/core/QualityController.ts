import type { ViewerQuality } from '@vie/gallery-contracts'
import type { TextureBudget } from './TexturePool'
export type Quality = ViewerQuality
export interface QualitySample { nowMs: number; fps: number; idle: boolean; hidden: boolean; loading: boolean; transitioning: boolean; contextLost: boolean }
export interface QualityDecision { quality: Quality; fallback2D: boolean; reason: string | null }
export const QUALITY_BUDGETS: Record<Quality, TextureBudget & { dpr: number; particles: number; postScale: number }> = {
  low: { dpr: 1, maxEdge: 512, bytes: 32 * 1024 ** 2, concurrent: 2, resident: 32, particles: 200, postScale: .5 },
  mid: { dpr: 1.5, maxEdge: 1024, bytes: 64 * 1024 ** 2, concurrent: 3, resident: 64, particles: 700, postScale: .75 },
  high: { dpr: 2, maxEdge: 2048, bytes: 128 * 1024 ** 2, concurrent: 4, resident: 96, particles: 1600, postScale: 1 }
}
const tiers: Quality[] = ['low', 'mid', 'high']
export function initialQuality(requested: Quality | 'auto', lowEnd: boolean): Quality { return requested === 'auto' ? lowEnd ? 'low' : 'mid' : requested }

export class QualityController {
  private bad = 0
  private good = 0
  private lowSeconds = 0
  private lastChange = -Infinity
  private lastSample: number
  private reason: string | null = null
  constructor(private quality: Quality, private ceiling: Quality, nowMs: number) { this.lastSample = nowMs }
  reset(nowMs: number): void { this.bad = 0; this.good = 0; this.lowSeconds = 0; this.lastSample = nowMs }
  sample(sample: QualitySample): QualityDecision {
    const elapsedMs = sample.nowMs - this.lastSample
    if (sample.idle || sample.hidden || sample.loading || sample.transitioning || sample.contextLost || !Number.isFinite(sample.fps) || sample.fps < 0) {
      this.reset(sample.nowMs); return this.decision(false)
    }
    // performance.now() has fractional milliseconds; tolerate only floating-point rounding.
    if (elapsedMs < 1000 - 1e-6) return this.decision(false)
    this.lastSample = sample.nowMs
    this.lowSeconds = this.quality === 'low' && sample.fps < 20 ? this.lowSeconds + 1 : 0
    if (this.lowSeconds >= 5) { this.reason = '持续性能不足，已切换经典画廊'; return this.decision(true) }
    if (sample.nowMs - this.lastChange < 10000) { this.bad = 0; this.good = 0; return this.decision(false) }
    this.bad = sample.fps < 30 ? this.bad + 1 : 0
    this.good = sample.fps >= 55 ? this.good + 1 : 0
    const index = tiers.indexOf(this.quality)
    if (this.bad >= 3 && index > 0) this.change(tiers[index - 1], sample.nowMs, '持续低帧率，已降低显示开销')
    else if (this.good >= 8 && index < tiers.indexOf(this.ceiling)) this.change(tiers[index + 1], sample.nowMs, '性能恢复，已提高显示质量')
    return this.decision(false)
  }
  private change(quality: Quality, nowMs: number, reason: string): void {
    this.quality = quality; this.lastChange = nowMs; this.reason = reason; this.bad = 0; this.good = 0; this.lowSeconds = 0
  }
  private decision(fallback2D: boolean): QualityDecision { return { quality: this.quality, fallback2D, reason: this.reason } }
}
