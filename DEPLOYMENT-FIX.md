# 线上预览页 404 错误修复说明

## 问题诊断

### 症状
```
Failed to load resource: the server responded with a status of 404 ()
/assets/index-CilHDSAr.js:1 Failed to load module script: 
Expected a JavaScript-or-Wasm module script but the server responded 
with a MIME type of "text/html".
```

### 根本原因
`infra/nginx-prod-ssl.conf` 配置为将前端请求代理到开发服务器（localhost:5173 和 localhost:5174），而不是提供构建好的静态文件。这导致：

1. **404 错误**：当开发服务器未运行时，所有资源请求失败
2. **资源哈希不匹配**：`index.html` 引用 `index-CilHDSAr.js`，但服务器返回过时的构建版本
3. **MIME 类型错误**：nginx 返回 HTML 错误页面而不是 JavaScript 模块

## 修复方案

### 1. 配置 Vite Base 路径 ✅

**apps/gallery-admin/vite.config.ts**
```typescript
export default defineConfig({
  base: '/app/',  // 新增：匹配 nginx location
  plugins: [vue()],
  // ...
})
```

**apps/gallery-viewer/vite.config.ts**
```typescript
export default defineConfig({
  base: '/g/',  // 新增：匹配 nginx location
  plugins: [vue()],
  // ...
})
```

### 2. 更新 Nginx 配置为静态文件服务 ✅

**infra/nginx-prod-ssl.conf**

**修复前（错误）：**
```nginx
location /app/ {
    proxy_pass http://localhost:5173/app/;  # 代理到开发服务器 ❌
    # ...
}

location /assets/ {
    proxy_pass http://localhost:5173/assets/;  # 代理到开发服务器 ❌
}
```

**修复后（正确）：**
```nginx
# 管理端 (Admin UI) - 静态文件服务
location /app/ {
    alias /home/ubuntu/vie-gallery/admin/;
    try_files $uri $uri/ /app/index.html;
    index index.html;
}

# 公开展示端 (Viewer UI) - 静态文件服务
location /g/ {
    alias /home/ubuntu/vie-gallery/viewer/;
    try_files $uri $uri/ /g/index.html;
    index index.html;
}
```

**关键点：**
- 使用 `alias` 而非 `proxy_pass`，直接提供磁盘上的静态文件
- `try_files` 确保 SPA 路由正常工作（所有未找到的路径回退到 index.html）
- 无需单独配置 `/assets/`、`/covers/` 等路径，`alias` 自动处理所有子目录

### 3. 重新构建前端 ✅

```bash
cd apps/gallery-admin
npm run build  # 生成带 /app/ 前缀的资源路径

cd ../gallery-viewer
npm run build  # 生成带 /g/ 前缀的资源路径
```

**验证构建产物：**
```bash
# Admin index.html 应包含：
<script src="/app/assets/index-xxx.js">

# Viewer index.html 应包含：
<script src="/g/assets/index-xxx.js">
```

## 部署步骤

### 方式一：使用 deploy.sh 自动部署（推荐）

```bash
./deploy.sh
```

这将自动：
1. 构建前端（带正确的 base 路径）
2. 打包后端
3. 传输所有文件到服务器
4. 更新 nginx 配置
5. 重启服务

### 方式二：手动部署

如果只需更新前端：

```bash
# 1. 本地构建
cd apps/gallery-admin && npm run build && cd ../..
cd apps/gallery-viewer && npm run build && cd ../..

# 2. 传输到服务器
scp -r apps/gallery-admin/dist/* ubuntu@43.130.250.22:/home/ubuntu/vie-gallery/admin/
scp -r apps/gallery-viewer/dist/* ubuntu@43.130.250.22:/home/ubuntu/vie-gallery/viewer/
scp infra/nginx-prod-ssl.conf ubuntu@43.130.250.22:/home/ubuntu/vie-gallery/infra/

# 3. SSH 到服务器更新 nginx 配置
ssh ubuntu@43.130.250.22
sudo cp /home/ubuntu/vie-gallery/infra/nginx-prod-ssl.conf /etc/nginx/sites-available/vie-gallery
sudo nginx -t  # 验证配置
sudo systemctl reload nginx  # 应用新配置
```

## 验证修复

### 1. 检查资源路径
```bash
# 管理端
curl -I https://gallery.vie-vibe.cn/app/assets/index-xxx.js
# 应返回 200 OK, Content-Type: application/javascript

# 展示端
curl -I https://gallery.vie-vibe.cn/g/assets/index-xxx.js
# 应返回 200 OK, Content-Type: application/javascript
```

### 2. 浏览器开发者工具
1. 打开 https://gallery.vie-vibe.cn/app/
2. 检查 Network 标签：
   - 所有 `/app/assets/*.js` 文件返回 200 状态码
   - Content-Type 为 `application/javascript` 或 `text/javascript`
   - 没有 404 或 MIME 类型错误

### 3. 功能测试
- 管理端登录页面正常显示
- 画廊展示页面 (/g/xxx) 正常加载
- 控制台无 JavaScript 错误

## 技术细节

### Nginx alias vs root

**alias**（我们使用的方式）：
```nginx
location /app/ {
    alias /home/ubuntu/vie-gallery/admin/;
}
# 请求 /app/assets/file.js → /home/ubuntu/vie-gallery/admin/assets/file.js
```

**root**（不适用于此场景）：
```nginx
location /app/ {
    root /home/ubuntu/vie-gallery;
}
# 请求 /app/assets/file.js → /home/ubuntu/vie-gallery/app/assets/file.js
```

### Vite base 选项

Vite 的 `base` 选项会：
1. 在所有资源路径前添加前缀（JS、CSS、图片等）
2. 配置 Vue Router 的 `createWebHistory()` 基路径（admin 已正确配置）
3. 调整 `import.meta.url` 等运行时路径

### SPA 路由支持

`try_files $uri $uri/ /app/index.html;` 确保：
- 物理文件存在时直接返回（如 `/app/assets/xxx.js`）
- 不存在时回退到 `index.html`，让 Vue Router 处理（如 `/app/galleries/123`）

## 相关文件

- ✅ `apps/gallery-admin/vite.config.ts` - Admin base 路径
- ✅ `apps/gallery-viewer/vite.config.ts` - Viewer base 路径
- ✅ `infra/nginx-prod-ssl.conf` - 生产环境 nginx 配置
- 📝 `deploy.sh` - 自动部署脚本（已包含所有必要步骤）

## 提交记录

```
commit 88dec87
fix: serve static files directly in nginx instead of proxying to dev servers
```

## 预防措施

为避免将来出现类似问题：

1. **环境分离**：开发环境使用 `npm run dev`，生产环境使用构建产物
2. **配置检查**：部署前验证 nginx 配置语法 `sudo nginx -t`
3. **构建验证**：检查 `dist/index.html` 中的资源路径是否正确
4. **监控告警**：为 4xx/5xx 错误设置监控

## 疑难排查

### 问题：部署后仍然 404
**检查：** nginx 配置是否已重新加载
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 问题：部署后看到旧版本
**检查：** 浏览器缓存或 CDN 缓存
```bash
# 硬刷新：Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac)
# 或清除浏览器缓存
```

### 问题：CSS 样式丢失
**检查：** CSS 文件路径是否正确
```bash
# 应该是 /app/assets/*.css，而不是 /assets/*.css
curl -I https://gallery.vie-vibe.cn/app/assets/index-xxx.css
```

---

**修复完成时间：** 2026-09-21  
**影响范围：** 生产环境前端资源加载  
**优先级：** P0 (阻止用户访问)
