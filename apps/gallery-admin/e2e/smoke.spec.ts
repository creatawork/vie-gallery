import { test, expect } from '@playwright/test'

test.describe('Creator Admin Smoke Test', () => {
  test('guest shell renders login or overview heading', async ({ page }) => {
    await page.goto('/')
    const loginHeader = page.locator('.auth-header')
    const overviewHeading = page.getByRole('heading', { name: '我的空间' })
    await expect(loginHeader.or(overviewHeading)).toBeVisible()
  })

  test('create modal remains interactive through close and reopen', async ({ page }) => {
    await page.route('**/api/auth/csrf', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'e2e-csrf-token' })
      })
    })
    await page.route('**/api/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          role: 'OWNER',
          capabilities: ['GALLERY_READ', 'GALLERY_CREATE'],
          user: { displayName: '回归测试用户', email: 'e2e@example.com' },
          tenant: { name: '回归测试工作区' }
        })
      })
    })
    await page.route(/\/api\/galleries\/11111111-1111-4111-8111-111111111111(?:\/.*)?$/, async route => {
      const url = route.request().url()
      if (url.endsWith('/photos')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'regression-gallery',
          name: '回归测试空间',
          visibility: 'PUBLIC',
          status: 'DRAFT',
          publishedAt: null,
          coverPhotoId: null,
          coverThumbnailUrl: null,
          createdAt: '2026-09-12T00:00:00Z',
          updatedAt: '2026-09-12T00:00:00Z',
          photoCount: 0,
          failedPhotoCount: 0,
          processingCount: 0,
          hasUnpublishedConfig: false
        })
      })
    })
    await page.route('**/api/galleries', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'regression-gallery',
          name: '回归测试空间',
          visibility: 'PUBLIC',
          status: 'DRAFT',
          publishedAt: null,
          coverPhotoId: null,
          coverThumbnailUrl: null,
          createdAt: '2026-09-12T00:00:00Z',
          updatedAt: '2026-09-12T00:00:00Z',
          photoCount: 0,
          failedPhotoCount: 0,
          processingCount: 0,
          hasUnpublishedConfig: false
        })
      })
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: '我的空间' })).toBeVisible()
    const createTrigger = page.locator('#btn-open-create-modal')
    await expect(createTrigger).toBeVisible()

    await createTrigger.click()
    const createDialog = page.getByRole('dialog', { name: '新建空间' })
    await expect(createDialog).toBeVisible()
    await expect(createDialog).toContainText('创建一个新的 3D 画廊空间')
    await expect(createDialog.locator(':focus')).toBeVisible()

    await page.locator('#input-gallery-name').fill('回归测试空间')
    await page.locator('#select-gallery-visibility').selectOption('PUBLIC')
    await expect(createDialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(createDialog).toBeHidden()
    await expect(createTrigger).toBeFocused()

    await createTrigger.click()
    await expect(createDialog).toBeVisible()
    await createDialog.getByRole('button', { name: '取消' }).click()
    await expect(createDialog).toBeHidden()
    await expect(createTrigger).toBeFocused()

    await createTrigger.click()
    await expect(createDialog).toBeVisible()
    await page.locator('#input-gallery-name').fill('回归测试空间')
    await page.locator('#input-gallery-slug').fill('regression-gallery')
    const createRequest = page.waitForRequest(request => request.url().endsWith('/api/galleries') && request.method() === 'POST')
    await page.locator('#btn-create-submit').click()
    await expect(createRequest).resolves.toBeTruthy()
    await expect(page).toHaveURL(/\/app\/galleries\/11111111-1111-4111-8111-111111111111$/)
  })
})
