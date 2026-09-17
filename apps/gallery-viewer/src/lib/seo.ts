import type { PublicGalleryResponse } from '../types/api'

const MANAGED_ATTRIBUTE = 'data-vie-viewer-seo'
const NOINDEX_ROBOTS = 'noindex,nofollow'
const INDEX_ROBOTS = 'index,follow'

export interface ViewerSeoState {
  slug: string
  isPublicReady: boolean
  gallery: PublicGalleryResponse | null
}

let previousTitle: string | undefined
let previousRobotsContent: string | null | undefined
let previousRobotsElement: HTMLMetaElement | null = null
let managedRobots: HTMLMetaElement | null = null
let initialized = false

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function safeTitle(gallery: PublicGalleryResponse): string {
  return cleanText(gallery.title, 120) || 'VIE Gallery'
}

function safeDescription(gallery: PublicGalleryResponse, title: string): string {
  const photoCount = Number.isFinite(gallery.photoCount) && gallery.photoCount >= 0
    ? Math.floor(gallery.photoCount)
    : 0
  return cleanText(`${title} · VIE Gallery，探索 ${photoCount} 张照片。`, 180)
}

function canonicalUrl(slug: string): string {
  let decodedSlug = slug
  try {
    decodedSlug = decodeURIComponent(slug)
  } catch {
    // Keep the original value; encodeURIComponent below still makes it safe.
  }
  const path = `/g/${encodeURIComponent(decodedSlug)}`
  return new URL(path, window.location.origin).href
}

function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined

  try {
    const url = new URL(value, window.location.origin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    if (url.username || url.password) return undefined

    // A share token must never be promoted to a social preview URL.
    for (const key of ['t', 'token', 'rawToken', 'shareToken']) {
      if (url.searchParams.has(key)) return undefined
    }
    return url.href
  } catch {
    return undefined
  }
}

function removeManagedTags() {
  document.head.querySelectorAll(`[${MANAGED_ATTRIBUTE}]`).forEach((node) => node.remove())
}

function removeLegacySocialTags() {
  document.head.querySelectorAll(
    'link[rel="canonical"], meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]'
  ).forEach((node) => node.remove())
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  const meta = document.createElement('meta')
  meta.setAttribute(attribute, key)
  meta.content = content
  meta.setAttribute(MANAGED_ATTRIBUTE, '')
  document.head.appendChild(meta)
}

function setCanonical(href: string) {
  const link = document.createElement('link')
  link.rel = 'canonical'
  link.href = href
  link.setAttribute(MANAGED_ATTRIBUTE, '')
  document.head.appendChild(link)
}

function setRobots(content: string) {
  if (!initialized) {
    previousRobotsElement = document.head.querySelector('meta[name="robots"]') || null
    previousRobotsContent = previousRobotsElement?.getAttribute('content')
    previousTitle = document.title
    initialized = true
  }

  if (!managedRobots || !managedRobots.isConnected) {
    managedRobots = document.head.querySelector('meta[name="robots"]') || document.createElement('meta')
    if (!managedRobots.isConnected) {
      managedRobots.name = 'robots'
      document.head.appendChild(managedRobots)
    }
    managedRobots.setAttribute(MANAGED_ATTRIBUTE, '')
  }
  managedRobots.content = content
}

/**
 * Applies viewer metadata after each state transition. Restricted states are
 * deliberately sparse so they do not reveal gallery existence to crawlers.
 */
export function applyViewerSeo(next: ViewerSeoState) {
  if (typeof document === 'undefined') return

  setRobots(next.isPublicReady && next.gallery?.accessState === 'READY' && next.gallery.visibility === 'PUBLIC'
    ? INDEX_ROBOTS
    : NOINDEX_ROBOTS)
  removeLegacySocialTags()

  if (!next.isPublicReady || !next.gallery || next.gallery.accessState !== 'READY' || next.gallery.visibility !== 'PUBLIC') {
    document.title = previousTitle || 'VIE Gallery'
    return
  }

  const title = safeTitle(next.gallery)
  const description = safeDescription(next.gallery, title)
  const image = safeImageUrl(next.gallery.cover?.url)

  document.title = `${title} · VIE Gallery`
  setMeta('name', 'description', description)
  const canonical = canonicalUrl(next.slug)
  setCanonical(canonical)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', canonical)
  if (image) setMeta('property', 'og:image', image)
  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  if (image) setMeta('name', 'twitter:image', image)
}

/** Removes metadata written by this viewer and restores the static defaults. */
export function clearViewerSeo() {
  if (typeof document === 'undefined') return
  removeManagedTags()
  if (managedRobots) {
    if (previousRobotsElement) {
      managedRobots.removeAttribute(MANAGED_ATTRIBUTE)
      managedRobots.content = previousRobotsContent || ''
      if (!managedRobots.isConnected) document.head.appendChild(managedRobots)
    } else {
      managedRobots.remove()
    }
  }
  if (previousTitle !== undefined) document.title = previousTitle
  managedRobots = null
  previousRobotsElement = null
  previousTitle = undefined
  previousRobotsContent = undefined
  initialized = false
}
