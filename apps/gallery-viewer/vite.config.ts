import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  base: '/g/',
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true
      },
      // 短链接公开重定向（后端 302 到 /g/{slug}?t=…）
      '/s': {
        target: 'http://localhost:8088',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    force: true
  },
  cacheDir: '/tmp/vite-cache'
})

