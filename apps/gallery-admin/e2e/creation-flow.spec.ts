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
    thumbnailUrl: null as string | null,
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


  test('大图弹层限制 Tab 焦点并在关闭后回到照片卡片', async ({ page }, testInfo) => {
    photos[0].thumbnailUrl = '/app/covers/coast.png'
    await page.reload()
    const card = page.locator('.photo-card').first()
    await card.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: '照片大图' })
    await expect(dialog).toBeVisible()
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: '修改照片标题' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: '后移', exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: '修改照片标题' })).toBeFocused()
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('lightbox-desktop.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(card).toBeFocused()
  })

  test('标题编辑支持键盘，输入法 Enter 不提交，Esc 只取消编辑', async ({ page }) => {
    let updatedTitle: string | undefined
    await page.route('**/api/photos/photo-1', async route => {
      updatedTitle = route.request().postDataJSON().title
      photos[0].title = updatedTitle!
      await route.fulfill({ status: 204 })
    })
    await page.locator('.photo-card').first().click()
    const dialog = page.getByRole('dialog', { name: '照片大图' })
    const edit = dialog.getByRole('button', { name: '修改照片标题' })
    await edit.focus()
    await page.keyboard.press('Enter')
    const input = dialog.getByRole('textbox', { name: '照片标题' })
    await expect(input).toBeFocused()
    await input.fill('日出东海')
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
    await expect(input).toBeVisible()
    expect(updatedTitle).toBeUndefined()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(edit).toBeFocused()
    expect(updatedTitle).toBeUndefined()
    await page.keyboard.press('Space')
    await input.fill('日出东海')
    await page.keyboard.press('Enter')
    await expect.poll(() => updatedTitle).toBe('日出东海')
    await expect(edit).toBeFocused()
  })

  test('只读用户只在真实封面照片上看到当前封面', async ({ page }) => {
    await page.route('**/api/me', route => route.fulfill({ json: {
      role: 'VIEWER', capabilities: ['GALLERY_READ', 'PHOTO_READ', 'CONFIG_READ'],
      user: { displayName: '只读用户', email: 'viewer@example.com' }, tenant: { name: '回归测试工作区' }
    } }))
    await page.reload()
    await page.locator('.photo-card').first().click()
    const overlay = page.locator('.lightbox-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay.getByText('当前封面')).toHaveCount(0)
    await expect(overlay.getByRole('button', { name: '设为相册封面' })).toHaveCount(0)
    await overlay.getByRole('button', { name: '下一张', exact: true }).click()
    await expect(overlay.getByText('当前封面')).toBeVisible()
  })

  test('窄屏大图工具栏和长标题完整容纳，关闭操作可触达', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    photos[0].title = '这是一段用于检验手机布局的照片标题'.repeat(8)
    photos[0].thumbnailUrl = '/app/covers/coast.png'
    await page.reload()
    await page.locator('.photo-card').first().click()
    const overlay = page.locator('.lightbox-overlay')
    await expect(overlay).toBeVisible()
    const close = overlay.getByRole('button', { name: '关闭 (Esc)' })
    const box = await close.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    expect(await overlay.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(overlay.locator('.photo-title')).toBeInViewport()
    await expect(overlay.locator('.main-image')).toBeInViewport()
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('lightbox-mobile.png') })
    await overlay.getByRole('button', { name: '修改照片标题' }).click()
    await expect(overlay.getByRole('textbox', { name: '照片标题' })).toBeInViewport()
    expect(await overlay.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  })


  test('大图上的删除确认独占键盘，取消后返回大图', async ({ page }) => {
    await page.locator('.photo-card').first().click()
    const lightbox = page.getByRole('dialog', { name: '照片大图' })
    const remove = lightbox.getByRole('button', { name: '删除', exact: true })
    await remove.click()
    const confirmation = page.getByRole('dialog', { name: '确认删除此照片？' })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: '确认删除' }).focus()
    await page.keyboard.press('Tab')
    await expect(confirmation.getByRole('button', { name: '取消' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirmation).toHaveCount(0)
    await expect(lightbox).toBeVisible()
    await expect(remove).toBeFocused()
  })


  test('手机竖版照片不会遮住标题或工具栏', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    photos[0].thumbnailUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200"><rect width="600" height="1200" fill="#047857"/></svg>')
    photos[0].title = '手机竖版照片的长标题'.repeat(12)
    await page.reload()
    await page.locator('.photo-card').first().click()
    const overlay = page.locator('.lightbox-overlay')
    const image = overlay.locator('.main-image')
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate(el => {
      const rect = el.getBoundingClientRect()
      const stage = el.closest('.lightbox-stage')!.getBoundingClientRect()
      return rect.top >= stage.top && rect.bottom <= stage.bottom
    })).toBe(true)
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('lightbox-portrait.png') })
  })


  test('卡片内键盘选择和菜单操作不会误开大图', async ({ page }) => {
    const card = page.locator('.photo-card').first()
    const select = card.getByRole('button', { name: '选中照片', exact: true })
    await select.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: '照片大图' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: '取消选中', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const more = card.getByRole('button', { name: '更多操作' })
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Tab')
    await expect(card.getByRole('button', { name: '查看大图', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('dialog', { name: '照片大图' })).toHaveCount(0)
    await card.focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('dialog', { name: '照片大图' })).toBeVisible()
  })

  test('可排序网格的照片按钮支持鼠标选择和菜单展开', async ({ page }, testInfo) => {
    const card = page.locator('.photo-card').first()
    await card.getByRole('button', { name: '选中照片', exact: true }).click()
    await expect(page.locator('.batch-selected-badge')).toHaveText('1')
    await card.getByRole('button', { name: '更多操作' }).click()
    await expect(card.getByRole('button', { name: '查看大图', exact: true })).toBeVisible()
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('card-controls-desktop.png') })
    await page.setViewportSize({ width: 320, height: 740 })
    for (const button of [card.locator('.select-btn'), card.locator('.ghost-btn')]) {
      await expect.poll(async () => (await button.boundingBox())!.width).toBeGreaterThanOrEqual(44)
      await expect.poll(async () => (await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('card-controls-mobile.png') })
  })

  test('网格拖动排序忽略上传入口的位置', async ({ page }) => {
    let order: string[] = []
    await page.route(new RegExp('/api/galleries/' + GALLERY_ID + '/photos/order$'), async route => {
      order = route.request().postDataJSON().orderedPhotoIds
      await route.fulfill({ status: 204 })
    })
    const source = page.locator('.photo-card').nth(1)
    const target = page.locator('.photo-card').first()
    await source.scrollIntoViewIfNeeded()
    const from = (await source.boundingBox())!
    const to = (await target.boundingBox())!
    await page.mouse.move(from.x + 130, from.y + 110)
    await page.mouse.down()
    await page.mouse.move(from.x + 120, from.y + 110, { steps: 5 })
    await expect(source).toHaveClass(/sortable-chosen/)
    await page.mouse.move(to.x + 20, to.y + 110, { steps: 20 })
    await page.mouse.move(to.x + 30, to.y + 110)
    await page.mouse.up()
    await expect.poll(() => order).toEqual(['photo-2', 'photo-1'])
    await expect(page.locator('.photo-card').first()).toContainText('海浪')
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
    const close = page.locator('.toast-warning').getByRole('button', { name: '关闭', exact: true })
    await expect.poll(async () => (await close.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44)
    await expect.poll(async () => (await close.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await close.click()
    await expect(page.locator('.toast-warning')).toHaveCount(0)
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

  test('列表编辑不在输入法确认时提交，保存和取消后返回原行标题', async ({ page }) => {
    const updates: string[] = []
    await page.route('**/api/photos/photo-2', async route => {
      const title = route.request().postDataJSON().title as string
      updates.push(title)
      photos[1].title = title
      await route.fulfill({ status: 204 })
    })
    await page.getByRole('button', { name: '列表视图' }).click()
    const row = page.locator('.photo-list-row').nth(1)
    const title = row.locator('.row-title')
    await title.focus()
    await page.keyboard.press('Enter')
    const input = row.getByRole('textbox', { name: '照片标题' })
    await expect(input).toBeFocused()
    await input.fill('海浪与风')
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
    await expect(input).toBeVisible()
    expect(updates).toEqual([])
    await input.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
    await expect(input).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(title).toBeFocused()
    await expect(title).toHaveText('海浪')
    expect(updates).toEqual([])
    await page.keyboard.press('Space')
    await input.fill('  海浪与风  ')
    await page.keyboard.press('Enter')
    await expect(title).toHaveText('海浪与风')
    await expect(title).toBeFocused()
    expect(updates).toEqual(['海浪与风'])
  })

  test('列表标题失焦保存不会抢走下一个操作的焦点', async ({ page }) => {
    await page.route('**/api/photos/photo-1', async route => {
      photos[0].title = route.request().postDataJSON().title
      await route.fulfill({ status: 204 })
    })
    await page.getByRole('button', { name: '列表视图' }).click()
    const row = page.locator('.photo-list-row').first()
    await row.locator('.row-title').click()
    await row.getByRole('textbox', { name: '照片标题' }).fill('新的日出')
    const search = page.getByRole('searchbox', { name: '搜索照片标题' })
    await search.click()
    await expect(row.locator('.row-title')).toHaveText('新的日出')
    await expect(search).toBeFocused()
  })

  test('手机列表长标题编辑保持在行内并提供可触达的输入框', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 })
    photos[0].title = '长标题用于验证手机照片整理界面'.repeat(10)
    await page.reload()
    await page.getByRole('button', { name: '列表视图' }).click()
    const row = page.locator('.photo-list-row').first()
    await row.locator('.row-title').click()
    const input = row.getByRole('textbox', { name: '照片标题' })
    await expect(input).toBeFocused()
    const bounds = await input.boundingBox()
    // 浏览器布局坐标有浮点误差（44px 可返回 43.999969），按百分之一像素比较。
    expect(Math.round(bounds!.height * 100) / 100).toBeGreaterThanOrEqual(44)
    expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('list-title-edit-mobile.png') })
  })

  test('列表标题保存保留筛选和选择，失败后原标题可再次编辑', async ({ page }) => {
    let shouldFail = true
    await page.route('**/api/photos/photo-2', async route => {
      if (shouldFail) {
        await route.fulfill({ status: 500, json: { message: '更新标题失败，请重试。' } })
        return
      }
      photos[1].title = route.request().postDataJSON().title
      await route.fulfill({ status: 204 })
    })
    await page.getByRole('button', { name: '列表视图' }).click()
    const container = page.locator('.photo-list-container')
    const search = container.getByRole('searchbox')
    await search.fill('海浪')
    await container.getByRole('button', { name: '全选当前' }).click()
    const title = container.locator('.row-title')
    await title.click()
    await container.getByRole('textbox', { name: '照片标题' }).fill('海浪与风')
    await page.keyboard.press('Enter')
    await expect(page.locator('.toast-error').first()).toContainText('重试')
    await expect(title).toHaveText('海浪')
    await expect(title).toBeFocused()
    shouldFail = false
    await page.keyboard.press('Enter')
    await container.getByRole('textbox', { name: '照片标题' }).fill('海浪与风')
    await page.keyboard.press('Enter')
    await expect(title).toHaveText('海浪与风')
    await expect(search).toHaveValue('海浪')
    await expect(container.locator('.batch-selected-badge')).toHaveText('1')
    await expect(title).toBeFocused()
  })

  for (const view of ['网格', '列表']) {
    test(`${view}只读用户可以筛选和预览，无法执行策展操作`, async ({ page }) => {
      await page.route('**/api/me', route => route.fulfill({ json: {
        role: 'VIEWER', capabilities: ['GALLERY_READ', 'PHOTO_READ', 'CONFIG_READ'],
        user: { displayName: '只读用户', email: 'viewer@example.com' }, tenant: { name: '回归测试工作区' }
      } }))
      await page.reload()
      if (view === '列表') await page.getByRole('button', { name: '列表视图' }).click()
      const container = page.locator(view === '列表' ? '.photo-list-container' : '.photo-grid-container')
      await container.getByRole('searchbox').fill('海浪')
      await expect(container.getByRole('button', { name: '全选当前' })).toHaveCount(0)
      await expect(container.locator('.floating-batch-bar, .row-actions, .row-select, .row-drag-handle')).toHaveCount(0)
      await container.getByRole('button', { name: '清除筛选', exact: true }).click()
      if (view === '列表') await container.getByRole('button', { name: '预览照片：日出' }).click()
      else await container.locator('.photo-card').first().click()
      const dialog = page.getByRole('dialog', { name: '照片大图' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: '修改照片标题' })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
    })

    test(`${view}筛选可直接清除且选中状态可被识别`, async ({ page }, testInfo) => {
      if (view === '列表') await page.getByRole('button', { name: '列表视图' }).click()
      const container = page.locator(view === '列表' ? '.photo-list-container' : '.photo-grid-container')
      const ready = container.getByRole('button', { name: '已就绪' })
      await ready.click()
      await expect(ready).toHaveAttribute('aria-pressed', 'true')
      await container.getByRole('searchbox').fill('海浪')
      await expect(container.getByRole('status')).toContainText('显示 1 / 2 张照片')
      await container.getByRole('button', { name: '清除筛选', exact: true }).click()
      await expect(container.getByRole('searchbox')).toHaveValue('')
      await expect(ready).toHaveAttribute('aria-pressed', 'false')
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`curation-${view}-desktop.png`) })
    })

    test(`${view}手机批量操作完整显示`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 740 })
      if (view === '列表') await page.getByRole('button', { name: '列表视图' }).click()
      const container = page.locator(view === '列表' ? '.photo-list-container' : '.photo-grid-container')
      await container.getByRole('button', { name: '全选当前' }).click()
      const bar = container.locator('.floating-batch-bar')
      await expect(bar).toHaveCSS('opacity', '1')
      const bounds = await bar.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
      for (const button of await bar.getByRole('button').all()) {
        await expect(button).toBeInViewport()
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      if (view === '列表') {
        const row = container.locator('.photo-list-row').first()
        expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
        await expect(row.getByRole('button', { name: '预览照片：日出' })).toBeVisible()
      }
      await expect.poll(() => page.locator('.hall-body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect(await page.locator('.hero-actions').evaluate(el => {
        const rect = el.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= window.innerWidth
      })).toBe(true)
      await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`curation-${view}-mobile.png`) })
    })

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
