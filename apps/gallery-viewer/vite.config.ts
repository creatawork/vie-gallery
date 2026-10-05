import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // 本地 API 端口可用 API_PORT 覆盖（部署环境默认 8088）
  const env = loadEnv(mode, '.', '')
  const apiTarget = `http://localhost:${env.API_PORT || 8088}`

  return {
    base: '/g/',
    plugins: [vue()],
    server: {
      port: 5174,
      proxy: {
        '/oss': {
          target: 'https://vie-gallery.oss-cn-hangzhou.aliyuncs.com',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/oss/, ''),
          configure: proxy => proxy.on('proxyReq', req => {
            req.removeHeader('cookie')
            req.removeHeader('authorization')
            req.setHeader('referer', 'https://gallery.vie-vibe.cn/')
          })
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true
        },
        // 短链接公开重定向（后端 302 到 /g/{slug}?t=…）
        '/s': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    optimizeDeps: {
      force: true
    },
    cacheDir: '/tmp/vite-cache'
  }
})
