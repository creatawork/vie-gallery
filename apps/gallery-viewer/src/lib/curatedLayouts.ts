import type { LayoutPosition } from '../core/types'

/** Spacing accommodates 160px-wide mounted photographs at the curated scale. */
export function curatedLayout(count: number, mode: string, opts: { radius?: number; height?: number; turns?: number; cols?: number; cellW?: number; cellH?: number } = {}): LayoutPosition[] {
  if (count < 1) return []
  if (count === 1) return [{ x: 0, y: 0, z: 160, rx: 0, ry: 0, rz: 0 }]
  if (count === 2) return [-1, 1].map(side => ({ x: side * 110, y: 0, z: 60, rx: 0, ry: side * -.1, rz: 0 }))
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1)
    if (mode === 'carousel') {
      const perRing = Math.min(count, 12)
      const angle = (i % perRing) / perRing * Math.PI * 2
      return { x: Math.sin(angle) * (opts.radius ?? 430), y: (Math.floor(i / perRing) - (Math.ceil(count / perRing) - 1) / 2) * 245 - Math.cos(angle) * 155,
        z: Math.cos(angle) * (opts.radius ?? 430) * .65, rx: -.08, ry: Math.sin(angle) * .65, rz: Math.sin(angle) * -.06 }
    }
    if (mode === 'grid') {
      const columns = Math.min(count, opts.cols ?? 4), rows = Math.ceil(count / columns)
      const x = (i % columns - (columns - 1) / 2) * (opts.cellW ?? 235)
      return { x, y: (rows / 2 - .5 - Math.floor(i / columns)) * (opts.cellH ?? 235) + Math.sin(x / 250) * 38,
        z: Math.cos(x / 330) * 155 - 60, rx: 0, ry: -x / 1500, rz: 0 }
    }
    // A single continuous ribbon, rather than alternating unrelated strands.
    const angle = t * Math.PI * 2 * Math.max(opts.turns ?? 1.05, count / 12) - Math.PI * .7
    return { x: Math.sin(angle) * (opts.radius ?? 350), y: (t - .5) * Math.max(opts.height ?? 420, count * 31),
      z: Math.cos(angle) * (opts.radius ?? 350) * .66, rx: -.06, ry: Math.sin(angle) * .35, rz: Math.sin(angle) * .09 }
  })
}
