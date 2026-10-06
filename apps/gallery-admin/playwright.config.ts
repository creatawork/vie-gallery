import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: process.env.ADMIN_URL || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  // e2e 需要同域双应用（/app/ 管理端 + /g/ 访客预览 iframe），
  // viewer dist 须以 VITE_VIEWER_DIAGNOSTICS=true 构建，见 quality.yml admin-smoke。
  webServer: process.env.CI
    ? {
        command: 'node e2e/prod-shape-static-server.mjs 4173',
        url: 'http://127.0.0.1:4173/app/',
        reuseExistingServer: false,
        timeout: 120_000
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
