import type { LayoutPosition } from '../core/types'

export const THEATRE_MODES = [
  { id: 'book', label: '巨幅翻页', group: '叙事' },
  { id: 'tunnel', label: '时空长廊', group: '叙事' },
  { id: 'cloud', label: '浮游照片云', group: '排列' },
  { id: 'ring', label: '轨道环廊', group: '排列' },
  { id: 'fold', label: '折页长廊', group: '排列' },
  { id: 'ribbon', label: '流动照片带', group: '排列' },
  { id: 'stack', label: '层叠相册', group: '排列' },
  { id: 'wall', label: '错落展墙', group: '排列' },
  { id: 'diptych', label: '双联', group: '组合' },
  { id: 'triptych', label: '三联', group: '组合' },
  { id: 'fan', label: '扇形组照', group: '组合' },
  { id: 'fragments', label: '主图与碎片', group: '组合' }
] as const
export type TheatreMode = typeof THEATRE_MODES[number]['id'] | 'focus'
export interface TheatrePose extends LayoutPosition { index: number; scale: number; visible: boolean }
export interface TheatreState {
  active: boolean; mode: TheatreMode; status: 'idle' | 'playing' | 'paused' | 'finished'
  elapsed: number; offset: number; indices: number[]; reducedMotion: boolean
}
export type TheatreCommand =
  | { type: 'mode'; mode: TheatreMode }
  | { type: 'play' | 'pause' | 'exit' | 'blur' }
  | { type: 'step'; direction: number }
  | { type: 'focus'; index: number }

export const SHOW_DURATION = 31
const SHOW_CUES: Array<{ at: number; mode: TheatreMode }> = [
  { at: 0, mode: 'cloud' }, { at: 8, mode: 'ring' }, { at: 15, mode: 'book' },
  { at: 22, mode: 'tunnel' }, { at: 26, mode: 'focus' }, { at: 29, mode: 'cloud' }
]
export function showCueAt(seconds: number) {
  return [...SHOW_CUES].reverse().find(cue => seconds >= cue.at) ?? SHOW_CUES[0]
}
export function theatreCapacity(mode: TheatreMode, width: number): number {
  const compact = width < 650
  switch (mode) {
    case 'book': return 3
    case 'tunnel': return compact ? 6 : 10
    case 'focus': return 1
    case 'diptych': return 2
    case 'triptych': return 3
    case 'stack': case 'fan': case 'fragments': return compact ? 5 : 7
    case 'fold': return compact ? 5 : 9
    case 'ring': return compact ? 8 : 12
    case 'ribbon': return compact ? 9 : 15
    case 'wall': return compact ? 9 : 18
    default: return compact ? 12 : 24
  }
}

/** Stage coordinates at a fixed front-facing camera. Every image keeps its natural ratio. */
export function createTheatrePoses(ratios: number[], mode: TheatreMode, space: { width: number; height: number; limit?: number }, offset = 0, expanded = false): TheatrePose[] {
  const count = ratios.length
  if (!count) return []
  const w = Math.max(1, space.width), h = Math.max(1, space.height)
  const capacity = theatreCapacity(mode, w), n = Math.min(count, capacity, Math.max(1, space.limit ?? capacity))
  const start = ((Math.floor(offset) % count) + count) % count
  const indices = Array.from({ length: n }, (_, i) => (start + i) % count)
  const poses: TheatrePose[] = ratios.map((_, index) => ({ index, x: w * 2, y: 0, z: -180, rx: 0, ry: 0, rz: 0, scale: 1, visible: false }))
  const place = (i: number, x: number, y: number, z: number, boxW: number, boxH: number, ry = 0, rz = 0) => {
    const index = indices[i], ratio = Math.max(.1, Math.min(10, ratios[index] || 4 / 3))
    // Account for rotated corners as well as the unrotated rectangle when fitting.
    const scale = Math.min(boxW / 80, boxH * ratio / 80)
    const cornerX = (40 + 40 / ratio * Math.abs(Math.sin(rz))) * scale
    const cornerY = (40 / ratio + 40 * Math.abs(Math.sin(rz))) * scale
    const safeScale = scale * Math.min(1, (w / 2 - Math.abs(x)) / Math.max(1, cornerX), (h / 2 - Math.abs(y)) / Math.max(1, cornerY))
    poses[index] = { index, x, y, z, rx: 0, ry, rz, scale: Math.max(.01, safeScale), visible: true }
  }
  // Small albums become complete single/double/triple compositions, never a sparse large structure.
  const effective = count <= 3 && !['focus', 'diptych', 'triptych'].includes(mode) ? (count === 1 ? 'focus' : count === 2 ? 'diptych' : 'triptych') : mode
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1), u = t - .5
    switch (effective) {
      case 'book':
        place(i, (i % 2 ? -1 : 1) * w * .22, 0, i === 0 ? 40 : 0, w * .4, h * .8); break
      case 'tunnel': {
        const angle = i * 1.42
        place(i, Math.sin(angle) * w * .34, Math.cos(angle) * h * .28,
          160 - i * 250, w * .3, h * .52, Math.sin(angle) * -.2, Math.sin(angle) * .1)
        break
      }
      case 'focus': place(i, 0, 0, 50, w * .65, h * .86); break
      case 'diptych':
        place(i, (i - (n - 1) / 2) * w * .45, 0, i ? -20 : 30, w * .4, h * .8, 0, i ? -.018 : .018); break
      case 'triptych': {
        const mobile = w < 650
        if (mobile) place(i, i === 0 ? 0 : (i === 1 ? -1 : 1) * w * .23, i === 0 ? h * .17 : -h * .29, i === 0 ? 40 : 0, i === 0 ? w * .74 : w * .4, i === 0 ? h * .53 : h * .32)
        else place(i, i === 0 ? -w * .18 : w * .29, i === 0 ? 0 : (i === 1 ? 1 : -1) * h * .24, i === 0 ? 40 : 0, i === 0 ? w * .48 : w * .27, i === 0 ? h * .86 : h * .4)
        break
      }
      case 'ring': {
        const angle = i / n * Math.PI * 2 - Math.PI / 2
        const depth = -Math.sin(angle)
        place(i, Math.cos(angle) * w * .34, Math.sin(angle) * h * .3, depth * 110, w * (.14 + depth * .025), h * (.24 + depth * .03), -Math.cos(angle) * .28, Math.cos(angle) * .035)
        break
      }
      case 'fold':
        place(i, u * w * .83, Math.sin(t * Math.PI) * h * .05, -Math.abs(u) * 220, w / (n + 1) * 1.25, h * .66, i % 2 ? -.5 : .5); break
      case 'ribbon':
        place(i, u * w * .83, Math.sin(t * Math.PI * 2) * h * .25, Math.cos(t * Math.PI * 2) * 90, w / Math.max(5, n) * 1.2, h * .31, -u * .45, Math.cos(t * Math.PI * 2) * .09); break
      case 'stack':
      case 'fan': {
        const spread = effective === 'fan' || expanded
        const x = spread ? u * w * .65 : u * w * .1
        const y = spread ? (Math.cos(u * Math.PI) - .7) * h * .18 : u * h * .075
        place(i, x, y, i * 6, spread ? w * .28 : w * .52, spread ? h * .62 : h * .76, 0, u * (spread ? .42 : .16)); break
      }
      case 'fragments':
        if (i === 0) place(i, 0, 0, 60, w * .46, h * .62)
        else { const a = (i - 1) / (n - 1) * Math.PI * 2; place(i, Math.cos(a) * w * .36, Math.sin(a) * h * .35, -35, w * .18, h * .22, 0, Math.sin(a) * .11) }
        break
      case 'cloud': {
        const angle = i * Math.PI * (3 - Math.sqrt(5))
        const radius = Math.sqrt((i + .6) / n)
        const foreground = i % 7 === 0
        place(i, Math.cos(angle) * radius * w * .34, Math.sin(angle) * radius * h * .32,
          foreground ? 85 : -110 + (i % 4) * 40,
          w * (foreground ? .22 : .12 + (i % 3) * .02), h * (foreground ? .33 : .21),
          Math.sin(angle) * .16, Math.cos(angle * 1.3) * .075)
        break
      }
      default: {
        const cols = Math.min(n, w < 650 ? 3 : 6), rows = Math.ceil(n / cols)
        const col = i % cols, row = Math.floor(i / cols), rowCount = Math.min(cols, n - row * cols)
        const cellW = w * .91 / cols, cellH = h * .91 / rows
        place(i, (col - (rowCount - 1) / 2) * cellW, ((rows - 1) / 2 - row) * cellH,
          (i % 3) * 12, cellW * .86, cellH * .86)
      }
    }
  }
  return poses
}
