import { test, expect, type Page } from '@playwright/test'
import { PHOTO_EFFECTS, VIEWER_PRESETS } from '@vie/gallery-contracts'
import { mockGallery } from './helpers/mockGallery'

async function pixels(page: Page, screenshot: Buffer): Promise<number[]> {
  return page.evaluate(async base64 => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 160, 100)
    return Array.from(ctx.getImageData(0, 0, 160, 100).data)
  }, screenshot.toString('base64'))
}
function changed(a: number[], b: number[]) {
  let count = 0
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) count++
  return count
}

test('all sixteen treatments visibly change the same photograph with identical background and layout', async ({ page }, info) => {
  test.setTimeout(120000)
  const { errors } = await mockGallery(page, { count: 1, config: {
    presetName: 'custom', quality: 'mid', customized: true,
    layout: { mode: 'grid', params: { composition: 'curated' }, transition: { style: 'none' } },
    background: { mode: 'solid', color: '#111111', motion: false }, particles: { enabled: false },
    effects: { photo: { style: 'none', intensity: 1, speed: 0 }, photoFloat: false, photoEntrance: 'none', bloom: { enabled: false } },
    camera: { autoRotate: false }, lighting: { timeOfDay: 'noon', autoColorAdapt: false }
  } })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready)).toBe(1)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.freezeTime(4))
  const canvas = page.locator('canvas.webgl-canvas')
  const meshIds = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())
  const neutral = await pixels(page, await canvas.screenshot())
  const results: { name: string; pixelsChanged: number }[] = []
  const treatments: { name: string; pixels: number[] }[] = []
  for (const effect of PHOTO_EFFECTS.filter(item => item.id !== 'none')) {
    await page.evaluate(style => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ effects: { photo: { style, intensity: 1, speed: 0 } } }), effect.id)
    const rendered = await pixels(page, await canvas.screenshot({ path: info.outputPath(`${effect.id}.png`) }))
    const difference = changed(neutral, rendered)
    expect(difference, effect.id).toBeGreaterThan(50)
    for (const previous of treatments) expect(changed(previous.pixels, rendered), `${previous.name} and ${effect.id} must differ`).toBeGreaterThan(30)
    treatments.push({ name: effect.id, pixels: rendered })
    results.push({ name: effect.id, pixelsChanged: difference })
    expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())).toEqual(meshIds)
  }
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ effects: { photo: { intensity: 0 } } }))
  const restored = await pixels(page, await canvas.screenshot())
  expect(changed(neutral, restored), '0% restores the original photograph').toBe(0)
  await info.attach('visible-photo-differences', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  expect(errors).toEqual([])
})

test('photo animation advances, stops at zero speed and stays still in reduced motion', async ({ page }) => {
  const { errors } = await mockGallery(page, { count: 1, config: {
    quality: 'mid', presetName: 'custom', customized: true,
    layout: { mode: 'grid', params: { composition: 'curated' }, transition: { style: 'none' } },
    background: { mode: 'solid', color: '#111111', motion: false }, particles: { enabled: false }, camera: { autoRotate: false },
    effects: { photo: { style: 'ripple', intensity: 1, speed: 1 }, photoFloat: false, photoEntrance: 'none', bloom: { enabled: false } },
    lighting: { timeOfDay: 'noon', autoColorAdapt: false, transitionDuration: .1 }
  } })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready)).toBe(1)
  const canvas = page.locator('canvas.webgl-canvas')
  const first = await pixels(page, await canvas.screenshot())
  await page.waitForTimeout(350) // Observe movement across actual GPU frames.
  expect(changed(first, await pixels(page, await canvas.screenshot()))).toBeGreaterThan(30)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ effects: { photo: { speed: 0 } } }))
  const stopped = await pixels(page, await canvas.screenshot())
  await page.waitForTimeout(350)
  expect(changed(stopped, await pixels(page, await canvas.screenshot()))).toBe(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ effects: { photo: { speed: 1 } } }))
  const reduced = await pixels(page, await canvas.screenshot())
  await page.waitForTimeout(350)
  expect(changed(reduced, await pixels(page, await canvas.screenshot()))).toBe(0)
  expect(errors).toEqual([])
})

test('every curated preset stays navigable on a phone, including reduced motion', async ({ page }) => {
  test.setTimeout(120000)
  const { errors } = await mockGallery(page, { config: VIEWER_PRESETS['jade-flow'] })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready)).toBeGreaterThan(0)
  for (const preset of Object.values(VIEWER_PRESETS).filter(item => item.layout.params?.composition === 'curated')) {
    await page.evaluate(config => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig(config), preset)
    await page.getByRole('button', { name: '下一张作品', exact: true }).click()
    const state = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot())
    expect(state.effectiveConfig.camera?.autoRotate).toBe(false)
    expect(state.plugins).toContain('PhotoSurface')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})
