import { test, expect } from '@playwright/test'
import { mockGallery } from './helpers/mockGallery'

test('visitor choreography keeps mesh identity, supports every composition, pause, focus, and exit', async ({ page }, info) => {
  const { errors } = await mockGallery(page, { count: 37, config: { quality: 'mid', particles: { enabled: false }, background: { type: 'color', color: '#182521' }, effects: { bloom: { enabled: false }, photoFloat: false, photoEntrance: 'none' } } })
  await page.goto('/g/effects-fixture')
  const dock = page.getByRole('region', { name: '照片编排' })
  await expect(dock).toBeVisible()
  const ids = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())
  const config = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requestedConfig)
  const modes = [['cloud', '浮游照片云'], ['ring', '轨道环廊'], ['fold', '折页长廊'], ['ribbon', '流动照片带'], ['stack', '层叠相册'], ['wall', '错落展墙'], ['diptych', '双联'], ['triptych', '三联'], ['fan', '扇形组照'], ['fragments', '主图与碎片']]
  for (const [id, name] of modes) {
    await page.getByLabel('照片排列与组合').selectOption({ label: name })
    await expect(dock).toHaveAttribute('data-mode', id)
    if (['cloud', 'ring', 'fold', 'ribbon', 'stack', 'wall'].includes(id)) {
      await page.waitForTimeout(1900)
      await page.screenshot({ path: info.outputPath(id + '-desktop.png') })
    }
    await expect(page.getByRole('button', { name: '退出编排' })).toBeVisible()
  }
  await page.getByLabel('照片排列与组合').selectOption('cloud')
  await page.waitForTimeout(1900)
  await expect.poll(() => page.evaluate(() => {
    const photos = window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().renderedPhotos
    return photos.visible > 0 && photos.visible === photos.ready
  })).toBe(true)
  await page.screenshot({ path: info.outputPath('cloud-desktop.png') })
  await page.getByRole('button', { name: '播放编排', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停编排', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '暂停编排', exact: true }).click()
  await expect(dock).toHaveAttribute('data-status', 'paused')
  await page.getByRole('button', { name: '继续编排', exact: true }).click()
  await expect(dock).toHaveAttribute('data-status', 'playing')
  await page.getByRole('button', { name: '下一组照片' }).click()
  await expect(dock).toHaveAttribute('data-status', 'idle')
  await page.locator('canvas').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(dock).toHaveAttribute('data-status', 'idle')
  await page.getByLabel('照片排列与组合').selectOption('triptych')
  await page.waitForTimeout(1800)
  await page.getByRole('button', { name: '查看当前主图' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: '退出编排' }).click()
  await expect(dock).toHaveAttribute('data-active', 'false')
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.photoMeshIds())).toEqual(ids)
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requestedConfig)).toEqual(config)
  expect(errors).toEqual([])
})

test('the complete authored show reaches each cue and finishes without looping', async ({ page }) => {
  test.setTimeout(90000)
  const { errors } = await mockGallery(page, { count: 24, config: { quality: 'mid', particles: { enabled: false }, effects: { bloom: { enabled: false }, photoFloat: false, photoEntrance: 'none' } } })
  await page.goto('/g/effects-fixture')
  await page.getByRole('button', { name: '播放编排', exact: true }).click()
  const dock = page.getByRole('region', { name: '照片编排' })
  await expect(dock).toHaveAttribute('data-mode', 'ring', { timeout: 18000 })
  await expect(dock).toHaveAttribute('data-mode', 'book', { timeout: 15000 })
  await expect(dock).toHaveAttribute('data-mode', 'tunnel', { timeout: 15000 })
  await expect(dock).toHaveAttribute('data-mode', 'focus', { timeout: 10000 })
  await expect(dock).toHaveAttribute('data-status', 'finished', { timeout: 15000 })
  await expect(dock).toHaveAttribute('data-mode', 'cloud')
  await expect.poll(() => page.evaluate(() => {
    const photos = window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().renderedPhotos
    return photos.visible > 0 && photos.visible === photos.ready
  })).toBe(true)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('mobile choreography fits controls and groups, honours reduced motion and tears down on 2D', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { errors } = await mockGallery(page, { count: 3, config: { quality: 'mid', particles: { enabled: false }, effects: { bloom: { enabled: false } } } })
  await page.goto('/g/effects-fixture')
  await page.getByLabel('照片排列与组合').selectOption('triptych')
  await expect(page.getByRole('region', { name: '照片编排' })).toHaveAttribute('data-mode', 'triptych')
  await expect(page.getByRole('button', { name: '播放编排', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('triptych-mobile.png') })
  await page.getByRole('button', { name: '平面展览', exact: true }).click()
  await expect(page.getByRole('region', { name: '照片编排' })).not.toBeVisible()
  await page.getByRole('button', { name: '空间漫游', exact: true }).click()
  await expect(page.getByRole('region', { name: '照片编排' })).toHaveAttribute('data-active', 'false')
  expect(errors).toEqual([])
})
