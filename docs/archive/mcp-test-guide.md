# VIE Gallery - 全流程测试指南

## 前置准备

### 1. 启动所有服务

```bash
# 1. 启动后端服务（Docker）
bash start-services.sh

# 2. 启动前端服务
bash start-frontend.sh
```

### 2. 验证服务状态

- 后端 API: http://localhost:8080/actuator/health
- 管理端: http://localhost:5173
- 展示页: http://localhost:5174
- MinIO 控制台: http://localhost:9001

## 测试流程

### 第一阶段：用户注册与登录

#### 1. 用户注册
```http
POST http://localhost:8080/api/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123456",
  "username": "testuser"
}
```

**预期结果**: 
- 返回 200 状态码
- 响应包含用户信息
- 自动创建 SESSION cookie

#### 2. 用户登录
```http
POST http://localhost:8080/api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123456"
}
```

**预期结果**:
- 返回 200 状态码
- 设置 VIE_SESSION cookie
- 响应包含用户基本信息

#### 3. 获取当前用户信息
```http
GET http://localhost:8080/api/auth/me
Cookie: VIE_SESSION={从登录响应获取}
```

**预期结果**:
- 返回当前登录用户详情

---

### 第二阶段：照片空间管理

#### 4. 创建照片空间
```http
POST http://localhost:8080/api/spaces
Content-Type: application/json
Cookie: VIE_SESSION={session_cookie}

{
  "name": "我的旅行相册",
  "description": "2024年旅行照片集"
}
```

**预期结果**:
- 返回 201 状态码
- 响应包含新创建的空间 ID 和 slug
- 记录 `spaceId` 用于后续测试

#### 5. 获取我的空间列表
```http
GET http://localhost:8080/api/spaces
Cookie: VIE_SESSION={session_cookie}
```

**预期结果**:
- 返回刚创建的空间列表

---

### 第三阶段：相册管理

#### 6. 创建相册
```http
POST http://localhost:8080/api/spaces/{spaceId}/albums
Content-Type: application/json
Cookie: VIE_SESSION={session_cookie}

{
  "name": "巴黎之旅",
  "description": "巴黎的美好回忆"
}
```

**预期结果**:
- 返回 201 状态码
- 响应包含相册 ID
- 记录 `albumId`

#### 7. 获取空间下的相册列表
```http
GET http://localhost:8080/api/spaces/{spaceId}/albums
Cookie: VIE_SESSION={session_cookie}
```

---

### 第四阶段：照片上传

#### 8. 单张照片上传
```http
POST http://localhost:8080/api/spaces/{spaceId}/albums/{albumId}/photos
Content-Type: multipart/form-data
Cookie: VIE_SESSION={session_cookie}

file: [选择一张图片文件]
```

**预期结果**:
- 返回 201 状态码
- 响应包含照片 ID、原始 URL、缩略图 URL
- 记录 `photoId`

#### 9. 批量上传照片
```http
POST http://localhost:8080/api/spaces/{spaceId}/albums/{albumId}/photos/batch
Content-Type: multipart/form-data
Cookie: VIE_SESSION={session_cookie}

files: [选择多张图片]
```

**预期结果**:
- 返回批量上传结果
- 每张照片都有对应的状态

#### 10. 获取相册照片列表
```http
GET http://localhost:8080/api/spaces/{spaceId}/albums/{albumId}/photos
Cookie: VIE_SESSION={session_cookie}
```

**预期结果**:
- 返回相册中所有照片
- 包含缩略图和原图 URL

---

### 第五阶段：分享链接管理

#### 11. 创建公开分享链接
```http
POST http://localhost:8080/api/spaces/{spaceId}/shares
Content-Type: application/json
Cookie: VIE_SESSION={session_cookie}

{
  "accessType": "PUBLIC",
  "expiresAt": null
}
```

**预期结果**:
- 返回 201 状态码
- 响应包含分享 slug 和完整 URL
- 记录 `shareSlug`

#### 12. 创建密码保护的分享链接
```http
POST http://localhost:8080/api/spaces/{spaceId}/shares
Content-Type: application/json
Cookie: VIE_SESSION={session_cookie}

{
  "accessType": "PASSWORD",
  "password": "secret123"
}
```

#### 13. 获取我的分享链接列表
```http
GET http://localhost:8080/api/spaces/{spaceId}/shares
Cookie: VIE_SESSION={session_cookie}
```

---

### 第六阶段：公开访问测试

#### 14. 通过分享链接访问空间（无需登录）
```http
GET http://localhost:8080/api/public/g/{shareSlug}
```

**预期结果**:
- 返回空间基本信息
- 包含相册列表

#### 15. 获取公开相册照片（无需登录）
```http
GET http://localhost:8080/api/public/g/{shareSlug}/albums/{albumId}/photos
```

**预期结果**:
- 返回照片列表
- 可以直接访问图片 URL

#### 16. 访问密码保护的分享链接
```http
POST http://localhost:8080/api/public/g/{shareSlug}/verify
Content-Type: application/json

{
  "password": "secret123"
}
```

**预期结果**:
- 密码正确：返回访问令牌
- 密码错误：返回 401

---

### 第七阶段：照片管理操作

#### 17. 设置相册封面
```http
PUT http://localhost:8080/api/spaces/{spaceId}/albums/{albumId}/cover
Content-Type: application/json
Cookie: VIE_SESSION={session_cookie}

{
  "photoId": {photoId}
}
```

#### 18. 删除照片
```http
DELETE http://localhost:8080/api/spaces/{spaceId}/albums/{albumId}/photos/{photoId}
Cookie: VIE_SESSION={session_cookie}
```

**预期结果**:
- 返回 204 状态码
- 照片从列表中消失

#### 19. 撤销分享链接
```http
DELETE http://localhost:8080/api/spaces/{spaceId}/shares/{shareId}
Cookie: VIE_SESSION={session_cookie}
```

---

### 第八阶段：退出登录

#### 20. 用户登出
```http
POST http://localhost:8080/api/auth/logout
Cookie: VIE_SESSION={session_cookie}
```

**预期结果**:
- 返回 200 状态码
- SESSION cookie 失效

---

## MCP 浏览器自动化测试

### 使用浏览器 MCP 执行 E2E 测试

```javascript
// 1. 打开管理端并注册
browser.navigate('http://localhost:5173')
browser.fillForm({ email: 'test@example.com', password: 'Test123456' })
browser.click('button[type="submit"]')

// 2. 创建空间
browser.click('创建空间')
browser.fillForm({ name: '测试空间', description: '这是测试' })
browser.click('提交')

// 3. 上传照片
browser.click('上传照片')
browser.uploadFile('input[type="file"]', '/path/to/image.jpg')
browser.waitFor('.upload-success')

// 4. 创建分享链接
browser.click('创建分享')
browser.click('生成链接')
const shareUrl = browser.getText('.share-url')

// 5. 在新标签页验证公开访问
browser.navigate(shareUrl)
browser.assertVisible('.photo-gallery')
```

---

## 验证清单

### ✅ 后端功能
- [ ] 用户注册成功
- [ ] 用户登录返回 SESSION
- [ ] 创建照片空间
- [ ] 创建相册
- [ ] 单张照片上传
- [ ] 批量照片上传
- [ ] 缩略图自动生成
- [ ] 创建公开分享链接
- [ ] 创建密码分享链接
- [ ] 公开访问空间（无需登录）
- [ ] 密码验证机制
- [ ] 设置相册封面
- [ ] 删除照片
- [ ] 撤销分享链接
- [ ] 用户登出

### ✅ 前端功能
- [ ] 管理端注册/登录界面
- [ ] 空间列表展示
- [ ] 相册列表展示
- [ ] 照片上传界面
- [ ] 照片墙展示
- [ ] 分享链接生成
- [ ] 公开展示页 (viewer) 可访问
- [ ] 3D 照片墙正常渲染

### ✅ 存储与数据
- [ ] 照片文件存储到 MinIO
- [ ] 缩略图存储到 MinIO
- [ ] 数据库正确记录照片元数据
- [ ] Redis SESSION 正常工作
- [ ] 租户隔离生效

---

## 问题排查

### 常见问题

1. **数据库连接失败**
   - 检查 MySQL 容器状态: `docker ps`
   - 查看日志: `docker logs vie-gallery-mysql-1`

2. **Redis 连接失败**
   - 检查 Redis 容器: `docker ps | grep redis`
   - 测试连接: `redis-cli ping`

3. **MinIO 无法访问**
   - 访问控制台: http://localhost:9001
   - 用户名: `vie_local` / 密码: `vie_local_secret`
   - 检查 bucket 是否创建

4. **前端无法连接后端**
   - 检查 CORS 配置
   - 查看浏览器开发者工具网络请求

5. **照片上传失败**
   - 检查文件大小限制（默认 100MB）
   - 查看后端日志确认错误信息
