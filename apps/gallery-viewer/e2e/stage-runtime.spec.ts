import { test, expect } from '@playwright/test'
import { createRecommendedViewerConfig, applyPhotoArrangement, PHOTO_ARRANGEMENTS } from '@vie/gallery-contracts'
import { mockGallery } from './helpers/mockGallery'

test('the spatial exhibition obeys live autoplay settings and preserves all works', async ({ page }, info) => {
  const config = createRecommendedViewerConfig()
  config.camera.autoRotate = false
  const { errors } = await mockGallery(page, { config, count: 12 })
  await page.goto('/g/effects-fixture')
  const counter = page.locator('.stage-counter span').first()
  await expect(counter).toHaveText('01')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready ?? 0)).toBeGreaterThan(0)
  const identities = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ camera: { autoRotate: true } }))
  await expect(counter).toHaveText('02', { timeout: 12000 })
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ camera: { autoRotate: false } }))
  await page.waitForTimeout(6500)
  await expect(counter).toHaveText('02')
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())).toEqual(identities)
  await page.screenshot({ path: info.outputPath('stage-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '下一张作品', exact: true }).click()
  await expect(counter).toHaveText('03')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().renderedPhotos.ready)).toBeGreaterThan(0)
  await page.screenshot({ path: info.outputPath('stage-mobile.png') })
  expect(errors).toEqual([])
})

test('curated shortcuts reflect the actual arrangement on initial load and live updates', async ({ page }) => {
  const config = applyPhotoArrangement(createRecommendedViewerConfig(), 'orbit')
  config.camera.autoRotate = false
  const { errors } = await mockGallery(page, { config })
  await page.goto('/g/effects-fixture')
  await expect(page.locator('.stage-info p')).toHaveText(PHOTO_ARRANGEMENTS.find(item => item.id === 'orbit')!.caption)
  await expect(page.locator('.composition-dock button[aria-pressed="true"]')).toHaveCount(0)
  for (const id of ['filmstrip', 'fan', 'cascade', 'stack', 'wave'] as const) {
    const arrangement = PHOTO_ARRANGEMENTS.find(item => item.id === id)!
    await page.evaluate(definition => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({
      layout: { mode: definition.mode, params: { composition: 'curated', arrangement: definition.id } },
    }), arrangement)
    await expect(page.locator('.stage-info p')).toHaveText(arrangement.caption)
    await expect(page.locator('.composition-dock button[aria-pressed="true"]')).toHaveCount(id === 'wave' ? 1 : 0)
  }
  await expect(page.getByRole('button', { name: '波浪', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})
