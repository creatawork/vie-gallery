<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import {
  BS_CONFIG_UPDATE,
  BS_CONTENT_CHANGE,
  BS_PREVIEW_READY,
  BS_TEMPLATE_CHANGE,
  DEMO_SITE_CONTENT,
  SITE_TEMPLATES,
  defaultBrandSiteConfig,
  getSiteTemplate,
  type BrandSiteConfig,
  type BrandSiteResolvedAssets,
  type BrandSiteResponse,
  type BrandSiteStatus,
  type BsPreviewMessage
} from '@vie/gallery-contracts'
import { fetchPublicSite } from './api'
import { configureTracking } from './brand/track'
import { applySiteTokens, deriveBrand } from './brand/tokens'
import { provideSiteContext, type SiteContext } from './siteContext'
import SiteNav from './components/SiteNav.vue'
import SiteHero from './components/SiteHero.vue'
import SiteProjects from './components/SiteProjects.vue'
import SiteAbout from './components/SiteAbout.vue'
import SiteContact from './components/SiteContact.vue'
import SiteFooter from './components/SiteFooter.vue'

const SECTION_COMPONENTS = {
  nav: SiteNav,
  hero: SiteHero,
  projects: SiteProjects,
  about: SiteAbout,
  contact: SiteContact,
  footer: SiteFooter
} as const

const params = new URLSearchParams(window.location.search)
const isEmbed = params.get('embed') === 'preview'

const config = ref<BrandSiteConfig>(defaultBrandSiteConfig())
const status = ref<BrandSiteStatus>('ACTIVE')
const resolved = ref<BrandSiteResolvedAssets | null>(null)
const subdomain = ref('')
const demo = ref(false)
const loaded = ref(false)

const template = computed(() => getSiteTemplate(config.value.templateId))
const expired = computed(() => status.value === 'EXPIRED' && !isEmbed)

/* ---------------------------- 启动与数据装载 ---------------------------- */

function isDevPort(port: string): boolean {
  return ['5173', '5174', '5175', '5176', '4173', '4174'].includes(port)
}

/** 泛子域名基建（PRD §11.7）上线前：显式 ?site= 或主域名首标签作为子域名 */
function resolveHostSubdomain(): string | null {
  const hostname = window.location.hostname
  if (isDevPort(window.location.port)) return null
  if (/^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return null
  const labels = hostname.split('.')
  if (labels.length < 2) return null
  return labels[0] || null
}

function enterDemo(templateParam: string | null): void {
  const templateId = SITE_TEMPLATES.some((t) => t.id === templateParam) ? templateParam! : 'plain'
  const tpl = getSiteTemplate(templateId)
  config.value = {
    templateId,
    projectCardVariant: tpl.defaultVariant,
    content: DEMO_SITE_CONTENT[templateId],
    overrides: {}
  }
  status.value = params.has('trial') ? 'TRIAL' : 'ACTIVE'
  resolved.value = null
  subdomain.value = ''
  demo.value = true
  loaded.value = true
}

function applySiteResponse(res: BrandSiteResponse, fallbackSubdomain: string): void {
  config.value = res.config
  status.value = res.status
  subdomain.value = res.subdomain || fallbackSubdomain
  resolved.value = res.resolved ?? { photos: {}, projects: [] }
  demo.value = false
  loaded.value = true
  configureTracking(subdomain.value)
}

async function boot(): Promise<void> {
  if (isEmbed) {
    // admin 内嵌预览：配置经 BS_CONFIG_UPDATE 下发
    loaded.value = true
    return
  }
  const candidate = params.get('site') || resolveHostSubdomain()
  const templateParam = params.get('template')
  if (candidate && !templateParam) {
    try {
      const res = await fetchPublicSite(candidate)
      if (res) {
        applySiteResponse(res, candidate)
        return
      }
    } catch {
      /* 站点端点不可用 → 回落演示模式，保证访客侧永不白屏 */
    }
  }
  enterDemo(templateParam)
}

void boot()

/* ---------------------------- 资产与链接解析 ---------------------------- */

function resolvePhoto(photoId?: string): string | null {
  if (!photoId) return null
  if (demo.value) {
    // 运行期拼接的 URL 不会经过 Vite base 重写，需显式带上部署前缀（/site/）
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
    return `${base}demo/${photoId}.jpg`
  }
  return resolved.value?.photos?.[photoId] ?? null
}

function viewerBase(): string {
  if (isDevPort(window.location.port)) return `${window.location.protocol}//${window.location.hostname}:5174`
  const configured = (import.meta.env.VITE_VIEWER_ORIGIN as string | undefined) ?? ''
  return configured.replace(/\/$/, '')
}

function galleryHref(galleryId: string): string | null {
  if (demo.value) return null
  const slug = resolved.value?.projects?.find((p) => p.galleryId === galleryId)?.slug
  return slug ? `${viewerBase()}/g/${slug}` : null
}

watchEffect(() => {
  if (!loaded.value) return
  const derived = deriveBrand(config.value.content.brand.primaryColor, template.value.tokens['color-bg'])
  applySiteTokens(document.documentElement, template.value, config.value, derived)
})

/* ---------------------------- SEO（meta / OG） ---------------------------- */

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

watchEffect(() => {
  if (!loaded.value || isEmbed) return
  const { brand, seo, hero } = config.value.content
  const title = seo?.title || brand.name
  document.title = title
  if (seo?.description) setMeta('name', 'description', seo.description)
  setMeta('property', 'og:title', title)
  if (seo?.description) setMeta('property', 'og:description', seo.description)
  setMeta('property', 'og:type', 'website')
  const cover = resolvePhoto(hero.coverPhotoId)
  if (cover) setMeta('property', 'og:image', new URL(cover, window.location.href).href)
  // TRIAL/EXPIRED 不参与收录（§8 SEO）
  setMeta('name', 'robots', status.value === 'ACTIVE' ? 'index,follow' : 'noindex,nofollow')
})

/* ---------------------------- admin 预览握手（BS_*） ---------------------------- */

function adminEmbedOrigin(): string {
  const { protocol, hostname, port } = window.location
  if (isDevPort(port)) return `${protocol}//${hostname}:5173`
  return window.location.origin
}

function isTrustedPreviewOrigin(origin: string): boolean {
  if (origin === window.location.origin) return true
  try {
    return new URL(origin).hostname === window.location.hostname
  } catch {
    return false
  }
}

function handlePreviewMessage(event: MessageEvent): void {
  if (!isTrustedPreviewOrigin(event.origin)) return
  if (event.source !== window.parent) return
  const data = event.data as BsPreviewMessage | null
  if (!data || typeof data !== 'object') return
  if (data.type === BS_CONFIG_UPDATE) {
    config.value = data.config
    if (data.status) status.value = data.status
    demo.value = false
  } else if (data.type === BS_TEMPLATE_CHANGE) {
    config.value = {
      ...config.value,
      templateId: data.templateId,
      projectCardVariant: data.projectCardVariant ?? config.value.projectCardVariant,
      overrides: data.overrides ?? config.value.overrides
    }
  } else if (data.type === BS_CONTENT_CHANGE) {
    config.value = { ...config.value, content: data.content }
  }
}

onMounted(() => {
  if (isEmbed && window.parent !== window) {
    window.parent.postMessage({ type: BS_PREVIEW_READY } satisfies { type: typeof BS_PREVIEW_READY }, adminEmbedOrigin())
  }
  window.addEventListener('message', handlePreviewMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handlePreviewMessage)
})

const ctx: SiteContext = {
  get template() {
    return template.value
  },
  get config() {
    return config.value
  },
  get status() {
    return status.value
  },
  get demo() {
    return demo.value
  },
  isEmbed,
  get subdomain() {
    return subdomain.value
  },
  resolvePhoto,
  galleryHref
}
provideSiteContext(ctx)
</script>

<template>
  <div v-if="expired" class="expired-page">
    <p class="expired-name">{{ config.content.brand.name }}</p>
    <p class="expired-text">站点暂停访问</p>
    <p class="expired-hint">如需恢复，请联系站点所有者。</p>
  </div>
  <div v-else class="site" :class="`tpl-${template.id}`" :data-primary-role="template.primaryRole">
    <component :is="SECTION_COMPONENTS[section]" v-for="section in template.sections" :key="section" />
  </div>
</template>

<style scoped>
.boot-hidden {
  display: none;
}
.expired-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--bs-color-bg, #fff);
  color: var(--bs-color-text, #1a1a1a);
  font-family: var(--bs-font-body, sans-serif);
  text-align: center;
  padding: 24px;
}
.expired-name {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.expired-text {
  font-size: 15px;
  color: var(--bs-color-text-muted, #888);
}
.expired-hint {
  font-size: 12.5px;
  color: var(--bs-color-text-muted, #888);
}
</style>
