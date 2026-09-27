import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // 本地 API 端口可用 API_PORT 覆盖（部署环境默认 8088）
  const env = loadEnv(mode, '.', '')
  const apiTarget = `http://localhost:${env.API_PORT || 8088}`

  return {
    base: '/app/',
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  }
})
