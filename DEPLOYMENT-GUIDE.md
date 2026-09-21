# 部署指南：修复线上 404 错误

## 问题诊断

### 错误现象
```
Failed to load resource: the server responded with a status of 404 ()
/assets/index-CilHDSAr.js:1 Failed to load module script: 
Expected a JavaScript-or-Wasm module script but the server responded 
with a MIME type of "text/html".
```

### 根本原因

**路径不匹配问题：**

1. **主 nginx** 配置代理：`/app/` → `http://localhost:5173/app/`
2. **容器 nginx** 配置简单 SPA：处理根路径 `/`，没有 `/app/` 前缀
3. **构建产物**（旧版本）：引用绝对路径 `/assets/...`

**请求流程失败：**
```
浏览器请求: /app/assets/index-xxx.js
    ↓
主 nginx 代理: http://localhost:5173/app/assets/index-xxx.js
    ↓
容器 nginx: 找不到 /app/assets/...（它只服务于根路径 /）
    ↓
返回 404 HTML 错误页
```

## 已修复内容

### 1. 配置 Vite Base 路径 ✅

**apps/gallery-admin/vite.config.ts**
```typescript
export default defineConfig({
  base: '/app/',  // 添加此行
  plugins: [vue()],
  // ...
})
```

**apps/gallery-viewer/vite.config.ts**
```typescript
export default defineConfig({
  base: '/g/',  // 添加此行
  plugins: [vue()],
  // ...
})
```

### 2. 简化主 Nginx 配置 ✅

**infra/nginx-prod-ssl.conf**

移除了复杂的代理规则，改用简单的 `alias` 直接服务静态文件：

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

**优势：**
- 不再依赖容器 nginx（5173/5174 端口）
- 直接从磁盘提供文件，更快
- 减少了 49 行冗余配置
- `alias` 自动处理所有子目录（assets、covers、presets 等）

## 部署步骤

### 完整部署（推荐）

```bash
# 在本地项目目录执行
./deploy.sh
```

这将自动：
1. ✅ 构建前端（带正确的 `/app/` 和 `/g/` 前缀）
2. ✅ 打包后端
3. ✅ 传输所有文件到服务器
4. ✅ 更新 nginx 配置
5. ✅ 重启服务

### 仅更新前端（快速修复）

如果后端无变化，只需更新前端：

```bash
# 1. 本地构建
cd apps/gallery-admin && npm run build && cd ../..
cd apps/gallery-viewer && npm run build && cd ../..

# 2. 传输到服务器
scp -r apps/gallery-admin/dist/* ubuntu@43.130.250.22:/home/ubuntu/vie-gallery/admin/
scp -r apps/gallery-viewer/dist/* ubuntu@43.130.250.22:/home/ubuntu/vie-gallery/viewer/
scp infra/nginx-prod-ssl.conf ubuntu@43.130.250.22:/home/ubuntu/vie-gallery/infra/

# 3. SSH 到服务器更新 nginx
ssh ubuntu@43.130.250.22
sudo cp /home/ubuntu/vie-gallery/infra/nginx-prod-ssl.conf /etc/nginx/sites-available/vie-gallery
sudo nginx -t && sudo systemctl reload nginx
exit
```

## 验证部署

### 1. 检查构建产物路径

**本地验证（部署前）：**
```bash
# Admin index.html 应该包含 /app/ 前缀
grep -o '/app/assets/[^"]*' apps/gallery-admin/dist/index.html

# Viewer index.html 应该包含 /g/ 前缀
grep -o '/g/assets/[^"]*' apps/gallery-viewer/dist/index.html
```

预期输出：
```
/app/assets/index-xxx.js
/app/assets/index-xxx.css
/g/assets/index-xxx.js
/g/assets/index-xxx.css
```

### 2. 检查服务器文件

```bash
ssh ubuntu@43.130.250.22 "cat /home/ubuntu/vie-gallery/admin/index.html | grep -o '/app/assets/[^\"]*'"
ssh ubuntu@43.130.250.22 "cat /home/ubuntu/vie-gallery/viewer/index.html | grep -o '/g/assets/[^\"]*'"
```

### 3. 测试 HTTP 访问

```bash
# 测试管理端资源
curl -I https://gallery.vie-vibe.cn/app/assets/index-xxx.js
# 应返回: HTTP/2 200, content-type: application/javascript

# 测试展示端资源
curl -I https://gallery.vie-vibe.cn/g/assets/index-xxx.js
# 应返回: HTTP/2 200, content-type: application/javascript
```

### 4. 浏览器测试

1. 打开 https://gallery.vie-vibe.cn/app/
2. 打开开发者工具（F12）→ Network 标签
3. 刷新页面（Ctrl+Shift+R 清除缓存）
4. 检查：
   - ✅ 所有 `/app/assets/*.js` 文件返回 200
   - ✅ Content-Type 为 `application/javascript` 或 `text/javascript`
   - ✅ 没有 404 错误
   - ✅ 没有 MIME 类型错误

## 架构说明

### 生产环境架构

```
用户浏览器
    ↓ HTTPS
主 Nginx (443端口)
    ├─ /api/*           → localhost:8088 (API 容器)
    ├─ /app/*           → /home/ubuntu/vie-gallery/admin/ (静态文件)
    └─ /g/*             → /home/ubuntu/vie-gallery/viewer/ (静态文件)

Docker Compose:
    ├─ vie-gallery-api      (8088:8080)  - Spring Boot API
    ├─ vie-gallery-admin    (5173:80)    - Nginx 容器 [不再使用]
    ├─ vie-gallery-viewer   (5174:80)    - Nginx 容器 [不再使用]
    ├─ vie-gallery-mysql    (3306:3306)
    ├─ vie-gallery-redis    (6379:6379)
    └─ vie-gallery-minio    (9000-9001)
```

**注意：** admin 和 viewer 容器现在不再被主 nginx 使用，可以考虑在未来清理。

### 为什么使用 alias 而不是 proxy？

**之前的方式（proxy）：**
```nginx
location /app/ {
    proxy_pass http://localhost:5173/app/;  # 依赖容器 nginx
}
```
- ❌ 需要容器 nginx 正确处理 `/app/` 前缀
- ❌ 增加了一层代理，性能损失
- ❌ 容器配置和路径耦合
- ❌ 调试困难

**现在的方式（alias）：**
```nginx
location /app/ {
    alias /home/ubuntu/vie-gallery/admin/;  # 直接提供文件
    try_files $uri $uri/ /app/index.html;
}
```
- ✅ 直接从磁盘提供文件，性能更好
- ✅ 不依赖容器 nginx
- ✅ 配置简单清晰
- ✅ 自动处理所有子目录

## 配置变更的影响

### 预览是否实时？

**回答：是的，部署后预览是实时的。**

这里的"静态文件"是指：
- 前端已经构建打包好的 HTML/JS/CSS
- 不是 Vite 开发服务器的热更新

**实时性来自何处：**
1. **配置更新**：通过 API 调用实时保存到数据库
2. **预览刷新**：浏览器重新请求数据，API 返回最新配置
3. **前端代码**：已经构建好，包含所有预览逻辑

**不需要实时更新的部分：**
- 前端代码本身（功能、组件、样式）
- 这些只在重新部署时更新

## 回滚计划

如果部署后出现问题：

```bash
# 1. SSH 到服务器
ssh ubuntu@43.130.250.22

# 2. 恢复到备份（如果有）
cp -r /home/ubuntu/vie-gallery/admin.backup.20260921_113712/* /home/ubuntu/vie-gallery/admin/

# 3. 恢复旧的 nginx 配置
# (如果保存了旧配置的话)

# 4. 重新加载 nginx
sudo nginx -t && sudo systemctl reload nginx
```

## 相关文件

- ✅ [apps/gallery-admin/vite.config.ts](../apps/gallery-admin/vite.config.ts) - Admin base 路径
- ✅ [apps/gallery-viewer/vite.config.ts](../apps/gallery-viewer/vite.config.ts) - Viewer base 路径
- ✅ [infra/nginx-prod-ssl.conf](../infra/nginx-prod-ssl.conf) - 生产 nginx 配置
- 📝 [deploy.sh](../deploy.sh) - 自动部署脚本
- 📦 [infra/docker-compose.production.yml](../infra/docker-compose.production.yml) - Docker 编排

## Git 提交记录

```
commit c4a84c2
Reapply "fix: serve static files directly in nginx instead of proxying to dev servers"

commit 88dec87 (原始修复)
fix: serve static files directly in nginx instead of proxying to dev servers
```

## 常见问题

### Q: 部署后为什么还是看到旧版本？

**A: 浏览器缓存。** 使用硬刷新：
- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

### Q: 404 错误仍然存在怎么办？

**A: 检查部署步骤：**
1. 本地构建是否成功？检查 `dist/index.html` 是否包含 `/app/` 前缀
2. 文件是否正确传输？`ls -la /home/ubuntu/vie-gallery/admin/assets/`
3. Nginx 配置是否更新？`sudo nginx -t`
4. Nginx 是否重新加载？`sudo systemctl reload nginx`

### Q: 容器 nginx (5173/5174) 还需要吗？

**A: 不再需要。** 主 nginx 直接提供文件。可以考虑：
- 保留容器但不使用（当前状态）
- 未来清理 docker-compose 中的 admin/viewer 服务

### Q: 这会影响开发环境吗？

**A: 不会。** 开发环境仍然使用 `npm run dev`：
- 本地开发：`localhost:5173` 和 `localhost:5174`
- Vite 开发服务器会自动处理 `base` 路径
- 热更新正常工作

---

**修复时间：** 2026-09-21  
**优先级：** P0 (阻止用户访问)  
**影响范围：** 生产环境前端资源加载
