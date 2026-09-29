/**
 * 品牌主色派生（设计文档 §6.2）：
 *  - hover = 主色明度 −10%
 *  - on-primary 按 WCAG 对比度 ≥ 4.5 自动在黑/白间选择
 *  - primary-soft = 12% 透明度点缀底
 * 纯函数，站点渲染端与 admin 建站向导共用。
 */

export interface DerivedBrand {
  primary: string
  primaryHover: string
  onPrimary: string
  primarySoft: string
  /** 主色相对站点底色的对比度（建站向导黄色提示用，不阻断） */
  contrastOnBg: number
  contrastOnPrimary: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function parseHexColor(input: string): [number, number, number] | null {
  if (typeof input !== 'string') return null
  let hex = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = relativeLuminance(...rgb1)
  const l2 = relativeLuminance(...rgb2)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

export function deriveBrand(primaryColor: string, bgColor: string): DerivedBrand {
  const rgb = parseHexColor(primaryColor) ?? [31, 110, 104]
  const bg = parseHexColor(bgColor) ?? [255, 255, 255]

  // hover：明度 −10%
  const [h, s, l] = rgbToHsl(...rgb)
  const [hr, hg, hb] = hslToRgb(h, s, clamp(l - 0.1, 0, 1))
  const hover = rgbToHex(hr, hg, hb)

  // on-primary：黑/白中对比度更高的一者（保证 ≥ 4.5 时优先白，保证专业感底线）
  const white: [number, number, number] = [255, 255, 255]
  const black: [number, number, number] = [17, 17, 17]
  const onWhite = contrastRatio(rgb, white)
  const onBlack = contrastRatio(rgb, black)
  const onPrimary = onWhite >= onBlack ? '#FFFFFF' : '#111111'
  const onPrimaryRatio = Math.max(onWhite, onBlack)

  const soft = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`

  return {
    primary: rgbToHex(...rgb),
    primaryHover: hover,
    onPrimary,
    primarySoft: soft,
    contrastOnBg: contrastRatio(rgb, bg),
    contrastOnPrimary: onPrimaryRatio
  }
}

/** 是否为低对比主色（黄色提示但不阻断，§6.2） */
export function isLowContrastPrimary(brand: DerivedBrand): boolean {
  return brand.contrastOnPrimary < 4.5
}
