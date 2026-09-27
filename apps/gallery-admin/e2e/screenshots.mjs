/**
 * 创作端关键页面截图脚本（API mock，无需后端）。
 * 用法：先启动 `npm run preview -- --port 4173`，再 `node e2e/screenshots.mjs`。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const GALLERY_ID = '11111111-1111-4111-8111-111111111111'
const BASE = process.env.ADMIN_URL || 'http://127.0.0.1:4173'

const gallery = {
  id: GALLERY_ID,
  slug: 'regression-gallery',
  name: '晨雾森林',
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

function photo(id, title, sortOrder) {
  return {
    id,
    galleryId: GALLERY_ID,
    title,
    sortOrder,
    cover: sortOrder === 1,
    status: 'READY',
    createdAt: '2026-09-12T00:00:00Z',
    byteSize: 2048000,
    width: 1200,
    height: 800,
    thumbnailUrl: null,
    originalUrl: null
  }
}

let photos = [photo('photo-1', '晨雾山谷', 0), photo('photo-2', '林间溪流', 1)]

function gradients() {
  return [
    ['**/api/auth/csrf', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'e2e-csrf' }) })],
    ['**/api/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        role: 'OWNER',
        capabilities: ['GALLERY_READ', 'GALLERY_CREATE', 'PHOTO_READ', 'PHOTO_WRITE', 'PUBLISH', 'SHARE_MANAGE', 'CONFIG_READ', 'CONFIG_WRITE'],
        user: { displayName: '林小满', email: 'e2e@example.com' },
        tenant: { name: '林小满的创作空间' }
      })
    })],
    ['**/api/galleries', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([gallery]) })],
    [new RegExp(`/api/galleries/${GALLERY_ID}$`), route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gallery) })],
    [new RegExp(`/api/galleries/${GALLERY_ID}/photos$`), async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(photos) })
        return
      }
      await new Promise(resolve => setTimeout(resolve, 5000))
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ batchId: 'b', items: [{ filename: 'x.png', accepted: true, photoId: 'p', taskId: 't', status: 'QUEUED', error: null }] })
      })
    }],
    [new RegExp(`/api/galleries/${GALLERY_ID}/photos/order$`), route => route.fulfill({ status: 204 })],
    [new RegExp('/api/photos/'), route => route.fulfill({ status: 204 })],
    ['**/api/galleries/*/photo-tasks**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 0, pageSize: 100, total: 0, summary: { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelRequested: 0, cancelled: 0 } })
    })],
    [new RegExp(`/api/galleries/${GALLERY_ID}/publish-readiness`), route => route.fulfill({
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
    })]
  ]
}

mkdirSync('screenshots', { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

for (const [matcher, handler] of gradients()) await page.route(matcher, handler)

// 1. 我的空间
await page.goto(BASE + '/')
await page.waitForSelector('.space-card')
await page.waitForTimeout(600)
await page.screenshot({ path: 'screenshots/01-overview.png' })

// 进入工作区
await page.locator('.space-card').first().click()
await page.waitForSelector('.photo-grid-container')
await page.waitForTimeout(800)

// 2. 网格视图
await page.screenshot({ path: 'screenshots/02-workspace-grid.png' })

// 3. 上传中（真实进度条）
await page.locator('input[type="file"]').setInputFiles([
  { name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(3_000_000, 1) },
  { name: 'b.png', mimeType: 'image/png', buffer: Buffer.alloc(3_000_000, 1) }
])
await page.waitForTimeout(2500)
await page.screenshot({ path: 'screenshots/03-uploading.png' })
await page.waitForTimeout(5000)

// 4. 快捷键帮助
await page.locator('button[aria-label="键盘快捷键"]').click()
await page.waitForTimeout(400)
await page.screenshot({ path: 'screenshots/04-shortcuts.png' })
await page.keyboard.press('Escape')

// 5. 列表视图
await page.locator('button[aria-label="列表视图"]').click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'screenshots/05-workspace-list.png' })

// 6. 删除撤销 toast
await page.locator('button[aria-label="网格视图"]').click()
await page.waitForTimeout(400)
await page.locator('.photo-card .ghost-btn').first().click()
await page.locator('.card-menu button', { hasText: '删除' }).first().click()
await page.getByRole('button', { name: '确认删除' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'screenshots/06-delete-undo.png' })

await browser.close()
console.log('screenshots done')
