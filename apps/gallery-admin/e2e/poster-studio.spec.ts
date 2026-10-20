import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const galleryId = '44444444-4444-4444-8444-444444444444'
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=', 'base64')
type Options = { template: string; format: string; title: string; description: string; focalPoint: number }

async function mockStudio(page: Page, visibility = 'PUBLIC') {
  const previews: Options[] = []
  const downloads: Options[] = []
  let failPreview = false
  let failDownload = false
  let previewDelay = 0
  const cover = process.env.POSTER_SAMPLES_DIR ? '/poster-test-cover.jpg' : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#668b7d"/></svg>')}`
  if (process.env.POSTER_SAMPLES_DIR) await page.route('**/poster-test-cover.jpg', async route => route.fulfill({
    contentType: 'image/jpeg', body: await readFile(path.join(process.env.POSTER_SAMPLES_DIR!, 'cover.jpg'))
  }))
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/auth/csrf') return route.fulfill({ json: { token: 'poster-test' } })
    if (pathname === '/api/me') return route.fulfill({ json: {
      role: 'OWNER', capabilities: ['GALLERY_READ', 'PHOTO_READ', 'PHOTO_WRITE', 'PUBLISH', 'SHARE_MANAGE', 'CONFIG_READ', 'CONFIG_WRITE'],
      user: { displayName: '摄影师', email: 'creator@example.com' }, tenant: { name: '摄影工作室' }
    } })
    if (pathname === `/api/galleries/${galleryId}`) return route.fulfill({ json: {
      id: galleryId, name: '山野来信', slug: 'slow-days', visibility, status: 'PUBLISHED', photoCount: 24,
      coverThumbnailUrl: cover, createdAt: '2026-10-20T00:00:00Z'
    } })
    if (pathname.endsWith('/share-poster/preview') || pathname.endsWith('/share-poster/download')) {
      const options = route.request().postDataJSON() as Options
      const isPreview = pathname.endsWith('/preview')
      ;(isPreview ? previews : downloads).push(options)
      if (isPreview && previewDelay) await new Promise(resolve => setTimeout(resolve, previewDelay))
      if (isPreview ? failPreview : failDownload) return route.fulfill({ status: 503, json: { message: '图片服务暂时不可用，请重试。' } })
      const body = process.env.POSTER_SAMPLES_DIR
        ? await readFile(path.join(process.env.POSTER_SAMPLES_DIR, `${options.template}-${options.format}.png`)) : pixel
      return route.fulfill({ contentType: 'image/png', body })
    }
    if (pathname.endsWith('/photos')) return route.fulfill({ json: [{
      id: 'photo-1', galleryId, title: '山野来信', sortOrder: 0, cover: true, status: 'READY',
      width: 1600, height: 1000, thumbnailUrl: cover, originalUrl: cover, byteSize: 204800
    }] })
    if (pathname.endsWith('/share-links')) return route.fulfill({ json: [] })
    if (pathname.includes('/photo-tasks')) return route.fulfill({ json: { items: [], total: 0, summary: {} } })
    if (pathname.endsWith('/viewer-config')) return route.fulfill({ json: { configJson: '{"presetName":"minimal"}', schemaVersion: 1 } })
    if (pathname.endsWith('/publish-readiness')) return route.fulfill({ json: { galleryStatus: 'PUBLISHED', readyPhotoCount: 24, galleryPublishable: true, configDraftChanged: false, blockers: [] } })
    return route.fulfill({ json: {} })
  })
  await page.goto(`/app/galleries/${galleryId}`)
  await page.getByRole('button', { name: '分享', exact: true }).click()
  await page.getByRole('tab', { name: '海报创作', exact: true }).click()
  await expect(page.getByRole('button', { name: '下载高清海报', exact: true })).toBeEnabled()
  return { previews, downloads, setPreviewFailure: (value: boolean) => { failPreview = value },
    setDownloadFailure: (value: boolean) => { failDownload = value }, setPreviewDelay: (value: number) => { previewDelay = value } }
}

test('poster editor previews all styles, preserves text and exports the selected options as a PNG', async ({ page }) => {
  const { previews, downloads } = await mockStudio(page)
  expect(previews[0]).toMatchObject({ template: 'ELEGANT', format: 'PORTRAIT', title: '山野来信' })
  const button = page.getByRole('button', { name: '下载高清海报', exact: true })
  for (const [name, id] of [['留白画册', 'MINIMAL'], ['深色典藏', 'CLASSIC'], ['蓝色光影', 'VIBRANT'], ['双栏展签', 'MODERN']]) {
    await page.getByRole('radio', { name, exact: true }).check()
    await expect(button).toBeEnabled()
    expect(previews.at(-1)?.template).toBe(id)
  }
  await page.getByRole('radio', { name: '方形 1:1', exact: true }).check()
  await page.getByLabel('展览标题').fill('在山野之间')
  await page.getByLabel('一句寄语').fill('把日子交给山川与风。')
  await page.getByRole('slider', { name: '封面取景' }).fill('75')
  await expect(button).toBeEnabled()
  const expected = { template: 'MODERN', format: 'SQUARE', title: '在山野之间', description: '把日子交给山川与风。', focalPoint: 75 }
  expect(previews.at(-1)).toEqual(expected)
  const download = page.waitForEvent('download')
  await button.click()
  expect((await download).suggestedFilename()).toBe('在山野之间-双栏展签-1x1.png')
  expect(downloads).toEqual([expected])
  await expect(page.getByRole('button', { name: '再次下载海报', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '链接分享', exact: true }).click()
  await page.getByRole('tab', { name: '链接分享', exact: true }).press('ArrowRight')
  await expect(page.getByRole('tab', { name: '海报创作', exact: true })).toBeFocused()
  await expect(page.getByLabel('展览标题')).toHaveValue('在山野之间')
})

test('preview failure supports retry, stale previews cannot download and download errors remain actionable', async ({ page }) => {
  const controls = await mockStudio(page)
  controls.setPreviewFailure(true)
  await page.getByLabel('展览标题').fill('新的标题')
  await expect(page.getByRole('alert')).toContainText('图片服务暂时不可用')
  await expect(page.getByRole('button', { name: '下载高清海报', exact: true })).toBeDisabled()
  controls.setPreviewFailure(false)
  await page.getByRole('button', { name: '重新生成预览', exact: true }).click()
  await expect(page.getByRole('button', { name: '下载高清海报', exact: true })).toBeEnabled()
  controls.setPreviewDelay(800)
  await page.getByRole('radio', { name: '长图 9:16', exact: true }).check()
  await expect(page.getByRole('button', { name: '下载高清海报', exact: true })).toBeDisabled()
  // Reverting to a cached preview must clear the pending state as well as aborting the obsolete request.
  await page.getByRole('radio', { name: '竖版 3:4', exact: true }).check()
  await expect(page.getByRole('button', { name: '下载高清海报', exact: true })).toBeEnabled()
  controls.setDownloadFailure(true)
  await page.getByRole('button', { name: '下载高清海报', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('图片服务暂时不可用')
  await expect(page.getByRole('button', { name: '下载高清海报', exact: true })).toBeEnabled()
})

test('private access is explained and the editor fits narrow screens with reachable download controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { downloads } = await mockStudio(page, 'PRIVATE')
  await expect(page.getByText('预览不创建分享链接。下载时生成 30 天有效的访问二维码，可在分享设置中撤销。')).toBeVisible()
  expect(downloads).toHaveLength(0)
  const dialog = page.getByRole('dialog').first()
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(390)
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.getByRole('button', { name: '下载高清海报', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: '下载高清海报', exact: true })).toBeInViewport()
  if (process.env.POSTER_SAMPLES_DIR) await page.screenshot({ path: path.join(process.env.POSTER_SAMPLES_DIR, 'studio-mobile.png') })
})

test('desktop editor presents the controls and actual rendered poster together', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await mockStudio(page)
  await expect(page.getByLabel('展览标题')).toBeInViewport()
  await expect(page.getByRole('img', { name: '全幅影像海报预览', exact: true })).toBeInViewport()
  if (process.env.POSTER_SAMPLES_DIR) await page.screenshot({ path: path.join(process.env.POSTER_SAMPLES_DIR, 'studio-desktop.png') })
})
