import type { LayoutPosition } from '../core/types'

const TWO_PI = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (1 + Math.sqrt(5))

/**
 * 布局生成器集合
 */

/**
 * 1) 球形/椭球布局：Fibonacci 球面投影
 */
export function sphereLayout(count: number, opts: any = {}): LayoutPosition[] {
  const rx = opts.rx ?? 850
  const ry = opts.ry ?? 450
  const rz = opts.rz ?? 500
  const out: LayoutPosition[] = []

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const inclination = Math.acos(1 - 2 * t)
    const azimuth = GOLDEN_ANGLE * i

    out.push({
      x: Math.sin(inclination) * Math.cos(azimuth) * rx,
      y: Math.cos(inclination) * ry,
      z: Math.sin(inclination) * Math.sin(azimuth) * rz,
      rx: (Math.random() - 0.5) * 0.25,
      ry: (Math.random() - 0.5) * 0.3,
      rz: (Math.random() - 0.5) * 0.12
    })
  }

  return out
}

/**
 * 2) DNA 双螺旋布局
 */
export function helixLayout(count: number, opts: any = {}): LayoutPosition[] {
  const radius = opts.radius ?? 320
  const verticalStep = opts.verticalStep ?? 22
  const angularStep = opts.angularStep ?? 0.32
  const out: LayoutPosition[] = []
  const half = count / 2

  for (let i = 0; i < count; i++) {
    const isB = i % 2 === 1
    const k = Math.floor(i / 2)
    const angle = k * angularStep + (isB ? Math.PI : 0)
    const y = (k - half / 2) * verticalStep

    out.push({
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
      rx: 0,
      ry: -angle + Math.PI / 2,
      rz: 0
    })
  }

  return out
}

/**
 * 3) 网格墙布局
 */
export function gridLayout(count: number, opts: any = {}): LayoutPosition[] {
  const cols = opts.cols ?? (window.innerWidth < 768 ? 4 : 7)
  const cellW = opts.cellW ?? 230
  const cellH = opts.cellH ?? 300
  const rows = Math.ceil(count / cols)
  const totalW = (cols - 1) * cellW
  const totalH = (rows - 1) * cellH
  const out: LayoutPosition[] = []

  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)

    out.push({
      x: c * cellW - totalW / 2,
      y: -(r * cellH - totalH / 2),
      z: (Math.random() - 0.5) * 80,
      rx: 0,
      ry: 0,
      rz: 0
    })
  }

  return out
}

/**
 * 4) 银河旋臂布局
 */
export function spiralLayout(count: number, opts: any = {}): LayoutPosition[] {
  const arms = opts.arms ?? 2
  const baseRadius = opts.baseRadius ?? 120
  const spread = opts.spread ?? 60
  const turns = opts.turns ?? 2.5
  const out: LayoutPosition[] = []

  for (let i = 0; i < count; i++) {
    const arm = i % arms
    const k = Math.floor(i / arms)
    const t = k / Math.floor(count / arms)
    const angle = t * turns * TWO_PI + (arm * TWO_PI) / arms
    const r = baseRadius + t * spread

    out.push({
      x: Math.cos(angle) * r,
      y: (Math.random() - 0.5) * 100,
      z: Math.sin(angle) * r,
      rx: (Math.random() - 0.5) * 0.3,
      ry: -angle + Math.PI / 2,
      rz: (Math.random() - 0.5) * 0.2
    })
  }

  return out
}

/**
 * 5) 随机分散布局
 */
export function randomLayout(count: number, opts: any = {}): LayoutPosition[] {
  const radius = opts.radius ?? 800
  const out: LayoutPosition[] = []

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * TWO_PI
    const phi = Math.acos(2 * Math.random() - 1)
    const r = radius * Math.cbrt(Math.random())

    out.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
      rx: (Math.random() - 0.5) * 0.5,
      ry: (Math.random() - 0.5) * 0.5,
      rz: (Math.random() - 0.5) * 0.5
    })
  }

  return out
}

/**
 * 布局生成器映射
 */
export const LAYOUT_GENERATORS = {
  sphere: sphereLayout,
  helix: helixLayout,
  grid: gridLayout,
  spiral: spiralLayout,
  random: randomLayout
}
