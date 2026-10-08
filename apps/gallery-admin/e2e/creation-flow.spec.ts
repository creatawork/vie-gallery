import { test, expect } from '@playwright/test'

/**
 * 创作主链路回归（纯前端 + API mock，无需后端）：
 * 上传（逐文件 + 幂等头）→ 校验坏文件提示 → 列表视图渲染与行内操作 → 排序持久化 → 删除撤销。
 */

const GALLERY_ID = '11111111-1111-4111-8111-111111111111'

const gallery = {
  id: GALLERY_ID,
  slug: 'regression-gallery',
  name: '回归测试空间',
  visibility: 'PUBLIC',
  status: 'DRAFT',
  publishedAt: null,
  coverPhotoId: 'photo-2',
  coverThumbnailUrl: null,
  createdAt: '2026-09-12T00:00:00Z',
  updatedAt: '2026-09-12T00:00:00Z',
  photoCount: 2,
  failedPhotoCount: 0,
  processingCount: 0,
  hasUnpublishedConfig: false
}

function photo(id: string, title: string, sortOrder: number) {
  return {
    id,
    galleryId: GALLERY_ID,
    title,
    sortOrder,
    cover: sortOrder === 1,
    status: 'READY',
    createdAt: '2026-09-12T00:00:00Z',
    byteSize: 204800,
    width: 1200,
    height: 800,
    thumbnailUrl: null,
    originalUrl: null
  }
}

let photos = [photo('photo-1', '日出', 0), photo('photo-2', '海浪', 1)]

test.describe('创作链路', () => {
  test.beforeEach(async ({ page }) => {
    photos = [photo('photo-1', '日出', 0), photo('photo-2', '海浪', 1)]

    await page.route('**/api/auth/csrf', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'e2e-csrf-token' }) })
    )
    await page.route('**/api/me', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          role: 'OWNER',
          capabilities: ['GALLERY_READ', 'GALLERY_CREATE', 'PHOTO_READ', 'PHOTO_WRITE', 'PUBLISH', 'SHARE_MANAGE', 'CONFIG_READ', 'CONFIG_WRITE'],
          user: { displayName: '回归测试用户', email: 'e2e@example.com' },
          tenant: { name: '回归测试工作区' }
        })
      })
    )
    await page.route('**/api/galleries', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([gallery]) })
    )
    await page.route(new RegExp(`/api/galleries/${GALLERY_ID}$`), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gallery) })
    )
    await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/photos$`), async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(photos) })
        return
      }
      // 上传：逐文件 POST，必须带幂等键
      const headers = route.request().headers()
      if (!headers['idempotency-key']) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'missing idempotency key' }) })
        return
      }
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          batchId: 'e2e-batch',
          items: [{ filename: 'e2e.png', accepted: true, photoId: 'photo-new', taskId: 'task-new', status: 'QUEUED', error: null }]
        })
      })
    })
    await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/photos/order$`), async route => {
      const body = route.request().postDataJSON() as { orderedPhotoIds: string[] }
      expect(body.orderedPhotoIds.length).toBeGreaterThan(0)
      await route.fulfill({ status: 204 })
    })
    await page.route(new RegExp(`/api/photos/photo-1$`), route =>
      route.fulfill({ status: 204 })
    )
    await page.route('**/api/galleries/*/photo-tasks**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 0, pageSize: 100, total: 0, summary: { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelRequested: 0, cancelled: 0 } })
      })
    )
    await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/publish-readiness`), route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          galleryStatus: 'DRAFT',
          readyPhotoCount: photos.length,
          galleryPublishable: true,
          configDraftChanged: false,
          publishedConfigVersionId: null,
          draftConfigVersionId: null,
          publishedAt: null,
          lastConfigPublishedAt: null,
          blockers: []
        })
      })
    )

    await page.goto('/')
    await expect(page.getByRole('heading', { name: '我的空间' })).toBeVisible()
    await page.locator('.space-card').first().click()
    await expect(page).toHaveURL(new RegExp(`/app/galleries/${GALLERY_ID}$`))
    await expect(page.locator('.photo-grid-container')).toBeVisible()
  })

  test('photos start loading before gallery metadata finishes', async ({ page }) => {
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route(new RegExp(`/api/galleries/${GALLERY_ID}$`), async route => {
      await pending
      await route.fulfill({ json: gallery })
    })
    let requested = false
    page.on('request', request => { if (request.url().endsWith('/photos')) requested = true })
    try {
      await page.reload()
      await expect.poll(() => requested, { timeout: 2000 }).toBe(true)
      release()
      await expect(page.locator('.photo-card')).toHaveCount(2)
    } finally { release() }
  })

  test('坏文件提示但不整批拒绝，有效文件逐个上传', async ({ page }) => {
    const uploadRequests: string[] = []
    page.on('request', request => {
      if (request.url().endsWith('/photos') && request.method() === 'POST') {
        uploadRequests.push(request.headers()['idempotency-key'] || '')
      }
    })

    // 一个坏类型 + 一个有效文件：有效文件仍应上传
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
      { name: 'good.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-bytes') }
    ])

    await expect(page.locator('.toast-warning')).toContainText('bad.txt')
    await expect.poll(() => uploadRequests.length).toBe(1)
  })

  test('列表视图渲染策展行并支持行内操作', async ({ page }) => {
    await page.locator('button[aria-label="列表视图"]').click()
    await expect(page.locator('.photo-list-row')).toHaveCount(2)
    await expect(page.locator('.photo-list-row').first()).toContainText('日出')
    // 状态徽章与封面徽章
    await expect(page.locator('.photo-list-row .row-meta').first()).toContainText('已就绪')
    await expect(page.locator('.photo-list-row').nth(1).locator('.row-meta-tag.is-cover')).toContainText('封面')
    // 行内编辑标题
    await page.locator('.photo-list-row .row-title').first().click()
    await page.locator('.row-title-input').fill('日出东海')
    await page.keyboard.press('Enter')
  })

  for (const view of ['网格', '列表']) {
    test(`${view}标题搜索清理隐藏选择并禁用排序`, async ({ page }) => {
      if (view === '列表') await page.getByRole('button', { name: '列表视图' }).click()
      const container = page.locator(view === '列表' ? '.photo-list-container' : '.photo-grid-container')
      await container.getByRole('button', { name: '全选当前' }).click()
      await expect(container.locator('.batch-selected-badge')).toHaveText('2')
      await container.getByRole('searchbox', { name: '搜索照片标题' }).fill('海浪')
      await expect(container.locator('.batch-selected-badge')).toHaveText('1')
      await expect(container.getByRole('button', { name: '取消全选' })).toBeVisible()
      await expect(container).toContainText('筛选期间无法调整顺序')
      if (view === '列表') {
        await expect(container.locator('.row-drag-handle')).toHaveCount(0)
        await expect(container.getByRole('button', { name: '前移', exact: true })).toBeDisabled()
      }
      await container.getByRole('searchbox', { name: '搜索照片标题' }).fill('不存在的标题')
      await expect(container.locator('.floating-batch-bar')).toHaveCount(0)
      await expect(container).toContainText('没有符合筛选条件的照片')
      await container.getByRole('button', { name: '清除筛选' }).click()
      await expect(container.getByRole('searchbox', { name: '搜索照片标题' })).toHaveValue('')
      await expect(container.locator('.floating-batch-bar')).toHaveCount(0)
      await expect(container.getByRole('button', { name: '全选当前' })).toBeVisible()
    })
  }

  test('同数量状态切换不会误判全选或保留隐藏选择', async ({ page }) => {
    photos = [photo('photo-1', '日出', 0), { ...photo('photo-2', '海浪', 1), status: 'FAILED' }]
    await page.reload()
    const container = page.locator('.photo-grid-container')
    await container.getByRole('button', { name: '已就绪' }).click()
    await container.getByRole('button', { name: '全选当前' }).click()
    await container.locator('.category-pill', { hasText: '失败' }).click()
    await expect(container.locator('.floating-batch-bar')).toHaveCount(0)
    await expect(container.getByRole('button', { name: '全选当前' })).toBeVisible()
    await container.getByRole('button', { name: '全选当前' }).click()
    await expect(container.locator('.batch-selected-badge')).toHaveText('1')
  })

  test('列表行前移触发批量排序端点', async ({ page }) => {
    await page.route(new RegExp(`/api/galleries/${GALLERY_ID}/photos/order$`), async route => {
      const body = route.request().postDataJSON() as { orderedPhotoIds: string[] }
      expect(body.orderedPhotoIds).toEqual(['photo-2', 'photo-1'])
      await route.fulfill({ status: 204 })
    })
    await page.locator('button[aria-label="列表视图"]').click()
    await page.locator('.photo-list-row').nth(1).locator('button[title="前移"]').click()
    await expect(page.locator('.toast-success').first()).toContainText('排序')
  })

  test('删除照片出现撤销提示且超时后调用删除接口', async ({ page }) => {
    let deleteCalled = false
    page.on('request', request => {
      if (request.url().endsWith('/photos/photo-1') && request.method() === 'DELETE') deleteCalled = true
    })

    // 打开卡片菜单 → 删除 → 确认
    await page.locator('.photo-card').first().hover()
    await page.locator('.photo-card .ghost-btn').first().click()
    await page.locator('.card-menu button', { hasText: '删除' }).click()
    await page.getByRole('button', { name: '确认删除' }).click()

    await expect(page.locator('.toast-info')).toContainText('撤销')
    // 撤销窗口内接口尚未调用
    expect(deleteCalled).toBe(false)
    await page.waitForTimeout(8500)
    expect(deleteCalled).toBe(true)
  })
})
