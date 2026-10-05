import type { Page } from '@playwright/test'
import { normalizeViewerConfig } from '@vie/gallery-contracts'

export async function mockGallery(page: Page, options: { config?: unknown; count?: number } = {}) {
  const count = options.count ?? 12, config = normalizeViewerConfig(options.config ?? {}).config
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.addInitScript(() => localStorage.setItem('vie:view-mode', '3d'))
  await page.route('**/fixtures/photo-*', route => {
    const index = Number(new URL(route.request().url()).pathname.match(/photo-(\d+)/)?.[1] ?? 0)
    const portrait = index % 3 === 0, width = portrait ? 600 : 900, height = portrait ? 900 : 600
    const color = ['#b92134', '#1d70c9', '#37ab68'][index % 3]
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/><circle cx="${width / 2}" cy="${height / 2}" r="${width / 4}" fill="#eee4ca"/><path d="M0 ${height} L${width / 2} ${height / 2} L${width} ${height}" fill="#24334b"/></svg>` })
  })
  await page.route('**/api/public/g/effects-fixture**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/viewer-config')) return route.fulfill({ json: { id: 'config', galleryId: 'gallery', enabled: true, configJson: JSON.stringify(config), schemaVersion: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } })
    if (url.pathname.endsWith('/photos')) {
      const pageNumber = Number(url.searchParams.get('page') ?? 0), pageSize = Number(url.searchParams.get('pageSize') ?? 50)
      const items = Array.from({ length: Math.max(0, Math.min(pageSize, count - pageNumber * pageSize)) }, (_, offset) => {
        const index = pageNumber * pageSize + offset
        return { title: `Sample ${index + 1}`, width: index % 3 === 0 ? 600 : 900, height: index % 3 === 0 ? 900 : 600, sortOrder: index,
          thumbnailUrl: `/fixtures/photo-${index}.svg`, textureUrl: `/fixtures/photo-${index}.svg`, mediumUrl: `/fixtures/photo-${index}.svg` }
      })
      return route.fulfill({ json: { items, page: pageNumber, pageSize, total: count } })
    }
    return route.fulfill({ json: { slug: 'effects-fixture', title: 'Effects fixture', visibility: 'PUBLIC', accessState: 'READY', cover: null, photoCount: count } })
  })
  return { errors }
}
