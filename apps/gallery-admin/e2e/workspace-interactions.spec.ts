import { test, expect, type Page } from '@playwright/test'

const galleryId = '33333333-3333-4333-8333-333333333333'
const portrait = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="2400"><rect width="800" height="2400" fill="#c2d7cb"/></svg>')}`

async function mockWorkspace(page: Page) {
  const photos = [
    { id: 'photo-one', title: '第一张作品', status: 'READY', thumbnailUrl: portrait },
    { id: 'photo-two', title: '第二张作品', status: 'READY', thumbnailUrl: portrait },
    { id: 'photo-processing', title: '正在处理的作品', status: 'PROCESSING' },
    { id: 'photo-unavailable', title: '暂时失联的作品', status: 'READY', thumbnailUrl: '/unavailable-photo.png' }
  ].map((photo, index) => ({ ...photo, galleryId, sortOrder: index, cover: false, width: 800, height: 2400, byteSize: 204800 }))
  const orders: string[][] = []
  await page.route('**/unavailable-photo.png', route => route.fulfill({ status: 404, body: '' }))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/csrf') return route.fulfill({ json: { token: 'interaction-test' } })
    if (path === '/api/me') return route.fulfill({ json: {
      role: 'OWNER', capabilities: ['GALLERY_READ', 'PHOTO_READ', 'PHOTO_WRITE', 'CONFIG_READ', 'CONFIG_WRITE'],
      user: { displayName: '摄影师', email: 'creator@example.com' }, tenant: { name: '工作室' }
    } })
    if (path === `/api/galleries/${galleryId}`) return route.fulfill({ json: {
      id: galleryId, name: '交互检查', slug: 'interaction-test', visibility: 'PUBLIC', status: 'DRAFT', photoCount: photos.length
    } })
    if (path.endsWith('/photos')) return route.fulfill({ json: photos })
    if (path.endsWith('/photos/order')) {
      orders.push(route.request().postDataJSON().orderedPhotoIds)
      return route.fulfill({ status: 204 })
    }
    if (path.includes('/photo-tasks')) return route.fulfill({ json: { items: [], total: 0, summary: { queued: 0, processing: 0, failed: 0, succeeded: 0, cancelled: 0, cancelRequested: 0 } } })
    if (path.endsWith('/viewer-config')) return route.fulfill({ json: { configJson: '{"presetName":"minimal"}', schemaVersion: 1 } })
    if (path.endsWith('/publish-readiness')) return route.fulfill({ json: { galleryStatus: 'DRAFT', readyPhotoCount: 3, galleryPublishable: true, configDraftChanged: false, blockers: [] } })
    return route.fulfill({ json: {} })
  })
  await page.goto(`/app/galleries/${galleryId}`)
  await expect(page.locator('.photo-card')).toHaveCount(4)
  return { orders }
}

test('keyboard help traps focus, pauses workspace shortcuts and restores the trigger', async ({ page }) => {
  await mockWorkspace(page)
  const trigger = page.getByRole('button', { name: '键盘快捷键', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '键盘快捷键', exact: true })
  const close = dialog.getByRole('button', { name: '关闭', exact: true })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('l')
  await expect(page.locator('.photos-masonry-grid')).toBeVisible()
  await expect(page.locator('.photo-rows')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('moving a photo keeps its lightbox open on the same work and fits a portrait inside the viewport', async ({ page }) => {
  const { orders } = await mockWorkspace(page)
  await page.locator('.photo-card').nth(1).click()
  const dialog = page.getByRole('dialog', { name: '照片大图', exact: true })
  await expect(dialog.getByRole('img', { name: '第二张作品', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '前移', exact: true }).click()
  await expect(dialog.locator('.photo-title')).toContainText('第二张作品')
  await expect(dialog.locator('.index-current')).toHaveText('1')
  await expect.poll(() => orders.length).toBe(1)
  expect(orders[0]).toEqual(['photo-two', 'photo-one', 'photo-processing', 'photo-unavailable'])
  await expect(dialog.getByRole('button', { name: '上一张', exact: true })).toBeDisabled()
  const bounds = await dialog.getByRole('img', { name: '第二张作品', exact: true }).boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
})

test('nested deletion preserves the lightbox focus and scroll lock until all dialogs close', async ({ page }) => {
  await mockWorkspace(page)
  const initialOverflow = await page.evaluate(() => document.body.style.overflow)
  const trigger = page.locator('.photo-card').first()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const lightbox = page.getByRole('dialog', { name: '照片大图', exact: true })
  const remove = lightbox.getByRole('button', { name: '删除', exact: true })
  await remove.click()
  const confirm = page.getByRole('dialog', { name: '确认删除此照片？', exact: true })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(lightbox).toBeVisible()
  await expect(remove).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  await page.keyboard.press('Escape')
  await expect(lightbox).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow)
})

test('unavailable previews explain processing and image failures without a broken image', async ({ page }) => {
  await mockWorkspace(page)
  await page.locator('.photo-card').nth(2).click()
  const dialog = page.getByRole('dialog', { name: '照片大图', exact: true })
  await expect(dialog.getByRole('status')).toContainText('照片正在处理中')
  await expect(dialog.locator('img')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('status')).toContainText('照片未能加载')
  await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await expect(dialog.locator('img')).toHaveCount(0)
})
