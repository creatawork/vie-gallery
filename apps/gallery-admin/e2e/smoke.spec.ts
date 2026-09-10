import { test, expect } from '@playwright/test'

test.describe('Creator Admin Smoke Test', () => {
  test('guest shell renders login or overview heading', async ({ page }) => {
    await page.goto('/')
    const loginHeader = page.locator('.auth-header')
    const overviewHeading = page.getByRole('heading', { name: '我的空间' })
    await expect(loginHeader.or(overviewHeading)).toBeVisible()
  })

  test('create entry is available after overview loads', async ({ page }) => {
    test.skip(!!process.env.CI, 'Authenticated overview flow requires API; run locally with backend.')
    await page.goto('/')
    const loginHeader = page.locator('.auth-header')
    if (await loginHeader.isVisible()) {
      await page.fill('#auth-email', 'creator@example.com')
      await page.fill('#auth-password', 'Password123456')
      await page.click('#btn-auth-submit')
    }
    await expect(page.getByRole('heading', { name: '我的空间' })).toBeVisible()
    await expect(page.locator('#btn-open-create-modal')).toBeVisible()
  })
})
