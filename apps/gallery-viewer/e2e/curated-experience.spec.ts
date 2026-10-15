import { test, expect } from '@playwright/test'
import { mockGallery } from './helpers/mockGallery'

test('visitor can morph between curated spaces and browse the exhibition', async ({ page }, info) => {
  const { errors } = await mockGallery(page)
  await page.goto('/g/effects-fixture')
  await expect(page.getByRole('button', { name: '螺旋', exact: true })).toBeVisible()
  for (const name of ['螺旋', '环幕', '波浪']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready ?? 0)).toBeGreaterThan(0)
    await page.screenshot({ path: info.outputPath(`${name}.png`) })
  }
  await page.getByRole('button', { name: '平面展览', exact: true }).click()
  await expect(page.locator('.photo-wall img').first()).toBeVisible()
  await page.locator('.photo-wall button').first().click()
  await expect(page.getByRole('dialog').first()).toBeVisible()
  expect(errors).toEqual([])
})
