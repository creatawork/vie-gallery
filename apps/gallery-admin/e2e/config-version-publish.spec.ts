import { test, expect } from '@playwright/test'
import { VIEWER_PRESETS } from '@vie/gallery-contracts'

const galleryId = 'publish-version-fixture'
const draft = JSON.stringify(VIEWER_PRESETS['film-gallery'])

test('workspace captures metadata once and retries only the gallery after config publishing succeeds', async ({ page }) => {
  let configPublished = false
  let galleryPublished = false
  let galleryAttempts = 0
  let configPublishBody: { title?: string | null; note?: string | null } | null = null
  let configPublishCount = 0

  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'publish-csrf' } }))
  await page.route('**/api/me', route => route.fulfill({ json: {
    role: 'OWNER',
    capabilities: ['GALLERY_READ', 'PHOTO_READ', 'PHOTO_WRITE', 'PUBLISH', 'CONFIG_READ', 'CONFIG_WRITE'],
    user: { displayName: '版本发布验收' }, tenant: { name: '发布工作区' }
  } }))
  await page.route(new RegExp(`/api/galleries/${galleryId}$`), route => route.fulfill({ json: {
    id: galleryId, slug: galleryId, name: '发布验收', visibility: 'PUBLIC', status: galleryPublished ? 'PUBLISHED' : 'DRAFT',
    createdAt: '2026-10-01T00:00:00Z', photoCount: 1, failedPhotoCount: 0, processingCount: 0
  } }))
  await page.route(new RegExp(`/api/galleries/${galleryId}/photos$`), route => route.fulfill({ json: [] }))
  await page.route(new RegExp(`/api/galleries/${galleryId}/photo-tasks`), route => route.fulfill({ json: {
    items: [], page: 0, pageSize: 100, total: 0,
    summary: { queued: 0, processing: 0, succeeded: 1, failed: 0, cancelRequested: 0, cancelled: 0 }
  } }))
  await page.route(new RegExp(`/api/galleries/${galleryId}/publish-readiness`), route => route.fulfill({ json: {
    galleryStatus: galleryPublished ? 'PUBLISHED' : 'DRAFT', readyPhotoCount: 1, galleryPublishable: !galleryPublished,
    configDraftChanged: !configPublished, publishedConfigVersionId: configPublished ? 'version-2' : null,
    draftConfigVersionId: 'draft-1', publishedAt: null, lastConfigPublishedAt: null, blockers: []
  } }))
  await page.route(new RegExp(`/api/galleries/${galleryId}/viewer-config$`), route => route.fulfill({ json: { configJson: draft, schemaVersion: 1 } }))
  await page.route(new RegExp(`/api/galleries/${galleryId}/viewer-config/publish$`), async route => {
    configPublishCount++
    configPublishBody = route.request().postDataJSON()
    configPublished = true
    await route.fulfill({ json: { id: 'version-2', versionNumber: '2', title: configPublishBody?.title, note: configPublishBody?.note, isCurrent: true } })
  })
  await page.route(new RegExp(`/api/galleries/${galleryId}/publish$`), async route => {
    galleryAttempts++
    if (galleryAttempts === 1) {
      await route.fulfill({ status: 500, json: { message: '相册服务暂时不可用' } })
      return
    }
    galleryPublished = true
    await route.fulfill({ json: { id: galleryId, status: 'PUBLISHED' } })
  })

  await page.goto(`/app/galleries/${galleryId}`)
  await page.getByRole('button', { name: '添加版本说明' }).click()
  await page.getByLabel('版本名称（选填）').fill(`  ${'春'.repeat(60)}  `)
  await page.getByLabel('备注（选填）').fill('布展调整 😀\n完成复核')
  await page.getByRole('button', { name: '确认发布' }).click()

  await expect(page.locator('.publish-center').getByRole('alert')).toContainText('配置版本 v2 已生效，相册发布失败')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(configPublishBody).toEqual({ title: '春'.repeat(60), note: '布展调整 😀\n完成复核' })

  await page.getByRole('button', { name: '刷新发布状态' }).click()
  await page.locator('.publish-center').getByRole('button', { name: '发布展厅', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('展厅已发布，把这一刻分享出去。')).toBeVisible()
  expect(configPublishCount).toBe(1)
  expect(galleryAttempts).toBe(2)
})
