import { test, expect } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyCuratedStyle, createRecommendedViewerConfig, normalizeViewerConfig } from '@vie/gallery-contracts'
import { mockGallery } from './helpers/mockGallery'

const shots = fileURLToPath(new URL('../../../.taste-skill/optimization-2026-10-17/', import.meta.url))
async function realPhotos(page: import('@playwright/test').Page) {
  const covers = ['coast', 'forest', 'lake', 'stream']
  await page.route('**/fixtures/photo-*', async route => {
    const index = Number(route.request().url().match(/photo-(\d+)/)?.[1] ?? 0)
    await route.fulfill({ contentType: 'image/png', body: await readFile(new URL(`../../gallery-admin/public/covers/${covers[index % covers.length]}.png`, import.meta.url)) })
  })
  await mkdir(shots, { recursive: true })
  await page.route('**/api/public/g/effects-fixture/photos**', route => route.fulfill({ json: {
    items: Array.from({ length: 8 }, (_, index) => ({ title: `Sample ${index + 1}`, sortOrder: index, width: 1280, height: 720, thumbnailUrl: `/fixtures/photo-${index}.png`, textureUrl: `/fixtures/photo-${index}.png` })), page: 0, pageSize: 50, total: 8,
  } }))
}

test('photo-first entry preserves the published recipe and restores free exploration', async ({ page }) => {
  const config = normalizeViewerConfig({ layout: { mode: 'sphere' }, camera: { autoRotate: true }, particles: { enabled: false } }).config
  const { errors } = await mockGallery(page, { config, count: 8 })
  await realPhotos(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/g/effects-fixture')
  await expect(page.getByRole('button', { name: '查看当前作品' })).toContainText('Sample 1')
  await expect(page.getByRole('region', { name: '照片编排' })).toBeHidden()
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready ?? 0)).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByRole('button', { name: '查看当前作品' })).toBeVisible()
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requestedConfig)).toEqual(config)
  await page.screenshot({ path: resolve(shots, 'viewer-mobile-photo-first.png') })
  await page.getByRole('button', { name: '下一张作品', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看当前作品' })).toContainText('Sample 2')
  await page.getByRole('button', { name: '更多观看方式' }).click()
  await page.getByRole('button', { name: '自由漫游', exact: true }).click()
  await expect(page.locator('.stage-info')).toBeHidden()
  await page.getByRole('button', { name: '更多观看方式' }).click()
  await page.getByRole('button', { name: '逐张欣赏', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看当前作品' })).toBeVisible()
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requestedConfig)).toEqual(config)
  expect(errors).toEqual([])
})

test('creator previews retain the authored spatial layout', async ({ page }) => {
  const config = normalizeViewerConfig({ layout: { mode: 'sphere' }, camera: { autoRotate: false }, particles: { enabled: false } }).config
  const { errors } = await mockGallery(page, { config })
  await page.goto('/g/effects-fixture?preview=creator-preview')
  await expect(page.getByRole('button', { name: '螺旋', exact: true })).toBeVisible()
  await expect(page.locator('.stage-info')).toBeHidden()
  const snapshot = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot())
  expect(snapshot.plugins).not.toContain('PhotoTheatre')
  expect(snapshot.requestedConfig).toEqual(config)
  expect(errors).toEqual([])
})

test('large exhibitions keep loading controls in the shared footer and preserve browsing after append', async ({ page }) => {
  const { errors } = await mockGallery(page, { count: 75, config: { particles: { enabled: false } } })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/g/effects-fixture')
  const more = page.getByRole('button', { name: '继续浏览 · 还有 25 张', exact: true })
  await expect(more).toBeVisible()
  const areas = await page.locator('.stage-row, .spatial-style-row, .load-more-floating').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect()
    return { top:r.top, bottom:r.bottom, right:r.right }
  }))
  expect(areas).toHaveLength(3)
  expect(areas[0].bottom).toBeLessThanOrEqual(areas[1].top)
  expect(areas[1].bottom).toBeLessThanOrEqual(areas[2].top)
  expect(areas[2].right).toBeLessThanOrEqual(390)
  expect(areas[2].bottom).toBeLessThan(844)
  await more.click()
  await expect(more).toBeHidden()
  await expect(page.locator('.stage-counter span').last()).toHaveText('75')
  await page.getByRole('button', { name:'下一张作品', exact:true }).click()
  await expect(page.getByRole('button', { name:'查看当前作品' })).toContainText('Sample 2')
  expect(errors).toEqual([])
})

test('long work titles, navigation and style controls never overlap at review breakpoints', async ({ page }) => {
  const config = applyCuratedStyle(createRecommendedViewerConfig(), 'carousel')
  config.camera.autoRotate = false
  config.particles.enabled = false
  const { errors } = await mockGallery(page, { config, count: 8 })
  await realPhotos(page)
  await page.route('**/api/public/g/effects-fixture/photos**', route => route.fulfill({ json: {
    items: Array.from({ length: 8 }, (_, index) => ({ title: index === 0 ? '这是一个很长的中文作品标题，用来确认标题和浏览控制在各种宽度下互不遮挡' : `山海手记 ${index + 1}`, sortOrder: index, width: 1280, height: 720, thumbnailUrl: `/fixtures/photo-${index}.png`, textureUrl: `/fixtures/photo-${index}.png` })), page: 0, pageSize: 50, total: 8,
  } }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/g/effects-fixture')
  await expect(page.getByRole('button', { name: '查看当前作品' })).toBeVisible()
  for (const width of [1440, 1024, 850, 768, 701, 390, 320]) {
    await page.setViewportSize({ width, height: width > 1000 ? 900 : width > 650 ? 1024 : 844 })
    const rectangles = await page.locator('.stage-current, .stage-navigation, .composition-dock, .spatial-options-toggle').evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }))
    expect(rectangles).toHaveLength(4)
    for (const [i, a] of rectangles.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.x + a.width).toBeLessThanOrEqual(width)
      for (const b of rectangles.slice(i + 1)) {
        expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false)
      }
    }
    await page.getByRole('button', { name: '下一张作品', exact: true }).focus()
    await expect(page.getByRole('button', { name: '下一张作品', exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready ?? 0)).toBeGreaterThan(0)
    await page.screenshot({ path: resolve(shots, `viewer-ring-${width}.png`) })
  }
  expect(errors).toEqual([])
})

test('filename titles are omitted from captions but works remain named for keyboard and screen readers', async ({ page }) => {
  const { errors } = await mockGallery(page, { count: 4 })
  await realPhotos(page)
  await page.addInitScript(() => localStorage.setItem('vie:view-mode', '2d'))
  await page.route('**/api/public/g/effects-fixture/photos**', route => route.fulfill({ json: {
    items: ['thumbnail (2).jpg', '微信图片_2026.PNG', null, '夏天的海岸'].map((title, index) => ({ title, sortOrder: index, width: 1280, height: 720, thumbnailUrl: `/fixtures/photo-${index}.png`, textureUrl: `/fixtures/photo-${index}.png` })), page: 0, pageSize: 50, total: 4,
  } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/g/effects-fixture')
  await expect(page.locator('.photo-caption')).toHaveText(['夏天的海岸'])
  await expect.poll(() => page.locator('.photo-wall img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.screenshot({ path: resolve(shots, 'viewer-mobile-2d.png') })
  await page.getByRole('button', { name: '查看照片 1：作品 1', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '作品 1', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '作品 1', exact: true }).getByRole('img', { name: '作品 1', exact: true })).toBeVisible()
  await page.keyboard.press('End')
  await expect(page.getByRole('dialog', { name: '夏天的海岸', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '查看照片 1：作品 1', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})
