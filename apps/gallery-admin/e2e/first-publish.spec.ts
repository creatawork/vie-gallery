import { test, expect } from '@playwright/test'

/**
 * 首发布链路（纯前端 + API mock）：
 * 从未打开过配置页的新相册，在工作台一键发布必须成功——
 * publishAll 需要先静默创建推荐场景草稿，再走配置发布 + 画廊发布。
 */
const GALLERY_ID = '22222222-2222-4222-8222-222222222222'
const draftGallery = {
  id: GALLERY_ID, slug: 'first-publish', name: '首发布空间', visibility: 'PUBLIC',
  status: 'DRAFT', publishedAt: null, coverPhotoId: null, coverThumbnailUrl: null,
  createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
  photoCount: 1, failedPhotoCount: 0, processingCount: 0, hasUnpublishedConfig: false
}
const readyPhoto = {
  id: 'photo-1', galleryId: GALLERY_ID, title: '', sortOrder: 0, cover: false, status: 'READY',
  createdAt: '2026-10-07T00:00:00Z', byteSize: 204800, width: 1200, height: 800,
  thumbnailUrl: null, originalUrl: null
}

async function mockWorkspace(page: import('@playwright/test').Page, options: {
  hasConfigDraft: boolean
  gallery?: typeof draftGallery
  capabilities?: string[]
  startUploaded?: boolean
}) {
  const gallery = options.gallery ?? draftGallery
  let uploaded = options.startUploaded ?? false
  let published = false
  let configPublished = false
  let savedConfig: unknown = null
  const calls: string[] = []
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'e2e-csrf-token' } }))
  await page.route('**/api/me', route => route.fulfill({
    json: { role: 'OWNER', capabilities: options.capabilities ?? ['GALLERY_READ', 'PHOTO_READ', 'PHOTO_WRITE', 'PUBLISH', 'SHARE_MANAGE', 'CONFIG_READ', 'CONFIG_WRITE'], user: { displayName: '新用户' }, tenant: { name: '首发布工作区' } }
  }))
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}$`), route =>
    route.fulfill({
      json: published
        ? { ...gallery, status: 'PUBLISHED', publishedAt: '2026-10-07T01:00:00Z' }
        : uploaded ? { ...gallery, photoCount: Math.max(gallery.photoCount, 1) } : gallery
    }))
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/photos$`), async route => {
    if (route.request().method() !== 'GET') {
      const headers = route.request().headers()
      if (!headers['idempotency-key']) {
        await route.fulfill({ status: 400, json: { message: 'missing idempotency key' } })
        return
      }
      uploaded = true
      await route.fulfill({
        status: 202,
        json: { batchId: 'e2e-batch', items: [{ filename: 'e2e.png', accepted: true, photoId: 'photo-1', taskId: 'task-1', status: 'QUEUED', error: null }] }
      })
      return
    }
    await route.fulfill({ json: uploaded || gallery.photoCount > 0 ? [readyPhoto] : [] })
  })
  await page.route('**/api/galleries/*/photo-tasks**', route => route.fulfill({
    json: { items: [], page: 0, pageSize: 100, total: 0, summary: { queued: 0, processing: 0, succeeded: uploaded ? 1 : 0, failed: 0, cancelRequested: 0, cancelled: 0 } }
  }))
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/publish-readiness`), route => route.fulfill({
    json: {
      galleryStatus: published ? 'PUBLISHED' : 'DRAFT',
      readyPhotoCount: uploaded || gallery.photoCount > 0 ? 1 : 0,
      galleryPublishable: !published,
      configDraftChanged: !options.hasConfigDraft && !configPublished && !published,
      publishedConfigVersionId: null, draftConfigVersionId: null,
      publishedAt: published ? '2026-10-07T01:00:00Z' : null, lastConfigPublishedAt: null,
      blockers: []
    }
  }))
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/viewer-config$`), async route => {
    if (route.request().method() === 'PUT') {
      savedConfig = route.request().postDataJSON()
      calls.push('put-config')
      await route.fulfill({ json: { configJson: (savedConfig as { configJson: string }).configJson, schemaVersion: 1 } })
      return
    }
    if (!options.hasConfigDraft) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'CONFIG_NOT_FOUND' }) })
      return
    }
    await route.fulfill({ json: { configJson: JSON.stringify({ presetName: 'minimal' }), schemaVersion: 1 } })
  })
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/viewer-config/publish$`), async route => {
    calls.push('config-publish')
    configPublished = true
    await route.fulfill({ json: { id: 'version-1', versionNumber: '1', title: null, note: null, isCurrent: true, createdAt: '2026-10-07T00:00:00Z' } })
  })
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/publish$`), async route => {
    calls.push('gallery-publish')
    published = true
    await route.fulfill({ json: { ...gallery, status: 'PUBLISHED', publishedAt: '2026-10-07T01:00:00Z' } })
  })
  return { calls: () => calls, savedConfig: () => savedConfig }
}

test('publishing a never-configured gallery auto-creates the recommended scene draft first', async ({ page }) => {
  const data = await mockWorkspace(page, { hasConfigDraft: false })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  await page.getByRole('button', { name: '发布展厅', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '展览已就绪' })).toBeVisible()
  expect(data.calls()).toEqual(['put-config', 'config-publish', 'gallery-publish'])
  const saved = data.savedConfig() as { configJson: string; presetName: string }
  expect(saved.presetName).toBe('jade-flow')
  expect(JSON.parse(saved.configJson).layout.params.composition).toBe('curated')
})

test('ready guidance leads to the visible publish center and one publish action', async ({ page }) => {
  const data = await mockWorkspace(page, { hasConfigDraft: false, gallery: draftGallery })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  const nudge = page.locator('.publish-nudge.is-ready')
  await expect(nudge).toBeVisible()
  await expect(nudge).toContainText('选择展示风格')
  await expect(page.getByRole('button', { name: '发布展厅', exact: true })).toHaveCount(1)
  await expect(nudge.getByRole('button', { name: '先预览' })).toBeVisible()
  await expect(nudge.getByRole('button', { name: '调整场景' })).toBeVisible()
  await nudge.getByRole('button', { name: '查看发布检查' }).click()
  await expect(page.locator('#workspace-publish')).toBeFocused()
  await page.getByRole('button', { name: '发布展厅', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '展览已就绪' })).toBeVisible()
  expect(data.calls()).toEqual(['put-config', 'config-publish', 'gallery-publish'])
  await expect(page.locator('.publish-nudge')).toHaveCount(0)
})

test('publish nudge shows processing and failed states without a publish button', async ({ page }) => {
  await mockWorkspace(page, { hasConfigDraft: false, gallery: { ...draftGallery, processingCount: 2 } })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  const processing = page.locator('.publish-nudge.is-processing')
  await expect(processing).toBeVisible()
  await expect(processing).toContainText('照片处理中')
  await expect(processing.getByRole('button', { name: '发布展厅' })).toHaveCount(0)

  await mockWorkspace(page, { hasConfigDraft: false, gallery: { ...draftGallery, failedPhotoCount: 1 } })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  const failed = page.locator('.publish-nudge.is-failed')
  await expect(failed).toBeVisible()
  await expect(failed).toContainText('处理失败')
  await expect(failed.getByRole('button', { name: '发布展厅' })).toHaveCount(0)
})

test('publish nudge is hidden for users without PUBLISH capability', async ({ page }) => {
  await mockWorkspace(page, { hasConfigDraft: false, gallery: draftGallery, capabilities: ['GALLERY_READ', 'PHOTO_READ', 'PHOTO_WRITE', 'CONFIG_READ', 'CONFIG_WRITE'] })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  await expect(page.locator('.publish-nudge')).toHaveCount(0)
})

test('full first-publish funnel: upload finishes, nudge turns ready, one click goes live', async ({ page }) => {
  const data = await mockWorkspace(page, { hasConfigDraft: false, gallery: { ...draftGallery, photoCount: 0 } })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  // 空相册：无横幅
  await expect(page.locator('.publish-nudge')).toHaveCount(0)
  // 上传（选择器与 creation-flow.spec.ts:140 一致）；
  // 上传 POST 置位 uploaded → 任务轮询 idle → onIdle 触发 workspace.reload() → 横幅就绪
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'e2e.png', mimeType: 'image/png', buffer: Buffer.from('a-png-bytes') }
  ])
  // 实测：本地上传批次结束后 onIdle 不会自动触发 workspace.reload()，按简报许可补一次刷新
  await page.reload()
  await expect(page.locator('.publish-nudge.is-ready')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '发布展厅', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '展览已就绪' })).toBeVisible()
  await page.getByRole('dialog', { name: '展览已就绪' }).getByRole('button', { name: '关闭', exact: true }).click()
  expect(data.calls()).toEqual(['put-config', 'config-publish', 'gallery-publish'])
  await expect(page.getByRole('button', { name: '分享', exact: true })).toBeVisible()
})

test('gallery retry after config succeeds does not publish another config version', async ({ page }) => {
  const data = await mockWorkspace(page, { hasConfigDraft: false })
  let galleryAttempts = 0
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/publish$`), async route => {
    galleryAttempts++
    if (galleryAttempts === 1) {
      await route.fulfill({ status: 500, json: { message: '服务暂时不可用' } })
      return
    }
    await route.fallback()
  })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  await page.getByRole('button', { name: '发布展厅', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: /配置版本 v1 已生效，相册发布失败/ })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '刷新发布状态' }).click()
  await page.getByRole('button', { name: '发布展厅', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '展览已就绪' })).toBeVisible()
  expect(data.calls().filter(call => call === 'config-publish')).toHaveLength(1)
  expect(galleryAttempts).toBe(2)
})

test('a failed readiness refresh disables publishing until the status recovers', async ({ page }) => {
  const data = await mockWorkspace(page, { hasConfigDraft: true })
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  const publish = page.getByRole('button', { name: '发布展厅', exact: true })
  await expect(publish).toBeEnabled()
  let readinessUnavailable = true
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/publish-readiness`), route => readinessUnavailable ? route.fulfill({ status: 503, json: { message: '状态服务暂时不可用' } }) : route.fallback())
  await page.getByRole('button', { name: '刷新发布状态' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '状态服务暂时不可用' })).toBeVisible()
  await expect(publish).toBeDisabled()
  expect(data.calls()).toEqual([])
  readinessUnavailable = false
  await page.getByRole('button', { name: '刷新发布状态' }).click()
  await expect(publish).toBeEnabled()
})

test('password draft can reach its access settings before publishing', async ({ page }) => {
  await mockWorkspace(page, { hasConfigDraft: true, gallery: { ...draftGallery, visibility: 'PASSWORD' } })
  await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/publish-readiness`), route => route.fulfill({ json: { galleryStatus: 'DRAFT', readyPhotoCount: 1, galleryPublishable: false, configDraftChanged: false, blockers: [{ code: 'PASSWORD_REQUIRED', message: '请先设置展厅访问密码，再发布展厅。' }] } }))
  await page.route('**/api/galleries/*/share-links**', route => route.fulfill({ json: [] }))
  await page.goto(`/app/galleries/${GALLERY_ID}`)
  await expect(page.getByRole('button', { name: '发布展厅', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '访问与分享设置' }).click()
  await expect(page.getByRole('dialog', { name: '分享展厅' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '相册访问密码' })).toBeVisible()
})
