import { test, expect, type Page } from '@playwright/test'
import { PHOTO_ARRANGEMENTS, VIEWER_PRESETS, VIEWER_PRESET_CARDS } from '@vie/gallery-contracts'
import { mockGallery } from '../../gallery-viewer/e2e/helpers/mockGallery'

async function setSpacing(page: Page, value: number) {
  const slider = page.getByRole('slider', { name: '照片间距', exact: true })
  await expect(slider).toBeEnabled()
  const bounds = await slider.evaluate(input => {
    const range = input as HTMLInputElement
    return { min: Number(range.min), max: Number(range.max), step: Number(range.step) }
  })
  const fromStart = Math.round((value - bounds.min) / bounds.step)
  const fromEnd = Math.round((bounds.max - value) / bounds.step)
  await slider.press(fromStart <= fromEnd ? 'Home' : 'End')
  for (let step = 0; step < Math.min(fromStart, fromEnd); step++) await slider.press(fromStart <= fromEnd ? 'ArrowRight' : 'ArrowLeft')
  await expect(slider).toHaveValue(String(value))
}

function arrangementButton(page: Page, id: typeof PHOTO_ARRANGEMENTS[number]['id']) {
  const arrangement = PHOTO_ARRANGEMENTS.find(item => item.id === id)!
  return page.getByRole('group', { name: '照片编排', exact: true }).getByRole('button', { name: `${arrangement.label} · ${arrangement.caption}`, exact: true })
}

async function fixture(page: Page) {
  let draft = JSON.stringify({ ...VIEWER_PRESETS['film-gallery'], quality: 'high', visitorAllowDownload: true, extension: { future: 42 } }), saves = 0
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await mockGallery(page, { config: JSON.parse(draft), shared: true })
  await page.route('**/api/me', route => route.fulfill({ json: { role: 'OWNER', capabilities: ['GALLERY_READ', 'CONFIG_READ', 'CONFIG_WRITE'], user: { displayName: '测试策展人' }, tenant: { name: '配置验收' } } }))
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'fixture-csrf' } }))
  await page.route('**/api/galleries/config-fixture', route => route.fulfill({ json: { id: 'config-fixture', slug: 'effects-fixture', name: '配置验收', visibility: 'PUBLIC', status: 'PUBLISHED', createdAt: '2026-10-05T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/publish-readiness', route => route.fulfill({ json: { galleryStatus: 'PUBLISHED', readyPhotoCount: 12, galleryPublishable: true, configDraftChanged: true, publishedAt: '2026-10-05T00:00:00Z', blockers: [] } }))
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ json: { token: 'test-only-preview', expiresAt: '2099-01-01T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/viewer-config', async route => {
    if (route.request().method() === 'PUT') { draft = route.request().postDataJSON().configJson; saves++ }
    await route.fulfill({ json: { configJson: draft, schemaVersion: 1 } })
  })
  await page.route('**/api/galleries/config-fixture/viewer-config/versions**', route => {
    const item = { id: 'version-1', galleryId: 'config-fixture', configJson: draft, schemaVersion: 1, createdAt: '2026-10-07T00:00:00Z', versionNumber: '1', title: null, note: null, isCurrent: true }
    return route.fulfill({ json: route.request().url().includes('/versions?') ? { items: [item], total: 1, page: 0, pageSize: 20 } : item })
  })
  return { draft: () => JSON.parse(draft), saves: () => saves, errors }
}

test('photo treatments and arrangement persist and reach the real preview without a reload', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  await page.locator('.preset-card').filter({ hasText: '极光星河' }).click()
  await expect(page.locator('.preset-detail')).toContainText('全息扫描')
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  const treatments = page.getByRole('group', { name: '照片处理', exact: true })
  await expect(treatments.getByRole('button', { name: '全息扫描', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await treatments.getByRole('button', { name: '水波折射', exact: true }).click()
  await page.getByRole('slider', { name: '处理强度', exact: true }).press('End')
  await page.getByRole('slider', { name: '处理强度', exact: true }).press('ArrowLeft')
  await page.getByRole('slider', { name: '流动速度', exact: true }).press('Home')
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().effectiveConfig.effects.photo)).toEqual({ style: 'ripple', intensity: .99, speed: 0 })
  await arrangementButton(page, 'fan').click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().layout.params.arrangement).toBe('fan')
  expect(data.draft().layout.mode).toBe('carousel')
  expect(data.draft().effects.photo).toEqual({ style: 'ripple', intensity: .99, speed: 0 })
  expect(data.draft().extension).toEqual({ future: 42 })
  await page.reload()
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await expect(arrangementButton(page, 'fan')).toHaveAttribute('aria-pressed', 'true')
  await expect(treatments.getByRole('button', { name: '水波折射', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('slider', { name: '处理强度', exact: true })).toHaveValue('0.99')
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  const image = page.locator('.preset-card img').first()
  await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(320)
  expect(data.errors).toEqual([])
})
test('style categories narrow complete looks without changing the current draft', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.getByRole('tab', { name: '风格', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: '风格', exact: true })).toBeVisible()
  const categories = page.getByRole('group', { name: '风格分类', exact: true })
  await expect(page.locator('.preset-card')).toHaveCount(16)
  for (const [name, category] of [['照片艺术', 'light'], ['全景空间', 'panorama']] as const) {
    const filter = categories.getByRole('button', { name: new RegExp(`^${name}`) })
    await filter.click()
    await expect(filter).toHaveAttribute('aria-pressed', 'true')
    const expectedCards = VIEWER_PRESET_CARDS.filter(card => card.category === category)
    await expect(page.locator('.preset-card')).toHaveCount(expectedCards.length)
    for (const card of expectedCards) await expect(page.locator('.preset-card').filter({ hasText: card.label })).toBeVisible()
    await expect(page.locator('.selected-look')).toContainText('胶片展厅')
  }
  await categories.getByRole('button', { name: /^全部风格/ }).click()
  await expect(page.locator('.preset-card')).toHaveCount(16)
  expect(data.draft().presetName).toBe('film-gallery')
  expect(data.draft().customized).toBe(false)
  expect(data.saves()).toBe(0)
  expect(data.errors).toEqual([])
})

test('every visual arrangement applies its matching geometry and preserves the selected look', async ({ page }) => {
  test.setTimeout(60000)
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.locator('.preset-card').filter({ hasText: '翡翠流光' }).click()
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await expect(page.getByRole('group', { name: '照片编排', exact: true }).getByRole('button')).toHaveCount(10)
  await expect(page.getByRole('combobox', { name: '空间布局', exact: true })).toHaveCount(0)
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  for (const arrangement of PHOTO_ARRANGEMENTS) {
    await arrangementButton(page, arrangement.id).click()
    await expect(arrangementButton(page, arrangement.id)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => {
      const config = window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested
      return { mode: config?.layout.mode, composition: config?.layout.params?.composition, arrangement: config?.layout.params?.arrangement }
    })).toEqual({ mode: arrangement.mode, composition: 'curated', arrangement: arrangement.id })
    const config = await frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requested)
    expect(config.background).toEqual(VIEWER_PRESETS['jade-flow'].background)
    expect(config.effects.photo).toEqual(VIEWER_PRESETS['jade-flow'].effects.photo)
  }
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().layout.params.arrangement).toBe('stack')
  expect(data.draft().layout.mode).toBe('grid')
  await page.reload()
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await expect(arrangementButton(page, 'stack')).toHaveAttribute('aria-pressed', 'true')
  expect(data.errors).toEqual([])
})

test('photo treatments expose relevant controls and original photo selection persists', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  const categories = page.getByRole('group', { name: '照片处理分类', exact: true })
  const treatments = page.getByRole('group', { name: '照片处理', exact: true })
  await categories.getByRole('button', { name: '材质', exact: true }).click()
  await treatments.getByRole('button', { name: '美术纸印', exact: true }).click()
  await expect(page.getByRole('slider', { name: '处理强度', exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: '流动速度', exact: true })).toHaveCount(0)
  await categories.getByRole('button', { name: '流动', exact: true }).click()
  await treatments.getByRole('button', { name: '水波折射', exact: true }).click()
  await expect(page.getByRole('slider', { name: '流动速度', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保留原片', exact: true }).click()
  await expect(page.getByRole('button', { name: '保留原片', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('slider', { name: '处理强度', exact: true })).toHaveCount(0)
  await expect(page.getByRole('slider', { name: '流动速度', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().effects.photo.style).toBe('none')
  await page.reload()
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await expect(page.getByRole('button', { name: '保留原片', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(data.errors).toEqual([])
})

test('read-only curators can inspect styles and versions without editing or publishing', async ({ page }) => {
  const data = await fixture(page)
  await page.route('**/api/me', route => route.fulfill({ json: { role: 'VIEWER', capabilities: ['GALLERY_READ', 'CONFIG_READ'], user: { displayName: '只读策展人' }, tenant: { name: '配置验收' } } }))
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.locator('.preset-card')).toHaveCount(16)
  for (const card of await page.locator('.preset-card').all()) await expect(card).toBeDisabled()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '同步到访客端', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await expect(page.getByRole('slider', { name: '照片间距', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '保留原片', exact: true })).toBeDisabled()
  const composition = page.getByRole('group', { name: '观看方式', exact: true })
  for (const button of await composition.getByRole('button').all()) await expect(button).toBeDisabled()
  await page.getByRole('tab', { name: '版本', exact: true }).click()
  await expect(page.getByRole('heading', { name: '版本历史', exact: true })).toBeVisible()
  await expect(page.locator('.history-actions')).toHaveCount(0)
  expect(data.saves()).toBe(0)
  expect(data.errors).toEqual([])
})

test('book composition shows relevant controls and restores the existing treatment and motion settings', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.locator('.preset-card').filter({ hasText: '翡翠流光' }).click()
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await setSpacing(page, 1.5)
  await page.getByRole('group', { name: '照片处理分类', exact: true }).getByRole('button', { name: '流动', exact: true }).click()
  await page.getByRole('group', { name: '照片处理', exact: true }).getByRole('button', { name: '水波折射', exact: true }).click()
  await page.getByRole('slider', { name: '处理强度', exact: true }).press('End')
  await page.getByRole('slider', { name: '处理强度', exact: true }).press('ArrowLeft')
  await page.getByRole('slider', { name: '流动速度', exact: true }).press('Home')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.locator('summary').filter({ hasText: '运动与画质' }).click()
  await page.getByRole('slider', { name: '浮动幅度', exact: true }).press('End')
  await page.getByRole('slider', { name: '浮动幅度', exact: true }).press('ArrowLeft')
  await page.getByRole('slider', { name: '浮动速度', exact: true }).press('Home')
  await page.getByRole('combobox', { name: '照片入场', exact: true }).selectOption('rise')
  await page.getByRole('spinbutton', { name: /^入场时间/ }).fill('1.1')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().effects.entranceDuration).toBe(1.1)
  const authored = data.draft()

  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await arrangementButton(page, 'book').click()
  await expect(page.getByRole('slider', { name: '照片大小', exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: '照片间距', exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '照片处理', exact: true })).toHaveCount(0)
  await expect(page.getByRole('slider', { name: '处理强度', exact: true })).toHaveCount(0)
  await expect(page.getByRole('slider', { name: '流动速度', exact: true })).toHaveCount(0)
  await expect(page.locator('.book-note')).toContainText('原有处理设置会保留')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.locator('summary').filter({ hasText: '运动与画质' }).click()
  await expect(page.getByRole('switch', { name: '轻微浮动', exact: true })).toHaveCount(0)
  await expect(page.getByRole('slider', { name: '浮动幅度', exact: true })).toHaveCount(0)
  await expect(page.getByRole('slider', { name: '浮动速度', exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '照片入场', exact: true })).toHaveCount(0)
  await expect(page.getByRole('spinbutton', { name: /^入场时间/ })).toHaveCount(0)

  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await arrangementButton(page, 'ribbon').click()
  await expect(page.getByRole('slider', { name: '照片间距', exact: true })).toHaveValue('1.5')
  await expect(page.getByRole('group', { name: '照片处理', exact: true }).getByRole('button', { name: '水波折射', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('slider', { name: '处理强度', exact: true })).toHaveValue('0.99')
  await expect(page.getByRole('slider', { name: '流动速度', exact: true })).toHaveValue('0')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.locator('summary').filter({ hasText: '运动与画质' }).click()
  await expect(page.getByRole('switch', { name: '轻微浮动', exact: true })).toBeChecked()
  await expect(page.getByRole('slider', { name: '浮动幅度', exact: true })).toHaveValue('1.99')
  await expect(page.getByRole('slider', { name: '浮动速度', exact: true })).toHaveValue('0')
  await expect(page.getByRole('combobox', { name: '照片入场', exact: true })).toHaveValue('rise')
  await expect(page.getByRole('spinbutton', { name: /^入场时间/ })).toHaveValue('1.1')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().layout.params.arrangement).toBe('ribbon')
  expect(data.draft().effects).toEqual(authored.effects)
  expect(data.draft().layout.params.spacing).toBe(authored.layout.params.spacing)
  expect(data.errors).toEqual([])
})

test('invalid fields remain repairable after switching backgrounds or disabling their effect group', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.getByRole('combobox', { name: '背景类型', exact: true }).selectOption('solid')
  const backgroundColor = page.getByRole('textbox', { name: '背景主色', exact: true })
  await backgroundColor.fill('invalid')
  await page.getByRole('combobox', { name: '背景类型', exact: true }).selectOption('image')
  await expect(backgroundColor).toBeVisible()
  await expect(backgroundColor).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert').filter({ hasText: 'background.color' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled()
  await backgroundColor.fill('#112233')
  await expect(backgroundColor).toHaveCount(0)

  await page.getByRole('switch', { name: '远景薄雾', exact: true }).check()
  await page.locator('summary').filter({ hasText: /^远景薄雾细调$/ }).click()
  const density = page.getByRole('spinbutton', { name: '薄雾浓度', exact: true })
  await density.fill('0.02')
  await expect(density).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('switch', { name: '远景薄雾', exact: true }).uncheck()
  await expect(density).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'effects.fog.density' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await expect(density).toBeVisible()
  await expect(density).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('details').filter({ has: density })).toHaveAttribute('open', '')
  await density.fill('0.0007')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().effects.fog.density).toBe(.0007)
  expect(data.draft().effects.fog.enabled).toBe(false)
  expect(data.draft().background.mode).toBe('image')
  expect(data.draft().background.color).toBe('#112233')
  expect(data.errors).toEqual([])
})

test('editor is usable while the preview token is still pending', async ({ page }) => {
  await fixture(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/galleries/config-fixture/preview-token', async route => {
    await pending
    await route.fulfill({ json: { token: 'test-only-preview', expiresAt: '2099-01-01T00:00:00Z' } })
  })
  try {
    await page.goto('/app/galleries/config-fixture/config')
    await page.getByRole('tab', { name: '编排', exact: true }).click()
    await expect(page.getByLabel('照片间距')).toBeEnabled({ timeout: 2000 })
    await expect(page.getByLabel('照片间距')).toHaveValue('1')
    release()
    await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
  } finally { release() }
})

test('preview background loads while photo downloads and optional effects are pending', async ({ page }) => {
  await fixture(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/fixtures/photo-*', async route => { await pending; await route.fallback() })
  await page.route('**/assets/PostProcessing-*.js', async route => { await pending; await route.continue() })
  try {
    await page.goto('/app/galleries/config-fixture/config')
    const frame = page.frameLocator('iframe[title="展厅实时预览"]')
    await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
    await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().background.width)).toBeGreaterThan(0)
  } finally { release() }
})

test('preview token failure leaves the editor usable and can be retried', async ({ page }) => {
  const data = await fixture(page)
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ status: 503 }))
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await expect(page.getByLabel('照片间距')).toBeEnabled()
  await expect(page.getByRole('button', { name: '重试连接' })).toBeVisible()
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ json: { token: 'test-only-preview', expiresAt: '2099-01-01T00:00:00Z' } }))
  await page.getByRole('button', { name: '重试连接' }).click()
  await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
  expect(data.errors).toEqual([])
})

test('complete parameters save, reload and apply to the real viewer iframe without reloading', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await setSpacing(page, 1.5)
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.locator('summary').filter({ hasText: '运动与画质' }).click()
  await page.getByLabel('画质上限').selectOption('mid')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.draft().quality).toBe('mid')
  expect(data.draft().layout.params.spacing).toBe(1.5)
  expect(data.draft().extension).toEqual({ future: 42 })
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(1.5)
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await setSpacing(page, 2)
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(2)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.reload()
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await expect(page.getByLabel('照片间距')).toHaveValue('2')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.locator('summary').filter({ hasText: '运动与画质' }).click()
  await expect(page.getByLabel('画质上限')).toHaveValue('mid')
  expect(data.errors).toEqual([])
})
test('late bootstrap updates the running preview engine before acknowledging the draft', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
  const config = data.draft()
  config.layout.params.spacing = 2.2
  await page.evaluate(config => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="展厅实时预览"]')!
    iframe.contentWindow!.postMessage({ type: 'VIE_PREVIEW_BOOTSTRAP', sequence: 1000001, config }, new URL(iframe.src).origin)
  }, config)
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(2.2)
  expect(data.errors).toEqual([])
})

test('bootstrap arriving during engine init waits for READY before applying the latest draft', async ({ page }) => {
  const data = await fixture(page)
  const serverConfig = data.draft()
  serverConfig.layout.params.spacing = 2.2
  await page.route('**/api/public/g/effects-fixture/viewer-config', route => route.fulfill({ json: { configJson: JSON.stringify(serverConfig), schemaVersion: 1 } }))
  await page.addInitScript(() => {
    const state = window as typeof window & { heldBootstrap?: MessageEvent; previewEngineCreated?: boolean; bootstrapReceipts?: number }
    if (window.parent === window) {
      state.bootstrapReceipts = 0
      window.addEventListener('message', event => {
        if (event.data?.type === 'VIE_PREVIEW_BOOTSTRAP_APPLIED') state.bootstrapReceipts!++
      })
      return
    }
    window.addEventListener('message', event => {
      if (event.data?.type === 'VIE_PREVIEW_BOOTSTRAP' && !state.previewEngineCreated) {
        event.stopImmediatePropagation()
        state.heldBootstrap = event
      }
    })
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof getContext>) {
      const context = Reflect.apply(getContext, this, args)
      if (context && String(args[0]).startsWith('webgl')) state.previewEngineCreated = true
      return context
    } as typeof getContext
  })
  let releasePlugins!: () => void
  const pluginsAllowed = new Promise<void>(resolve => { releasePlugins = resolve })
  await page.route('**/assets/LayoutPlugin-*.js', async route => { await pluginsAllowed; await route.continue() })
  try {
    await page.goto('/app/galleries/config-fixture/config')
    await expect.poll(() => page.frames().some(frame => frame.url().includes('/g/effects-fixture'))).toBe(true)
    const viewerFrame = page.frames().find(frame => frame.url().includes('/g/effects-fixture'))!
    await expect.poll(() => viewerFrame.evaluate(() => (window as typeof window & { previewEngineCreated?: boolean }).previewEngineCreated)).toBe(true)
    await viewerFrame.evaluate(() => {
      const event = (window as typeof window & { heldBootstrap?: MessageEvent }).heldBootstrap!
      window.dispatchEvent(new MessageEvent('message', { data: event.data, source: event.source, origin: event.origin }))
    })
    // A same-frame barrier ensures any premature receipt has reached the parent.
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => (window as typeof window & { bootstrapReceipts?: number }).bootstrapReceipts)).toBe(0)
    releasePlugins()
    await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
    await expect.poll(() => viewerFrame.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(1)
    expect(data.errors).toEqual([])
  } finally { releasePlugins() }
})

test('manual reapply restores the editor draft even when it has not changed', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await frame.locator('canvas.webgl-canvas').evaluate(async () => {
    await window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ layout: { params: { spacing: 2.2 } } } as never)
  })
  await page.getByRole('button', { name: '重新应用', exact: true }).click()
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(1)
  expect(data.errors).toEqual([])
})

test('config side panel matches the designed look', async ({ page }, info) => {
  await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.locator('.side-heading')).toBeVisible()
  await expect(page.locator('.config-side')).toHaveCSS('background-color', 'rgb(255, 254, 250)')
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  await expect(page.locator('.preset-card')).toHaveCount(16)
  // 风格页优先展示完整方案，细调参数在其他分区。
  await expect(page.locator('.preset-card').filter({ hasText: '翡翠流光' }).locator('.preset-recommend')).toBeVisible()
  await expect(page.getByLabel('背景类型')).toHaveCount(0)
  const selected = page.locator('.preset-card[aria-pressed="true"]')
  await expect(selected).toHaveCount(1)
  await expect(selected).toContainText('胶片展厅')
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.getByLabel('背景类型').selectOption('image')
  await expect(page.getByLabel('渐变角度')).toHaveCount(0)
  await expect(page.getByLabel('背景副色')).toHaveCount(0)
  await page.getByLabel('背景类型').selectOption('gradient')
  await expect(page.getByRole('slider', { name: '渐变角度', exact: true })).toBeHidden()
  await page.locator('summary').filter({ hasText: '渐变细调' }).click()
  await expect(page.getByLabel('渐变角度')).toBeVisible()
  // 预设应用后，iframe 内的实时预览应加载全景背景并按等距柱状投影渲染。
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  await page.locator('.preset-card').filter({ hasText: '极简空间' }).click()
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect.poll(() => frame.locator('canvas.webgl-canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().background.projection)).toBe('equirectangular')
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`config-panel-${width}.png`), fullPage: true })
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
    await page.getByRole('tab', { name: '编排', exact: true }).click()
    await setSpacing(page, 2)
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
  await page.getByRole('tab', { name: '氛围', exact: true }).click()
  await page.getByRole('combobox', { name: '背景类型', exact: true }).selectOption('solid')
  await page.getByRole('textbox', { name: '背景主色', exact: true }).fill('invalid')
  await expect(page.getByRole('alert').filter({ hasText: 'background.color' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled()
  await page.waitForTimeout(1000); expect(data.saves()).toBe(0)
  await page.getByRole('textbox', { name: '背景主色', exact: true }).fill('#112233')
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  await page.getByRole('button', { name: '恢复当前预设' }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => data.saves()).toBeGreaterThan(0)
  expect(data.draft().quality).toBe('high'); expect(data.draft().visitorAllowDownload).toBe(true)
  expect(data.draft().extension).toEqual({ future: 42 }); expect(data.draft().customized).toBe(false)
  expect(data.errors).toEqual([])
})

test('publishing metadata counts Unicode code points and sends normalized optional fields', async ({ page }) => {
  const data = await fixture(page)
  let request: { title?: string | null; note?: string | null } | null = null
  await page.route('**/api/galleries/config-fixture/viewer-config/publish', async route => {
    request = route.request().postDataJSON()
    await route.fulfill({ json: { id: 'version-2', versionNumber: '2', title: request?.title, note: request?.note, isCurrent: true, createdAt: '2026-10-08T00:00:00Z' } })
  })
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('button', { name: '同步到访客端' }).click()
  await page.getByLabel('版本名称（选填）').fill('春'.repeat(61))
  await expect(page.getByRole('alert').filter({ hasText: '最多 60 个字符' })).toBeVisible()
  await page.getByRole('button', { name: '确认同步' }).click()
  expect(request).toBeNull()

  await page.getByLabel('版本名称（选填）').fill(`  ${'春'.repeat(60)}  `)
  await page.getByLabel('备注（选填）').fill('第一行 😀\n第二行')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '确认同步' }).click()
  await expect.poll(() => request?.title).toBe('春'.repeat(60))
  expect(request?.note).toBe('第一行 😀\n第二行')
  expect(data.errors).toEqual([])
})

test('publishing a new preset cannot skip the version when legacy readiness says unchanged', async ({ page }) => {
  const data = await fixture(page)
  const previous = JSON.stringify(VIEWER_PRESETS['ocean-breeze'])
  let draft = previous, published = previous, publishes = 0
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ status: 503 }))
  await page.route('**/api/galleries/config-fixture/viewer-config', async route => {
    if (route.request().method() === 'PUT') draft = route.request().postDataJSON().configJson
    await route.fulfill({ json: { configJson: draft, publishedConfigJson: previous, publishedVersionId: 'version-1', lastPublishedAt: null, schemaVersion: 1 } })
  })
  await page.route('**/api/galleries/config-fixture/viewer-config/versions**', route => {
    const version = { id: publishes ? 'version-2' : 'version-1', galleryId: 'config-fixture', configJson: published, schemaVersion: 1,
      createdAt: '2026-10-07T00:00:00Z', versionNumber: publishes ? '2' : '1', title: null, note: null, isCurrent: true }
    return route.fulfill({ json: route.request().url().includes('/versions?') ? { items: [version], total: 1, page: 0, pageSize: 20 } : version })
  })
  await page.route('**/api/galleries/config-fixture/publish-readiness', route => route.fulfill({ json: {
    galleryStatus: 'PUBLISHED', readyPhotoCount: 17, galleryPublishable: true, configDraftChanged: false,
    publishedConfigVersionId: 'version-1', lastConfigPublishedAt: null, blockers: []
  } }))
  await page.route('**/api/galleries/config-fixture/viewer-config/publish', route => {
    publishes++; published = draft
    return route.fulfill({ json: { id: 'version-2', versionNumber: '2', createdAt: '2026-10-15T09:30:00Z' } })
  })
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  await page.getByRole('button', { name: /星空夜曲/ }).click()
  await page.getByRole('button', { name: '同步到访客端', exact: true }).click()
  await page.getByRole('button', { name: '确认同步', exact: true }).click()
  await expect.poll(() => publishes).toBe(1)
  expect(JSON.parse(published).presetName).toBe('starry-night')
  expect(JSON.parse(published).particles.enabled).toBe(true)
  await expect(page.getByText('已发布 v2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '同步到访客端', exact: true }).click()
  await page.getByRole('button', { name: '发布展厅', exact: true }).click()
  await expect(page.getByText('配置已同步到访客端。', { exact: true })).toBeVisible()
  expect(publishes).toBe(1)
  expect(data.errors).toEqual([])
})

test('draft and publish states are explicit, and a draft gallery can go live in one click from config', async ({ page }) => {
  let draft = JSON.stringify({ ...VIEWER_PRESETS['film-gallery'] })
  const calls: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await mockGallery(page, { config: JSON.parse(draft) })
  await page.route('**/api/me', route => route.fulfill({ json: { role: 'OWNER', capabilities: ['GALLERY_READ', 'CONFIG_READ', 'CONFIG_WRITE', 'PUBLISH'], user: { displayName: '测试策展人' }, tenant: { name: '配置验收' } } }))
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'fixture-csrf' } }))
  await page.route('**/api/galleries/config-fixture', route => route.fulfill({ json: { id: 'config-fixture', slug: 'effects-fixture', name: '配置验收', visibility: 'PUBLIC', status: 'DRAFT', createdAt: '2026-10-05T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/publish-readiness', route => route.fulfill({ json: { galleryStatus: 'DRAFT', readyPhotoCount: 12, galleryPublishable: true, configDraftChanged: true, publishedAt: null, blockers: [] } }))
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ json: { token: 'test-only-preview', expiresAt: '2099-01-01T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/viewer-config', async route => {
    if (route.request().method() === 'PUT') { draft = route.request().postDataJSON().configJson; calls.push('save-draft') }
    await route.fulfill({ json: { configJson: draft, schemaVersion: 1 } })
  })
  const publishedVersion = () => ({
    id: 'version-1', galleryId: 'config-fixture', versionNumber: '1', title: '历史版本 v1', note: null,
    configJson: draft, presetName: 'film-gallery', schemaVersion: 1,
    createdAt: '2026-10-07T00:00:00Z', createdByUserId: null, isCurrent: true
  })
  await page.route('**/api/galleries/config-fixture/viewer-config/versions?*', route => route.fulfill({ json: { items: [publishedVersion()], page: 0, pageSize: 20, total: 1 } }))
  await page.route('**/api/galleries/config-fixture/viewer-config/versions/version-1', route => route.fulfill({ json: publishedVersion() }))
  // 注意：Playwright 后注册的路由优先匹配，publish 路由必须注册在 viewer-config 之后
  await page.route('**/api/galleries/config-fixture/viewer-config/publish', async route => {
    calls.push('config-publish')
    await route.fulfill({ json: publishedVersion() })
  })
  await page.route(new RegExp('/api/galleries/config-fixture/publish$'), async route => {
    calls.push('gallery-publish')
    await route.fulfill({ json: { id: 'config-fixture', status: 'PUBLISHED' } })
  })
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.getByText('尚未发布')).toBeVisible()
  const publishButton = page.getByRole('button', { name: '发布展厅' })
  await expect(publishButton).toBeVisible()
  await publishButton.click()
  await page.getByRole('button', { name: '确认发布' }).click()
  await expect(page.getByText(/已发布 v1/)).toBeVisible()
  // 按钮切回“同步到访客端”意味着画廊发布（第二步）也已完成，避免在配置同步与画廊发布之间断言 calls
  await expect(page.getByRole('button', { name: '同步到访客端' })).toBeVisible()
  expect(calls).toEqual(['config-publish', 'gallery-publish'])
  expect(errors).toEqual([])
})

test('configuration publishing checks fresh access blockers before creating a version', async ({ page }) => {
  await fixture(page)
  let versionPublishCalls = 0
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ status: 503 }))
  await page.route('**/api/galleries/config-fixture/publish-readiness', route => route.fulfill({ json: { galleryStatus: 'DRAFT', readyPhotoCount: 12, galleryPublishable: false, configDraftChanged: true, publishedAt: null, blockers: [{ code: 'PASSWORD_REQUIRED', message: '请先设置展厅访问密码，再发布展厅。' }] } }))
  await page.route('**/api/galleries/config-fixture/viewer-config/publish', route => { versionPublishCalls++; return route.fulfill({ status: 500 }) })
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('button', { name: '同步到访客端' }).click()
  await page.getByRole('button', { name: '确认同步' }).click()
  await expect(page.getByText('请先设置展厅访问密码，再发布展厅。')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '发布展厅', exact: true })).toBeVisible()
  expect(versionPublishCalls).toBe(0)
})

test('configuration sections support keyboard tab navigation', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ status: 503 }))
  await page.goto('/app/galleries/config-fixture/config')
  await page.getByRole('tab', { name: '风格', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: '编排', exact: true })).toBeFocused()
  await expect(page.getByRole('tabpanel', { name: '编排', exact: true })).toBeVisible()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: '版本', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: '风格', exact: true })).toBeFocused()
})

test('creator previews ignore visitor 2D preferences without overwriting them', async ({ page }) => {
  const data = await fixture(page)
  await page.context().addInitScript(() => {
    localStorage.setItem('vie:view-mode', '2d')
    localStorage.setItem('vie-gallery-viewer-preference', JSON.stringify({ background: { mode: 'solid', color: '#ff0000' }, layout: { mode: 'random' } }))
  })
  await page.goto('/app/galleries/config-fixture/config')
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
  await expect(frame.locator('canvas.webgl-canvas')).toBeVisible()
  const requested = await frame.locator('canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requested)
  expect(requested.background).toEqual(data.draft().background)
  expect(requested.layout).toEqual(data.draft().layout)
  expect(await frame.locator('canvas').evaluate(() => localStorage.getItem('vie:view-mode'))).toBe('2d')
  expect(data.errors).toEqual([])
})

test('all sixteen looks replace the active composition and background in the same iframe', async ({ page }, info) => {
  test.setTimeout(180000)
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  const viewerFrame = page.frames().find(candidate => candidate.url().includes('/g/effects-fixture'))!
  const initialUrl = viewerFrame.url()
  for (const [name, expected] of Object.entries(VIEWER_PRESETS)) {
    const card = VIEWER_PRESET_CARDS.find(item => item.name === name)!
    await page.locator('.preset-card').filter({ hasText: card.label }).click()
    await expect.poll(() => viewerFrame.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.presetName)).toBe(name)
    const snapshot = await viewerFrame.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot())
    expect(snapshot.requested.layout).toEqual(expected.layout)
    expect(snapshot.requested.background?.mode).toBe(expected.background?.mode)
    expect(snapshot.requested.background?.motion).toBe(expected.background?.motion)
    const curated = expected.layout.params?.composition === 'curated'
    expect(snapshot.plugins.includes('SpatialStage')).toBe(curated)
    expect(snapshot.plugins.includes('Layout')).toBe(!curated)
    expect(snapshot.plugins.includes('PhotoFade')).toBe(!curated)
    if (expected.background?.mode === 'image') await expect.poll(() => viewerFrame.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().background.projection)).toBe('equirectangular')
    else expect(snapshot.background.url).toBeNull()
    expect(viewerFrame.url()).toBe(initialUrl)
  }
  await page.locator('.preset-card').filter({ hasText: '翡翠流光' }).click()
  await expect.poll(() => frame.locator('canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.presetName)).toBe('jade-flow')
  await page.screenshot({ path: info.outputPath('effects-unified-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('effects-unified-mobile.png'), fullPage: true })
  expect(data.errors).toEqual([])
})

test('new window previews share unsaved edits and keep the entire viewport in one scene', async ({ page }, info) => {
  test.setTimeout(90000)
  const data = await fixture(page)
  await page.goto('/app/galleries/config-fixture/config')
  await expect(page.locator('.live-preview')).toHaveClass(/is-ready/)
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await setSpacing(page, 1.73)
  const opened = page.waitForEvent('popup')
  await page.getByRole('button', { name: '新窗口预览' }).click()
  const popup = await opened
  const errors: string[] = []
  popup.on('pageerror', error => errors.push(error.message))
  await popup.waitForURL(/live=config/)
  await expect.poll(() => popup.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(1.73)
  await page.getByRole('tab', { name: '风格', exact: true }).click()
  await page.locator('.preset-card').filter({ hasText: '深海潮汐' }).click()
  await expect.poll(() => popup.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.presetName)).toBe('deep-ocean')
  const frame = page.frameLocator('iframe[title="展厅实时预览"]')
  await expect.poll(() => frame.locator('canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.presetName)).toBe('deep-ocean')
  expect(await popup.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requested)).toEqual(await frame.locator('canvas').evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requested))
  await expect(popup.locator('.exhibition-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await popup.getByRole('button', { name: '螺旋', exact: true }).click()
  await expect.poll(() => popup.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.mode)).toBe('helix')
  expect(await popup.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requested.background)).toEqual(VIEWER_PRESETS['deep-ocean'].background)
  await page.getByRole('tab', { name: '编排', exact: true }).click()
  await setSpacing(page, 2)
  await expect.poll(() => popup.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().requested.layout.params?.spacing)).toBe(2)
  await popup.screenshot({ path: info.outputPath('effects-unified-window.png') })
  expect(data.errors).toEqual([])
  expect(errors).toEqual([])
  await popup.close()
})
