import type { LayoutPosition } from '../core/types'

const TWO_PI = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ~137.5 degrees

/**
 * 1) 斐波那契球面全景星盘 (Fibonacci Sphere Star-Disk)
 * 具备少样本黄金构图保护与球心法线朝向对齐
 */
export function sphereLayout(count: number, opts: any = {}): LayoutPosition[] {
  const out: LayoutPosition[] = []
  if (count <= 0) return out

  if (count === 1) {
    return [{ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }]
  }

  if (count === 2) {
    return [
      { x: -160, y: 0, z: 40, rx: 0, ry: 0.25, rz: 0 },
      { x: 160, y: 0, z: 40, rx: 0, ry: -0.25, rz: 0 }
    ]
  }

  if (count === 3) {
    return [
      { x: -220, y: 0, z: 20, rx: 0, ry: 0.35, rz: 0 },
      { x: 0, y: 40, z: 120, rx: -0.1, ry: 0, rz: 0 },
      { x: 220, y: 0, z: 20, rx: 0, ry: -0.35, rz: 0 }
    ]
  }

  // 自适应半径：确保无论是 4 张还是 100 张照片，都在最佳黄金视野视锥内
  const radius = opts.radius ?? Math.max(320, Math.min(850, 240 + Math.sqrt(count) * 65))
  const rx = opts.rx ?? radius * 1.15
  const ry = opts.ry ?? radius * 0.75
  const rz = opts.rz ?? radius * 0.95

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2 // 1 ~ -1
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = GOLDEN_ANGLE * i

    const px = Math.cos(theta) * radiusAtY * rx
    const py = y * ry
    const pz = Math.sin(theta) * radiusAtY * rz

    // 朝向计算：面向球心外侧法线
    const ryAngle = -Math.atan2(pz, px) - Math.PI / 2
    const rxAngle = Math.atan2(py, Math.hypot(px, pz)) * 0.4

    out.push({
      x: px,
      y: py,
      z: pz,
      rx: rxAngle,
      ry: ryAngle,
      rz: (Math.sin(i * 1.5) * 0.05)
    })
  }

  return out
}

/**
 * 2) 3D 圆柱剧场环幕 (Cylindrical Carousel / Ring Stage)
 * 围绕中心环绕展陈，极具现代展厅沉浸感
 */
export function carouselLayout(count: number, opts: any = {}): LayoutPosition[] {
  const out: LayoutPosition[] = []
  if (count <= 0) return out

  if (count === 1) {
    return [{ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }]
  }

  const radius = opts.radius ?? Math.max(260, Math.min(750, 180 + count * 28))
  const angleStep = TWO_PI / count

  for (let i = 0; i < count; i++) {
    const angle = i * angleStep
    const px = Math.sin(angle) * radius
    const pz = Math.cos(angle) * radius
    // 轻微高低起伏交错波浪
    const py = Math.sin(i * 1.2) * 30

    out.push({
      x: px,
      y: py,
      z: pz,
      rx: 0,
      ry: angle + Math.PI, // 朝向圆心内侧观察者
      rz: 0
    })
  }

  return out
}

/**
 * 3) DNA 双螺旋升腾 (Dual-Helix Space)
 * 双链交错纵深递增，带阶梯倾角与空间流动感
 */
export function helixLayout(count: number, opts: any = {}): LayoutPosition[] {
  const out: LayoutPosition[] = []
  if (count <= 0) return out

  if (count === 1) {
    return [{ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }]
  }

  const radius = opts.radius ?? Math.max(220, Math.min(480, 200 + Math.sqrt(count) * 25))
  const totalHeight = Math.max(300, Math.min(900, count * 35))
  const stepY = count > 1 ? totalHeight / (count - 1) : 0
  const startY = -totalHeight / 2
  const turns = Math.max(1.2, count * 0.18)

  for (let i = 0; i < count; i++) {
    const isStrandB = i % 2 === 1
    const t = i / Math.max(1, count - 1)
    const angle = t * turns * TWO_PI + (isStrandB ? Math.PI : 0)

    const px = Math.cos(angle) * radius
    const py = startY + i * stepY
    const pz = Math.sin(angle) * radius

    out.push({
      x: px,
      y: py,
      z: pz,
      rx: 0,
      ry: -angle + Math.PI / 2,
      rz: 0
    })
  }

  return out
}

/**
 * 4) 波浪曲面画廊墙 (Cylindrical Wave Matrix)
 * 正弦起伏双向波浪画廊，左右内收汇聚，气势恢宏
 */
export function gridLayout(count: number, opts: any = {}): LayoutPosition[] {
  const out: LayoutPosition[] = []
  if (count <= 0) return out

  if (count === 1) {
    return [{ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }]
  }

  // 响应式行列计算
  const cols = opts.cols ?? (count <= 4 ? count : (count <= 8 ? 4 : (count <= 16 ? 5 : 6)))
  const rows = Math.ceil(count / cols)
  const cellW = opts.cellW ?? (count <= 4 ? 200 : 150)
  const cellH = opts.cellH ?? (count <= 4 ? 240 : 180)

  const totalW = (cols - 1) * cellW
  const totalH = (rows - 1) * cellH

  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)

    const px = c * cellW - totalW / 2
    const py = -(r * cellH - totalH / 2)
    // 柱面圆弧曲面折叠：左右两侧向观察者包围微弯
    const normX = px / (Math.max(1, totalW / 2))
    const pz = -(normX * normX) * 120 + 50

    // 内倾角度
    const ry = -normX * 0.3

    out.push({
      x: px,
      y: py,
      z: pz,
      rx: 0,
      ry: ry,
      rz: 0
    })
  }

  return out
}

/**
 * 5) 银河对数旋臂星云 (Galaxy Spiral Arms)
 * 对数星系旋臂，厚度高斯起伏
 */
export function spiralLayout(count: number, opts: any = {}): LayoutPosition[] {
  const out: LayoutPosition[] = []
  if (count <= 0) return out

  if (count === 1) {
    return [{ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }]
  }

  const arms = count <= 3 ? 1 : (count <= 8 ? 2 : 3)
  const baseRadius = opts.baseRadius ?? (count <= 4 ? 140 : 100)
  const maxRadius = opts.maxRadius ?? Math.max(360, Math.min(800, 220 + count * 22))
  const turns = Math.max(1.0, Math.min(2.5, count * 0.15))

  for (let i = 0; i < count; i++) {
    const armIndex = i % arms
    const t = (Math.floor(i / arms) + 0.5) / Math.ceil(count / arms)
    const angle = t * turns * TWO_PI + (armIndex * TWO_PI) / arms
    const r = baseRadius + t * (maxRadius - baseRadius)

    const px = Math.cos(angle) * r
    const py = Math.sin(t * Math.PI * 2 + armIndex) * 45
    const pz = Math.sin(angle) * r

    out.push({
      x: px,
      y: py,
      z: pz,
      rx: (Math.sin(i * 2) * 0.1),
      ry: -angle + Math.PI / 2,
      rz: (Math.cos(i * 2) * 0.05)
    })
  }

  return out
}

/**
 * 6) 引力星团悬浮 (Gravity Chaos Cluster)
 * 基于引力球谐与流体微扰的自然三维漂浮
 */
export function randomLayout(count: number, opts: any = {}): LayoutPosition[] {
  const out: LayoutPosition[] = []
  if (count <= 0) return out

  if (count === 1) {
    return [{ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }]
  }

  const radius = opts.radius ?? Math.max(280, Math.min(680, 200 + Math.sqrt(count) * 45))

  for (let i = 0; i < count; i++) {
    // 伪随机可复现黄金角度种子
    const u = (i + 0.5) / count
    const theta = i * 2.399963229728653 // 黄金角度
    const phi = Math.acos(1 - 2 * u)
    const r = radius * (0.6 + 0.4 * Math.sin(i * 3.7))

    const px = r * Math.sin(phi) * Math.cos(theta)
    const py = r * Math.sin(phi) * Math.sin(theta) * 0.7
    const pz = r * Math.cos(phi)

    out.push({
      x: px,
      y: py,
      z: pz,
      rx: Math.sin(i * 1.7) * 0.2,
      ry: Math.cos(i * 2.1) * 0.3,
      rz: Math.sin(i * 2.9) * 0.1
    })
  }

  return out
}

/**
 * 布局生成器映射集合
 */
export const LAYOUT_GENERATORS = {
  sphere: sphereLayout,
  carousel: carouselLayout,
  helix: helixLayout,
  grid: gridLayout,
  spiral: spiralLayout,
  random: randomLayout
}
