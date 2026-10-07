import { test, expect, type Page } from '@playwright/test'
import { VIEWER_PRESETS } from '@vie/gallery-contracts'
import { mockGallery } from '../../gallery-viewer/e2e/helpers/mockGallery'
async function fixture(page: Page) {
  let draft = JSON.stringify({ ...VIEWER_PRESETS['film-gallery'], quality: 'high', visitorAllowDownload: true, extension: { future: 42 } }), saves = 0
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
test('config side panel matches the designed look', async ({ page }) => {
  await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.locator('.side-heading')).toBeVisible()
  await expect(page.locator('.config-side')).toHaveCSS('background-color', 'rgb(247, 249, 248)')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await expect(page.locator('.preset-card')).toHaveCount(8)
  // 推荐场景卡片带“推荐”徽标；氛围页不再直接暴露原始参数
  await expect(page.locator('.preset-card').filter({ hasText: '星空夜曲' }).locator('.preset-recommend')).toBeVisible()
  await expect(page.getByLabel('背景类型')).toHaveCount(0)
  const selected = page.locator('.preset-card[aria-pressed="true"]')
  await expect(selected).toHaveCount(1)
  await expect(selected).toContainText('胶片展厅')
  await page.getByRole('tab', { name: '高级', exact: true }).click()
  await page.getByLabel('背景类型').selectOption('image')
  await expect(page.getByLabel('渐变角度')).toHaveCount(0)
  await expect(page.getByLabel('背景副色')).toHaveCount(0)
  await page.getByLabel('背景类型').selectOption('gradient')
  await expect(page.getByLabel('渐变角度')).toBeVisible()
  // 预设应用后，iframe 内的实时预览应加载全景背景并按等距柱状投影渲染。
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.locator('.preset-card').filter({ hasText: '极简空间' }).click()
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().background.projection)).toBe('equirectangular')
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `e2e/shots/config-panel-${width}.png`, fullPage: true })
  }
})

test('iframe reload restores the latest editor draft while its save is still in flight', async ({ page }) => {
  const data = await fixture(page)
  const serverDraft = data.draft()
  let releaseSave!: () => void
  const saveAllowed = new Promise<void>(resolve => releaseSave = resolve)
  await page.route('**/api/galleries/config-fixture/viewer-config', async route => {
    if (route.request().method() === 'PUT') await saveAllowed
    await route.fulfill({ json: { configJson: JSON.stringify(serverDraft), schemaVersion: 1 } })
  })
  try {
    await page.goto('/app/galleries/config-fixture/config')
    await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
    await page.getByLabel('照片间距').fill('2')
    const frame = page.frameLocator('iframe[title="展厅实时预览"]')
    const spacing = () => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)
    await expect.poll(spacing).toBe(2)
    const viewerFrame = page.frames().find(candidate => candidate.url().includes('/g/effects-fixture'))!
    await viewerFrame.goto(viewerFrame.url())
    await expect.poll(spacing).toBe(2)
    await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
    await expect(page.getByLabel('照片间距')).toHaveValue('2')
    expect(data.saves()).toBe(0)
    expect(data.errors).toEqual([])
  } finally { releaseSave() }
})
test('invalid color blocks writes and preset reset preserves quality, downloads and extensions', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '高级', exact: true }).click()
  await page.getByLabel('背景主色').fill('invalid')
  await expect(page.getByRole('alert').filter({ hasText: 'background.color' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled()
  await page.waitForTimeout(1000); expect(data.saves()).toBe(0)
  await page.getByLabel('背景主色').fill('#112233')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.getByRole('button', { name: '恢复当前预设' }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.saves()).toBeGreaterThan(0)
  expect(data.draft().quality).toBe('high'); expect(data.draft().visitorAllowDownload).toBe(true)
  expect(data.draft().extension).toEqual({ future: 42 }); expect(data.draft().customized).toBe(false)
  expect(data.errors).toEqual([])
})
