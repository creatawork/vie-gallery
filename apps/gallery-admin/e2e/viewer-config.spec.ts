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
test('draft and publish states are explicit, and a draft gallery can go live in one click from config', async ({ page }) => {
  let draft = JSON.stringify({ ...VIEWER_PRESETS['film-gallery'] })
  const calls: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await mockGallery(page, { config: JSON.parse(draft) })
  await page.route('**/api/me', route => route.fulfill({ json: { role: 'OWNER', capabilities: ['GALLERY_READ', 'CONFIG_READ', 'CONFIG_WRITE', 'PUBLISH'], user: { displayName: '测试策展人' }, tenant: { name: '配置验收' } } }))
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'fixture-csrf' } }))
  await page.route('**/api/galleries/config-fixture', route => route.fulfill({ json: { id: 'config-fixture', slug: 'effects-fixture', name: '配置验收', visibility: 'PUBLIC', status: 'DRAFT', createdAt: '2026-10-05T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/preview-token', route => route.fulfill({ json: { token: 'test-only-preview', expiresAt: '2099-01-01T00:00:00Z' } }))
  await page.route('**/api/galleries/config-fixture/viewer-config', async route => {
    if (route.request().method() === 'PUT') { draft = route.request().postDataJSON().configJson; calls.push('save-draft') }
    await route.fulfill({ json: { configJson: draft, schemaVersion: 1 } })
  })
  await page.route('**/api/galleries/config-fixture/viewer-config/versions**', route => route.fulfill({ json: { items: [{ id: 'version-1', versionNumber: 1, title: '历史版本 v1', createdAt: '2026-10-07T00:00:00Z' }] } }))
  // 注意：Playwright 后注册的路由优先匹配，publish 路由必须注册在 viewer-config 之后
  await page.route('**/api/galleries/config-fixture/viewer-config/publish', async route => {
    calls.push('config-publish')
    await route.fulfill({ json: { id: 'version-1', versionNumber: 1, createdAt: '2026-10-07T00:00:00Z' } })
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
