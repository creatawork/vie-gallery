import { test, expect, type Page } from '@playwright/test'

const personalId = '11111111-1111-4111-8111-111111111111'
const invitedId = '22222222-2222-4222-8222-222222222222'
const workspaces = [
  { id: personalId, name: '我的工作区', slug: 'personal', role: 'OWNER', capabilities: ['GALLERY_READ', 'GALLERY_CREATE', 'MEMBER_MANAGE'] },
  { id: invitedId, name: '受邀的摄影工作室', slug: 'shared', role: 'EDITOR', capabilities: ['GALLERY_READ', 'PHOTO_READ', 'PHOTO_WRITE'] }
]

async function mockMembership(page: Page, options: { removed?: boolean; rejectSwitch?: boolean } = {}) {
  const galleryRequests: string[] = []
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const workspace = route.request().headers()['x-workspace-id'] || personalId
    if (path === '/api/me') {
      if (workspace === invitedId && (options.removed || options.rejectSwitch)) {
        return route.fulfill({ status: 403, json: { code: 'AUTH_TENANT_NOT_FOUND' } })
      }
      const selected = workspaces.find(item => item.id === workspace)!
      return route.fulfill({ json: { user: { id: 'invitee', displayName: '受邀成员' }, tenant: selected, role: selected.role, capabilities: selected.capabilities } })
    }
    if (path === '/api/me/workspaces') return route.fulfill({ json: options.removed ? [workspaces[0]] : workspaces })
    if (path === '/api/galleries') {
      galleryRequests.push(workspace)
      return route.fulfill({ json: [{
        id: `${workspace}-gallery`, name: workspace === invitedId ? '共享展厅' : '个人展厅',
        slug: workspace === invitedId ? 'shared-gallery' : 'personal-gallery', status: 'DRAFT', visibility: 'PRIVATE', createdAt: '2026-10-16T00:00:00Z'
      }] })
    }
    return route.fulfill({ json: {} })
  })
  return galleryRequests
}

test('invited member switches spaces and permissions, keeps the selection after refresh and isolates tabs', async ({ page, context }, testInfo) => {
  const requests = await mockMembership(page)
  await page.goto('/app/')
  const selector = page.getByLabel('当前工作区', { exact: true })
  await expect(selector).toBeEnabled()
  await expect(selector.locator('option')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: '个人展厅', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '成员管理', exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索空间名称或地址' }).fill('个人')
  await selector.selectOption(invitedId)
  await expect(page.getByRole('heading', { name: '共享展厅', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '个人展厅', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '成员管理', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建空间', exact: true })).toHaveCount(0)
  expect(requests.at(-1)).toBe(invitedId)
  await page.screenshot({ path: testInfo.outputPath('workspace-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(selector).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('workspace-mobile.png'), fullPage: true })
  await page.reload()
  await expect(selector).toHaveValue(invitedId)
  await expect(page.getByRole('heading', { name: '共享展厅', exact: true })).toBeVisible()

  const otherTab = await context.newPage()
  await mockMembership(otherTab)
  await otherTab.goto('/app/')
  await expect(otherTab.getByLabel('当前工作区', { exact: true })).toHaveValue(personalId)
  await expect(otherTab.getByRole('heading', { name: '个人展厅', exact: true })).toBeVisible()
  await expect(selector).toHaveValue(invitedId)
  await selector.selectOption(personalId)
  await expect(page.getByRole('heading', { name: '个人展厅', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '成员管理', exact: true })).toBeVisible()
})

test('failed switching preserves the current workspace and permissions', async ({ page }) => {
  await mockMembership(page, { rejectSwitch: true })
  await page.goto('/app/')
  const selector = page.getByLabel('当前工作区', { exact: true })
  await expect(selector).toBeEnabled()
  await selector.selectOption(invitedId)
  await expect(page.getByRole('alert')).toContainText('你已无法访问这个工作区')
  await expect(selector).toHaveValue(personalId)
  await expect(page.getByRole('heading', { name: '个人展厅', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '成员管理', exact: true })).toBeVisible()
})

test('a removed saved membership falls back to the personal workspace on reload', async ({ page }) => {
  await page.addInitScript(id => sessionStorage.setItem('vie-active-workspace', id), invitedId)
  await mockMembership(page, { removed: true })
  await page.goto('/app/')
  await expect(page.getByLabel('当前工作区', { exact: true })).toHaveValue(personalId)
  await expect(page.getByRole('heading', { name: '个人展厅', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '成员管理', exact: true })).toBeVisible()
})

test('an old gallery response cannot overwrite the newly selected workspace', async ({ page }) => {
  await mockMembership(page)
  let releasePersonal = () => {}
  const personalResponse = new Promise<void>(resolve => { releasePersonal = resolve })
  await page.route('**/api/galleries', async route => {
    if (route.request().headers()['x-workspace-id'] !== personalId) return route.fallback()
    await personalResponse
    return route.fulfill({ json: [{ id: 'old-gallery', name: '迟到的个人展厅', slug: 'old', status: 'DRAFT', visibility: 'PRIVATE', createdAt: '2026-10-16T00:00:00Z' }] })
  })
  await page.goto('/app/')
  const selector = page.getByLabel('当前工作区', { exact: true })
  await expect(selector).toBeEnabled()
  await selector.selectOption(invitedId)
  await expect(page.getByRole('heading', { name: '共享展厅', exact: true })).toBeVisible()
  const completed = page.waitForResponse(response => response.url().endsWith('/api/galleries') && response.request().headers()['x-workspace-id'] === personalId)
  releasePersonal()
  await completed
  await expect(page.getByRole('heading', { name: '共享展厅', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '迟到的个人展厅', exact: true })).toHaveCount(0)
})
