import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // 本地 API 端口可用 API_PORT 覆盖（部署环境默认 8088）
  const env = loadEnv(mode, '.', '')
  const apiTarget = `http://localhost:${env.API_PORT || 8088}`

  return {
    // 品牌站最终运行于泛子域名（base 为根），过渡期随主站部署在 /site/ 路径
    base: '/site/',
    plugins: [vue()],
    server: {
      port: 5175,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    optimizeDeps: {
      force: true
    },
    cacheDir: '/tmp/vite-cache-site'
  }
})
