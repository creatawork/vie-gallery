import { test, expect, type Page } from '@playwright/test'
import { VIEWER_PRESETS } from '@vie/gallery-contracts'
import { mockGallery } from '../../gallery-viewer/e2e/helpers/mockGallery'
async function fixture(page: Page) {
  let draft = JSON.stringify({ ...VIEWER_PRESETS.film, quality: 'high', visitorAllowDownload: true, extension: { future: 42 } }), saves = 0
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await mockGallery(page, { config: JSON.parse(draft) })
  await page.route('**/api/me', route => route.fulfill({ json: { role: 'OWNER', capabilities: ['GALLERY_READ', 'CONFIG_READ', 'CONFIG_WRITE'], user: { displayName: '测试策展人' }, tenant: { name: '配置验收' } } }))
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'fixture-csrf' } }))
  await page.route('**/api/galleries/config-fixture', route => route.fulfill({ json: { id: 'config-fixture', slug: 'effects-fixture', name: '配置验收', visibility: 'PUBLIC', status: 'PUBLISHED', createdAt: '2026-10-05T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ json: { token: 'test-only-preview', expiresAt: '2099-01-01T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/viewer-config', async route => {
    if (route.request().method() === 'PUT') { draft = route.request().postDataJSON().configJson; saves++ }
    await route.fulfill({ json: { configJson: draft, schemaVersion: 1 } })
  })
  await page.route('**/api/galleries/config-fixture/viewer-config/versions**', route => route.fulfill({ json: { items: [] } }))
  return { draft: () => JSON.parse(draft), saves: () => saves, errors }
}
test('complete parameters save, reload and apply to the real viewer iframe without reloading', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByLabel('照片间距').fill('1.5')
  await page.getByRole('tab', { name: '高级', exact: true }).click()
  await page.getByLabel('画质上限').selectOption('mid')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().quality).toBe('mid')
  expect(data.draft().layout.params.spacing).toBe(1.5)
  expect(data.draft().extension).toEqual({ future: 42 })
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(1.5)
  await page.getByRole('tab', { name: '基础', exact: true }).click()
  await page.getByLabel('照片间距').fill('2')
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(2)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('照片间距')).toHaveValue('2')
  await page.getByRole('tab', { name: '高级', exact: true }).click()
  await expect(page.getByLabel('画质上限')).toHaveValue('mid')
  expect(data.errors).toEqual([])
})
test('invalid color blocks writes and preset reset preserves quality, downloads and extensions', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.getByLabel('背景主色').fill('invalid')
  await expect(page.getByRole('alert').filter({ hasText: 'background.color' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled()
  await page.waitForTimeout(1000); expect(data.saves()).toBe(0)
  await page.getByLabel('背景主色').fill('#112233')
  await page.getByRole('button', { name: '恢复当前预设' }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.saves()).toBeGreaterThan(0)
  expect(data.draft().quality).toBe('high'); expect(data.draft().visitorAllowDownload).toBe(true)
  expect(data.draft().extension).toEqual({ future: 42 }); expect(data.draft().customized).toBe(false)
  expect(data.errors).toEqual([])
})
