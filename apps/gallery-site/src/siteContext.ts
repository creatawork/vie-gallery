import { inject, provide, type InjectionKey } from 'vue'
import type { BrandSiteConfig, BrandSiteStatus, SiteTemplate } from '@vie/gallery-contracts'

export interface SiteContext {
  template: SiteTemplate
  config: BrandSiteConfig
  status: BrandSiteStatus
  /** 演示模式（无站点数据），项目卡不跳转展厅 */
  demo: boolean
  isEmbed: boolean
  /** 站点子域名（询盘提交 / 埋点上报的定位键；演示模式下为空） */
  subdomain: string
  resolvePhoto: (photoId?: string) => string | null
  /** 项目卡 → 3D 展厅链接；无对应已发布相册时返回 null */
  galleryHref: (galleryId: string) => string | null
}

const siteKey: InjectionKey<SiteContext> = Symbol('site-context')

export function provideSiteContext(ctx: SiteContext): void {
  provide(siteKey, ctx)
}

export function useSite(): SiteContext {
  const ctx = inject(siteKey)
  if (!ctx) throw new Error('useSite 必须在 provideSiteContext 之后使用')
  return ctx
}
