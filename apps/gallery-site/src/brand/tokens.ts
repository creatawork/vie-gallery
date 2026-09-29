import type { BrandSiteConfig, SiteTemplate } from '@vie/gallery-contracts'

export { deriveBrand, isLowContrastPrimary, parseHexColor, contrastRatio } from '@vie/gallery-contracts'
export type { DerivedBrand } from '@vie/gallery-contracts'

/**
 * 把模板基线 ⊕ 品牌派生 ⊕ 用户覆写 写入 CSS 变量。
 * 仅 allowedOverrides 白名单内的覆写生效（渲染侧兜底，防止越权 token）。
 */
export function applySiteTokens(
  root: HTMLElement,
  template: SiteTemplate,
  config: BrandSiteConfig,
  derived: import('@vie/gallery-contracts').DerivedBrand
): void {
  const style = root.style
  for (const [key, value] of Object.entries(template.tokens)) {
    style.setProperty(`--bs-${key}`, value)
  }
  const overrides = config.overrides ?? {}
  const allowed = new Set(template.allowedOverrides)
  for (const [key, value] of Object.entries(overrides)) {
    if (allowed.has(key) && value) style.setProperty(`--bs-${key}`, value)
  }

  style.setProperty('--bs-color-primary', derived.primary)
  style.setProperty('--bs-color-primary-hover', derived.primaryHover)
  style.setProperty('--bs-color-on-primary', derived.onPrimary)
  style.setProperty('--bs-color-primary-soft', derived.primarySoft)
  style.setProperty('--bs-brand-name', config.content.brand.name)
}
