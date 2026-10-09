import { test, expect, type Page } from '@playwright/test'
import { VIEWER_PRESETS } from '@vie/gallery-contracts'
import { mockGallery } from '../../gallery-viewer/e2e/helpers/mockGallery'

const galleryId = 'history-fixture'
const snapshot = JSON.stringify({ ...VIEWER_PRESETS['film-gallery'] })

function version(number: number) {
  return {
    id: `version-${number}`,
    galleryId,
    configJson: snapshot,
    presetName: 'film-gallery',
    schemaVersion: 1,
    createdAt: `2026-10-${String(Math.max(1, 21 - number)).padStart(2, '0')}T00:00:00Z`,
    versionNumber: String(number),
    title: number === 1 ? '当前展览' : `版本 ${number}`,
    note: null,
    isCurrent: number === 1
  }
}

async function setup(page: Page, role: 'editor' | 'viewer' = 'editor') {
  let deleted = false
  let metadataUpdate: unknown = null
  let restores = 0
  await mockGallery(page, { config: JSON.parse(snapshot) })
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'history-csrf' } }))
  await page.route('**/api/me', route => route.fulfill({ json: {
    role: role === 'editor' ? 'EDITOR' : 'VIEWER',
    capabilities: ['GALLERY_READ', 'CONFIG_READ', ...(role === 'editor' ? ['CONFIG_WRITE'] : [])],
    user: { displayName: '版本管理' }, tenant: { name: '版本验收' }
  } }))
  await page.route(`**/api/galleries/${galleryId}`, route => route.fulfill({ json: {
    id: galleryId, slug: 'history-fixture', name: '版本验收', visibility: 'PUBLIC', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00Z'
  } }))
  await page.route(`**/api/galleries/${galleryId}/preview-token`, route => route.fulfill({ status: 503 }))
  await page.route(`**/api/galleries/${galleryId}/viewer-config`, route => route.fulfill({ json: {
    configJson: snapshot, publishedConfigJson: snapshot, publishedVersionId: 'version-1', schemaVersion: 1
  } }))
  await page.route(new RegExp(`/api/galleries/${galleryId}/viewer-config/versions\\?page=0&pageSize=20$`), route => {
    const items = Array.from({ length: 20 }, (_, index) => version(21 - index)).filter(item => !deleted || item.id !== 'version-2')
    return route.fulfill({ json: { items, page: 0, pageSize: 20, total: deleted ? 20 : 21 } })
  })
  await page.route(new RegExp(`/api/galleries/${galleryId}/viewer-config/versions\\?page=1&pageSize=20$`), route => route.fulfill({ json: {
    items: deleted ? [] : [version(1)], page: 1, pageSize: 20, total: deleted ? 20 : 21
  } }))
  await page.route(new RegExp(`/api/galleries/${galleryId}/viewer-config/versions/version-(\\d+)$`), route => {
    const number = Number(route.request().url().match(/version-(\d+)$/)?.[1] ?? 1)
    if (route.request().method() === 'PATCH') {
      metadataUpdate = route.request().postDataJSON()
      return route.fulfill({ json: { ...version(number), ...metadataUpdate } })
    }
    if (route.request().method() === 'DELETE') {
      deleted = true
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: version(number) })
  })
  await page.route(new RegExp(`/api/galleries/${galleryId}/viewer-config/versions/version-(\\d+)/restore$`), route => {
    restores++
    return route.fulfill({ json: { configJson: snapshot, presetName: 'film-gallery', schemaVersion: 1 } })
  })
  await page.route(`**/api/galleries/${galleryId}/viewer-config/versions/version-1`, route => route.fulfill({ json: version(1) }))
  return { metadataUpdate: () => metadataUpdate, restores: () => restores, deleted: () => deleted }
}

test('current summary stays visible outside the page and history loads in 20-item pages', async ({ page }) => {
  await setup(page)
  await page.goto(`/app/galleries/${galleryId}/config`)
  await page.getByRole('tab', { name: '版本', exact: true }).click()
  await expect(page.getByLabel('当前使用版本')).toContainText('当前展览')
  await expect(page.locator('.history-entry')).toHaveCount(20)
  await expect(page.getByLabel('当前使用版本')).toContainText('v1 · 当前使用')
  await page.getByRole('button', { name: /加载更多/ }).click()
  await expect(page.locator('.history-entry')).toHaveCount(21)
  await expect(page.getByRole('button', { name: '删除 v1', exact: true })).toHaveCount(0)
})

test('viewer can read version history but has no version mutation controls', async ({ page }) => {
  await setup(page, 'viewer')
  await page.goto(`/app/galleries/${galleryId}/config`)
  await page.getByRole('tab', { name: '版本', exact: true }).click()
  await expect(page.locator('.history-entry')).toHaveCount(20)
  await expect(page.getByRole('button', { name: /编辑 v/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /恢复 v/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /删除 v/ })).toHaveCount(0)
})

test('editor can edit metadata, restore into draft, and delete an old version', async ({ page }) => {
  const api = await setup(page)
  await page.goto(`/app/galleries/${galleryId}/config`)
  await page.getByRole('tab', { name: '版本', exact: true }).click()

  await page.getByRole('button', { name: '编辑 v2 信息' }).click()
  await page.getByLabel('版本名称（选填）').fill('冬季珍藏')
  await page.getByLabel('备注（选填）').fill('第一行\n第二行')
  await page.getByRole('button', { name: '保存信息' }).click()
  await expect.poll(api.metadataUpdate).toEqual({ title: '冬季珍藏', note: '第一行\n第二行' })
  await expect(page.locator('.history-entry').filter({ hasText: '冬季珍藏' })).toBeVisible()

  await page.getByRole('button', { name: '恢复 v3 到草稿' }).click()
  await page.getByRole('button', { name: '确认回滚' }).click()
  await expect.poll(api.restores).toBe(1)
  await expect(page.getByText('已恢复到当前草稿，公开配置保持不变。')).toBeVisible()

  await page.getByRole('button', { name: '删除 v2', exact: true }).click()
  await page.getByRole('button', { name: '删除版本' }).click()
  await expect.poll(api.deleted).toBe(true)
  await expect(page.getByRole('button', { name: '删除 v2', exact: true })).toHaveCount(0)
})

test('metadata editor opens from the loaded history even when detail requests fail', async ({ page }) => {
  await setup(page)
  await page.goto(`/app/galleries/${galleryId}/config`)
  await page.getByRole('tab', { name: '版本', exact: true }).click()
  await expect(page.locator('.history-entry')).toHaveCount(20)
  let detailRequests = 0
  await page.route(`**/viewer-config/versions/version-2`, route => {
    detailRequests++
    return route.fulfill({ status: 503 })
  })

  await page.getByRole('button', { name: '编辑 v2 信息' }).click()
  await expect(page.getByRole('dialog', { name: '编辑版本信息' })).toBeVisible()
  await expect(page.getByLabel('版本名称（选填）')).toHaveValue('版本 2')
  expect(detailRequests).toBe(0)
})

test('failed metadata save keeps the input and successful retry updates history without reloading it', async ({ page }) => {
  await setup(page)
  await page.goto(`/app/galleries/${galleryId}/config`)
  await page.getByRole('tab', { name: '版本', exact: true }).click()
  await expect(page.locator('.history-entry')).toHaveCount(20)
  let saves = 0
  await page.route(`**/viewer-config/versions/version-2`, route => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: version(2) })
    saves++
    return saves === 1
      ? route.fulfill({ status: 503 })
      : route.fulfill({ json: { ...version(2), ...route.request().postDataJSON() } })
  })
  await page.route('**/viewer-config/versions?*', route => route.fulfill({ status: 503 }))

  await page.getByRole('button', { name: '编辑 v2 信息' }).click()
  await page.getByLabel('版本名称（选填）').fill('重试后保存')
  await page.getByRole('button', { name: '保存信息' }).click()
  await expect(page.getByRole('button', { name: '保存信息' })).toBeEnabled()
  await expect(page.getByLabel('版本名称（选填）')).toHaveValue('重试后保存')
  await page.getByRole('button', { name: '保存信息' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.history-entry').filter({ hasText: '重试后保存' })).toBeVisible()
})
