import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const id = '11111111-1111-4111-8111-111111111111'
const output = resolve(process.cwd(), '../../.cache/experience-polish')
const user = { role: 'OWNER', capabilities: ['GALLERY_READ', 'GALLERY_CREATE', 'PHOTO_READ', 'PHOTO_WRITE', 'PUBLISH', 'SHARE_MANAGE', 'CONFIG_READ', 'CONFIG_WRITE', 'MEMBER_MANAGE'], user: { displayName: '林小满', email: 'creator@example.com' }, tenant: { name: '林小满的工作室' } }
const gallery = { id, name: '山间来信', slug: 'mountain-letters', visibility: 'PUBLIC', status: 'DRAFT', photoCount: 8, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' }

async function mockApi(page: Page, authenticated: boolean, galleries: unknown[] = []) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()).pathname
    if (url === '/api/me') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? user : { message: 'Unauthenticated' } })
    if (url === '/api/auth/csrf') return route.fulfill({ json: { token: 'experience-test' } })
    if (url === '/api/galleries') return route.fulfill({ json: galleries })
    if (url === `/api/galleries/${id}`) return route.fulfill({ json: gallery })
    if (url.endsWith('/photos')) return route.fulfill({ json: [] })
    if (url.includes('/photo-tasks')) return route.fulfill({ json: { items: [], total: 0, summary: { queued: 0, processing: 0, failed: 0, succeeded: 0, cancelled: 0, cancelRequested: 0 } } })
    return route.fulfill({ json: {} })
  })
}

async function shot(page: Page, name: string) {
  mkdirSync(output, { recursive: true })
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

for (const width of [390, 768, 1440]) {
  test(`entry and collection fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await mockApi(page, false)
    await page.goto('/app/')
    await expect(page.getByRole('heading', { name: '欢迎回到你的空间' })).toBeVisible()
    await shot(page, `login-${width}`)
    await page.getByRole('button', { name: '注册账户', exact: true }).click()
    await expect(page.locator('#auth-password')).toHaveAttribute('autocomplete', 'new-password')
    await shot(page, `register-${width}`)
    await page.getByRole('button', { name: '账号登录', exact: true }).click()
    await expect(page.getByRole('button', { name: '忘记密码？' })).toHaveCount(0)
    await page.unroute('**/api/**')
    await mockApi(page, true, [gallery, { ...gallery, id: 'two', name: '海风经过', status: 'PUBLISHED', photoCount: 12 }, { ...gallery, id: 'three', name: '城市的慢镜头', visibility: 'PASSWORD', photoCount: 6 }])
    await page.reload()
    await expect(page.locator('.space-card')).toHaveCount(3)
    await shot(page, `overview-${width}`)
    await page.locator('#btn-open-create-modal').click()
    await expect(page.getByRole('dialog', { name: '新建空间' })).toBeVisible()
    await shot(page, `create-${width}`)
    await page.keyboard.press('Escape')
    await expect(page.locator('#btn-open-create-modal')).toBeFocused()
    expect(errors).toEqual([])
  })
}

test('login supports password visibility, errors and retry', async ({ page }) => {
  await mockApi(page, false)
  let attempts = 0
  await page.route('**/api/auth/login', route => {
    attempts++
    return route.fulfill({ status: attempts === 1 ? 401 : 200, json: attempts === 1 ? { message: 'Invalid credentials' } : user })
  })
  await page.goto('/app/')
  await page.locator('#auth-email').fill('creator@example.com')
  await page.locator('#auth-password').fill('test-password-123')
  await page.getByRole('button', { name: '显示密码' }).click()
  await expect(page.locator('#auth-password')).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: '隐藏密码' }).click()
  await page.locator('#btn-auth-submit').click()
  await expect(page.locator('.auth-card [role="alert"]')).toContainText('邮箱或密码不正确')
  await page.locator('#btn-auth-submit').click()
  await expect(page.getByRole('heading', { name: '我的空间' })).toBeVisible()
  expect(attempts).toBe(2)
})

test('password protected creation saves the password before opening the workspace', async ({ page }) => {
  await mockApi(page, true)
  const calls: string[] = []
  await page.route('**/api/galleries', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    calls.push('create')
    expect(route.request().postDataJSON().visibility).toBe('PASSWORD')
    await new Promise(resolve => setTimeout(resolve, 250))
    return route.fulfill({ status: 201, json: { ...gallery, visibility: 'PASSWORD' } })
  })
  await page.route(`**/api/galleries/${id}/password`, route => {
    calls.push('password')
    expect(route.request().postDataJSON()).toEqual({ password: 'visitor-pass-123' })
    return route.fulfill({ json: { ...gallery, visibility: 'PASSWORD' } })
  })
  await page.goto('/app/')
  await page.locator('#btn-open-create-modal').click()
  await page.locator('#input-gallery-name').fill('山间来信')
  await page.locator('#select-gallery-visibility').selectOption('PASSWORD')
  await page.locator('#create-password').fill('visitor-pass-123')
  await page.locator('#btn-create-submit').click()
  await expect(page.locator('#select-gallery-visibility')).toBeDisabled()
  await expect(page).toHaveURL(new RegExp(`/galleries/${id}$`))
  expect(calls).toEqual(['create', 'password'])
})

test('card menu Enter does not navigate through its parent card', async ({ page }) => {
  await mockApi(page, true, [gallery])
  await page.goto('/app/')
  await page.getByRole('button', { name: '更多操作' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.card-menu')).toBeVisible()
  await expect(page).toHaveURL(/\/app\/$/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.card-menu')).toBeHidden()
})

test('password save failure keeps the created gallery and offers a recovery path', async ({ page }) => {
  await mockApi(page, true)
  let created = 0
  await page.route('**/api/galleries', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    created++
    return route.fulfill({ status: 201, json: { ...gallery, visibility: 'PASSWORD' } })
  })
  await page.route(`**/api/galleries/${id}/password`, route => route.fulfill({ status: 503, json: { message: '暂时不可用' } }))
  await page.goto('/app/')
  await page.locator('#btn-open-create-modal').click()
  await page.locator('#input-gallery-name').fill('山间来信')
  await page.locator('#select-gallery-visibility').selectOption('PASSWORD')
  await page.locator('#create-password').fill('visitor-pass-123')
  await page.locator('#btn-create-submit').click()
  await expect(page).toHaveURL(new RegExp(`/galleries/${id}$`))
  await expect(page.locator('.toast-message')).toContainText('空间已创建，访问密码未保存')
  expect(created).toBe(1)
})

test('members fit mobile and preserve failed invite input', async ({ page }) => {
  await mockApi(page, true)
  await page.route('**/api/workspace/members', route => route.fulfill({
    status: route.request().method() === 'POST' ? 409 : 200,
    json: route.request().method() === 'POST' ? { message: '该邮箱尚未注册，请先请对方创建账户。' } : [
      { id: 'owner', role: 'OWNER', displayName: '林小满', email: 'creator@example.com', joinedAt: '2026-10-01T00:00:00Z' },
      { id: 'editor', role: 'EDITOR', displayName: '一个很长的摄影工作室成员名称', email: 'long-name-in-the-studio@example.com', joinedAt: '2026-10-02T00:00:00Z' }
    ]
  }))
  await page.goto('/app/members')
  await expect(page.locator('.member-table tbody tr')).toHaveCount(2)
  await shot(page, 'members-1440')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot(page, 'members-390')
  await page.getByRole('button', { name: '添加成员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加成员' })
  await dialog.getByLabel('电子邮箱').fill('new-member@example.com')
  await dialog.getByRole('button', { name: '添加成员', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('该邮箱尚未注册')
  await expect(dialog.getByLabel('电子邮箱')).toHaveValue('new-member@example.com')
  await shot(page, 'member-invite-error-390')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '添加成员', exact: true })).toBeFocused()
  const trigger = page.getByRole('button', { name: '一个很长的摄影工作室成员名称的更多操作' })
  await trigger.click()
  await page.getByRole('button', { name: '设为查看者' }).focus()
  await page.keyboard.press('Escape')
  await expect(page.locator('.menu-pop')).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('button', { name: '移除成员', exact: true }).click()
  const removeDialog = page.getByRole('dialog', { name: '确认移除成员' })
  await expect(removeDialog).toBeVisible()
  await removeDialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(trigger).toBeFocused()
})

test('password recovery stays closed and old reset URLs return to login without the token', async ({ page }) => {
  await mockApi(page, false)
  const requests: string[] = []
  page.on('request', request => {
    if (/\/api\/auth\/(forgot|reset)-password/.test(request.url())) requests.push(request.url())
  })
  await page.goto('/app/reset-password?token=experience-test')
  await expect(page).toHaveURL(/\/app\/$/)
  await expect(page.getByRole('heading', { name: '欢迎回到你的空间' })).toBeVisible()
  await expect(page.getByRole('button', { name: '忘记密码？' })).toHaveCount(0)
  await expect(page.getByLabel('新密码', { exact: true })).toHaveCount(0)
  expect(requests).toEqual([])
})

for (const mode of ['login', 'register'] as const) {
  test(`${mode} blocks five characters and accepts a six-character password`, async ({ page }) => {
    await mockApi(page, false)
    const passwords: string[] = []
    await page.route(`**/api/auth/${mode}`, route => {
      passwords.push(route.request().postDataJSON().password)
      return route.fulfill({ status: mode === 'register' ? 201 : 200, json: user })
    })
    await page.goto('/app/')
    if (mode === 'register') {
      await page.getByRole('button', { name: '注册账户', exact: true }).click()
      await page.getByLabel('用户名称').fill('阳光摄影师')
    }
    await page.locator('#auth-email').fill('creator@example.com')
    await page.locator('#auth-password').fill('abc12')
    await page.locator('#btn-auth-submit').click()
    expect(await page.locator('#auth-password').evaluate((input: HTMLInputElement) => input.validity.tooShort)).toBe(true)
    expect(passwords).toEqual([])
    await page.locator('#auth-password').fill('abc123')
    await page.locator('#btn-auth-submit').click()
    await expect(page.getByRole('heading', { name: '我的空间' })).toBeVisible()
    await expect(page).toHaveTitle('我的空间 · 阳光明媚')
    expect(passwords).toEqual(['abc123'])
  })
}

test('desktop card menu supports arrow keys and restores focus after renaming', async ({ page }) => {
  await mockApi(page, true, [gallery])
  await page.goto('/app/')
  const trigger = page.getByRole('button', { name: '更多操作' })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: '进入工作区', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: '删除空间…', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('button', { name: '重命名', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '重命名空间', exact: true })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Space activates card menu buttons without opening the workspace', async ({ page }) => {
  await mockApi(page, true, [gallery])
  await page.goto('/app/')
  const trigger = page.getByRole('button', { name: '更多操作' })
  await trigger.focus()
  await page.keyboard.press('Space')
  const rename = page.getByRole('button', { name: '重命名', exact: true })
  await expect(rename).toBeVisible()
  await rename.focus()
  await page.keyboard.press('Space')
  const dialog = page.getByRole('dialog', { name: '重命名空间', exact: true })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/app\/$/)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('brand icon loads from both deployed application prefixes', async ({ page, request }) => {
  await mockApi(page, false)
  await page.goto('/app/')
  await expect(page).toHaveTitle('登录 · 阳光明媚')
  await expect(page.locator('.auth-brand-mark')).toContainText('阳光明媚')
  const icon = page.locator('link[rel="icon"]')
  await expect(icon).toHaveAttribute('href', '/app/favicon.svg')
  for (const prefix of ['/app/', '/g/']) {
    const response = await request.get(`${prefix}favicon.svg`)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/svg+xml')
    expect(await response.text()).toContain('<svg')
  }
})
