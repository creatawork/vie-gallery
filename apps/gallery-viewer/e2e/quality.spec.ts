import { test, expect } from '@playwright/test'
import { VIEWER_PRESETS } from '@vie/gallery-contracts'
import { mockGallery } from './helpers/mockGallery'

test('quality changes all budgets together while requested scene remains unchanged', async ({ page }) => {
  const { errors } = await mockGallery(page, { count: 50, config: { ...VIEWER_PRESETS['starry-night'], quality: 'high',
    camera: { autoRotate: false }, effects: { ...VIEWER_PRESETS['starry-night'].effects, photoFloat: false, photoEntrance: 'none' } } })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().effectiveQuality)).toBe('high')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.drainFrames().length)).toBeGreaterThan(0)
  const before = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot())
  const start = await page.evaluate(() => performance.now() + 10000)
  const samples = (from: number, count: number, fps: number) => page.evaluate(({ start, from, count, fps }) => Array.from({ length: count }, (_, i) => window.__VIE_VIEWER_DIAGNOSTICS__!.sampleQuality({ nowMs: start + (from + i) * 1000, fps, idle: false, hidden: false, loading: false, transitioning: false, contextLost: false })), { start, from, count, fps })
  const decisions = await page.evaluate(start => Array.from({ length: 3 }, (_, second) => window.__VIE_VIEWER_DIAGNOSTICS__!.sampleQuality({ nowMs: start + second * 1000, fps: 25, idle: false, hidden: false, loading: false, transitioning: false, contextLost: false })), start)
  expect(decisions.map(value => value.quality)).toEqual(['high', 'high', 'mid'])
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().textures.budget.maxEdge)).toBe(1024)
  let mid = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot())
  expect(mid.effectiveQuality).toBe('mid')
  expect(mid.postProcessing.width).toBeLessThan(before.postProcessing.width)
  expect(Object.values(mid.particleCounts).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(700)
  await samples(12, 3, 25)
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().textures.budget.maxEdge)).toBe(512)
  const low = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot())
  expect(low.effectiveQuality).toBe('low')
  expect(low.postProcessing.width).toBeLessThan(mid.postProcessing.width)
  expect(Object.values(low.particleCounts).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(200)
  expect(low.textures.bytes).toBeLessThanOrEqual(32 * 1024 ** 2)
  expect(low.textures.active).toBeLessThanOrEqual(2)
  expect(low.requested).toEqual(before.requested)
  await samples(25, 8, 60)
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().effectiveQuality)).toBe('mid')
  mid = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot())
  expect(mid.requested).toEqual(before.requested)
  const frames = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.drainFrames())
  expect(frames.length).toBeGreaterThan(0)
  expect(frames.length).toBeLessThanOrEqual(2400)
  expect(frames.every(frame => frame.cpuRenderMs >= 0 && frame.drawCalls > 0)).toBe(true)
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.drainFrames().length)).toBeLessThan(5)
  expect(errors).toEqual([])
})

test('idle windows do not lower manual low quality; five active bad windows provide a usable fallback', async ({ page }) => {
  const { errors } = await mockGallery(page, { config: { quality: 'low', particles: { enabled: false } } })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().effectiveQuality)).toBe('low')
  await page.evaluate(() => {
    const api = window.__VIE_VIEWER_DIAGNOSTICS__!, start = performance.now() + 1000
    for (let i = 0; i < 10; i++) api.sampleQuality({ nowMs: start + i * 1000, fps: 10, idle: true, hidden: false, loading: false, transitioning: false, contextLost: false })
  })
  expect(await page.evaluate(() => !!window.__VIE_VIEWER_DIAGNOSTICS__)).toBe(true)
  await page.evaluate(() => {
    const api = window.__VIE_VIEWER_DIAGNOSTICS__!, start = performance.now() + 20000
    for (let i = 0; i < 5; i++) api.sampleQuality({ nowMs: start + i * 1000, fps: 10, idle: false, hidden: false, loading: false, transitioning: false, contextLost: false })
  })
  await expect(page.getByText('已优化显示效果，继续使用经典画廊浏览。', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!window.__VIE_VIEWER_DIAGNOSTICS__)).toBe(false)
  await expect(page.locator('img').first()).toBeVisible()
  expect(errors).toEqual([])
})
