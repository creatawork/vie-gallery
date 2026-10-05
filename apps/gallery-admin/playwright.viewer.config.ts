import { defineConfig, devices } from '@playwright/test'
export default defineConfig({ testDir: './e2e', testMatch: 'viewer-config.spec.ts', workers: 1, timeout: 60000, expect: { timeout: 15000 }, reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:15173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1 --port 15173 --strictPort', url: 'http://127.0.0.1:15173', reuseExistingServer: false },
    { command: 'npm run dev -w @vie/gallery-viewer -- --host 127.0.0.1 --port 15174 --strictPort', url: 'http://127.0.0.1:15174', reuseExistingServer: false }
  ] })
