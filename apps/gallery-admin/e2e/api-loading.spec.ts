import { test, expect } from '@playwright/test'
import { build } from 'esbuild'

// Exercise the actual API client in an isolated browser, without a backend.
test('concurrent writes share CSRF initialization', async ({ page }) => {
  const bundle = await build({ entryPoints: ['src/api.ts'], bundle: true, write: false, format: 'iife', globalName: 'apiClient' })
  await page.goto('/app/')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  let csrfRequests = 0
  await page.route('**/api/auth/csrf', async route => {
    csrfRequests++
    await new Promise(resolve => setTimeout(resolve, 100))
    await route.fulfill({ json: { token: 'test-csrf' } })
  })
  await page.route('**/api/loading-test', route => route.fulfill({ status: 204 }))
  const statuses = await page.evaluate(async () => {
    const client = (window as any).apiClient
    return Promise.all([1, 2, 3].map(async () => (await client.apiFetch('/api/loading-test', { method: 'POST' })).status))
  })
  expect(statuses).toEqual([204, 204, 204])
  expect(csrfRequests).toBe(1)
})

test('stalled read requests time out instead of leaving pages loading forever', async ({ page }) => {
  const bundle = await build({ entryPoints: ['src/api.ts'], bundle: true, write: false, format: 'iife', globalName: 'apiClient' })
  await page.goto('/app/')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await page.clock.install()
  await page.route('**/api/loading-test', () => {})
  await page.evaluate(() => {
    (window as any).readResult = 'pending'
    ;(window as any).apiClient.apiFetch('/api/loading-test').catch((error: Error) => { (window as any).readResult = error.message })
  })
  await page.clock.fastForward(30_001)
  await expect.poll(() => page.evaluate(() => (window as any).readResult)).toContain('请求超时')
})

test('failed CSRF initialization is released so the next write can retry', async ({ page }) => {
  const bundle = await build({ entryPoints: ['src/api.ts'], bundle: true, write: false, format: 'iife', globalName: 'apiClient' })
  await page.goto('/app/')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await page.route('**/api/auth/csrf', route => route.fulfill({ status: 503 }))
  const failed = await page.evaluate(async () => {
    try { await (window as any).apiClient.apiFetch('/api/loading-test', { method: 'POST' }); return false }
    catch { return true }
  })
  expect(failed).toBe(true)
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'retry-csrf' } }))
  await page.route('**/api/loading-test', route => route.fulfill({ status: route.request().headers()['x-xsrf-token'] === 'retry-csrf' ? 204 : 403 }))
  expect(await page.evaluate(async () => (await (window as any).apiClient.apiFetch('/api/loading-test', { method: 'POST' })).status)).toBe(204)
})
