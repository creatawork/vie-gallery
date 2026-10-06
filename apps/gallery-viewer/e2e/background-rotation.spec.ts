import { test, expect, type Page } from '@playwright/test'
import { mockGallery } from './helpers/mockGallery'

// 背景专用验收：固定时间、禁用粒子/自动巡航/照片浮动，单独比较背景区域，
// 避免照片位移造成假阳性。
async function fixedBackgroundPage(page: Page, background = { mode: 'image', color: '#1b1612', image: { url: '/g/backgrounds/film-gallery.webp?v=2026-10-06', projection: 'equirectangular' as const } }) {
  const { errors } = await mockGallery(page, {
    config: {
      quality: 'mid',
      background,
      particles: { enabled: false },
      camera: { autoRotate: false },
      effects: { photoFloat: false, photoEntrance: 'none', bloom: { enabled: false } }
    }
  })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => !!window.__VIE_VIEWER_DIAGNOSTICS__)).toBe(true)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.freezeTime(3))
  return errors
}

async function canvasClip(page: Page, fraction: { y: number; height: number }) {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('canvas not found')
  return { x: box.x, y: box.y + box.height * fraction.y, width: box.width, height: box.height * fraction.height }
}

test('panoramic background rotates with the camera and reports its projection', async ({ page }) => {
  const errors = await fixedBackgroundPage(page)
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().background.projection)).toBe('equirectangular')
  const info = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().background)
  expect(info.url).toContain('/g/backgrounds/film-gallery.webp')
  expect(info.width).toBeGreaterThan(0)
  expect(info.bytes).toBe(info.width * info.height * 4)

  const canvas = page.locator('canvas').first()
  const strip = await canvasClip(page, { y: 0.02, height: 0.18 })
  const before = await page.screenshot({ clip: strip })
  const beforeDirection = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().cameraDirection)

  await page.mouse.move(640, 400)
  await page.mouse.down()
  await page.mouse.move(360, 400, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(600)

  const afterDirection = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().cameraDirection)
  const turn = Math.hypot(afterDirection[0] - beforeDirection[0], afterDirection[2] - beforeDirection[2])
  expect(turn).toBeGreaterThan(0.1)

  const after = await page.screenshot({ clip: strip })
  expect(after.equals(before)).toBe(false)
  expect(errors).toEqual([])
})

test.describe('mobile touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('touch drag rotates the panoramic background on mobile viewport', async ({ page }) => {
    await fixedBackgroundPage(page)
    await page.waitForTimeout(400)
  const strip = await canvasClip(page, { y: 0.02, height: 0.18 })
  const before = await page.screenshot({ clip: strip })
  const beforeDirection = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().cameraDirection)

  // OrbitControls 监听 pointer 事件：用 CDP 派发真实触摸序列，驱动完整的浏览器合成管线。
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400 }] })
  for (const x of [270, 240, 210, 180, 150, 120]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 400 }] })
    await page.waitForTimeout(30)
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(600)

  const afterDirection = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().cameraDirection)
  const turn = Math.hypot(afterDirection[0] - beforeDirection[0], afterDirection[2] - beforeDirection[2])
  expect(turn).toBeGreaterThan(0.05)
  const after = await page.screenshot({ clip: strip })
  expect(after.equals(before)).toBe(false)
  })
})
