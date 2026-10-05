import { test, expect } from '@playwright/test'
import { mockGallery } from './helpers/mockGallery'

for (const count of [200, 500]) test(`pagination to ${count} keeps photo identity and bounded texture residency`, async ({ page }) => {
  const { errors } = await mockGallery(page, { count, config: { quality: 'mid', effects: { photoEntrance: 'none', photoFloat: false }, particles: { enabled: false } } })
  const requests = new Map<string, number>()
  page.on('request', request => { if (request.url().includes('/fixtures/')) requests.set(request.url(), (requests.get(request.url()) ?? 0) + 1) })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.photoMeshIds().length)).toBe(50)
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().textures.resident)).toBeGreaterThan(0)
  const ids = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())
  for (let loaded = 100; loaded <= count; loaded += 50) {
    await page.getByRole('button', { name: '加载更多照片', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds().length)).toBe(loaded)
    const next = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())
    expect(next.slice(0, 50)).toEqual(ids)
    const textures = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().textures)
    expect(textures.resident).toBeLessThanOrEqual(textures.budget.resident)
    expect(textures.bytes).toBeLessThanOrEqual(textures.budget.bytes)
    expect(textures.active).toBeLessThanOrEqual(textures.budget.concurrent)
  }
  expect(requests.size).toBeGreaterThan(0)
  // Admission may legitimately evict textures. It must not restart all original URLs on append.
  expect([...requests.values()].filter(value => value > 1).length).toBeLessThan(50)
  expect(errors).toEqual([])
})

test('failed preview textures can retry and loading work cannot survive mode replacement', async ({ page }) => {
  const { errors } = await mockGallery(page, { count: 12, config: { effects: { photoEntrance: 'none' }, particles: { enabled: false } } })
  let failing = true
  await page.route('**/fixtures/photo-*.svg', async route => {
    if (failing) await route.fulfill({ status: 503, body: 'Injected texture failure' })
    else await route.fallback()
  })
  await page.goto('/g/effects-fixture')
  await expect(page.getByRole('button', { name: '重试照片预览' })).toBeVisible()
  failing = false
  await page.getByRole('button', { name: '重试照片预览' }).click()
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().textures.failed)).toBe(0)
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().textures.resident)).toBeGreaterThan(0)
  await page.getByRole('button', { name: '经典网格', exact: true }).click()
  await expect.poll(() => page.evaluate(() => !!window.__VIE_VIEWER_DIAGNOSTICS__)).toBe(false)
  await page.getByRole('button', { name: '3D 空间', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.photoMeshIds().length)).toBe(12)
  expect(errors.filter(message => !message.includes('503 (Service Unavailable)'))).toEqual([])
})
