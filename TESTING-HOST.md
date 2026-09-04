#!/bin/bash
# VIE Gallery - 主机端执行指南
# 由于 Linux 沙箱环境无 Docker 访问权限，请在主机 Windows 上执行

echo "=================================="
echo "VIE Gallery - 主机端测试执行指南"
echo "=================================="
echo ""
echo "⚠️  注意：以下命令需要在你的 Windows 主机上执行"
echo ""

cat << 'EOF'

## 步骤 1：启动 Docker 服务

打开 PowerShell 或 Git Bash，执行：

```bash
cd E:\workspace\vie-gallery\infra
docker-compose up -d
```

等待所有服务启动（约 30-60 秒），然后验证：

```bash
docker-compose ps
```

应该看到 4 个服务都是 "Up" 状态：
- vie-gallery-mysql-1
- vie-gallery-redis-1  
- vie-gallery-minio-1
- vie-gallery-gallery-api-1

---

## 步骤 2：验证服务健康

```bash
# 测试 API 健康检查
curl http://localhost:8080/actuator/health

# 应该返回：{"status":"UP"}

# 测试 MySQL
docker exec vie-gallery-mysql-1 mysqladmin ping -h localhost -uroot -proot_local

# 测试 Redis
docker exec vie-gallery-redis-1 redis-cli ping

# 测试 MinIO
curl http://localhost:9000/minio/health/live
```

---

## 步骤 3：启动前端服务

打开两个新的终端窗口：

**终端 1 - Admin UI:**
```bash
cd E:\workspace\vie-gallery\apps\gallery-admin
npm install
npm run dev
```

**终端 2 - Viewer UI:**
```bash
cd E:\workspace\vie-gallery\apps\gallery-viewer
npm install
npm run dev
```

等待前端启动完成，你应该看到：
- Admin UI: http://localhost:5173
- Viewer UI: http://localhost:5174

---

## 步骤 4：运行 API 自动化测试

打开新终端，执行：

```bash
cd E:\workspace\vie-gallery
bash test-mcp-flow.sh
```

这个脚本会自动测试：
✓ 用户注册
✓ 用户登录
✓ 创建照片空间
✓ 创建相册
✓ 上传照片
✓ 创建分享链接
✓ 公开访问验证
✓ 密码保护验证

---

## 步骤 5：浏览器手动测试

### 5.1 注册并登录
1. 打开浏览器访问: http://localhost:5173
2. 点击注册，填写：
   - Email: yourtest@example.com
   - Password: Test123456
   - Username: testuser
3. 提交并自动登录

### 5.2 创建照片空间
1. 在管理端点击"创建空间"
2. 填写名称和描述
3. 提交并查看空间列表

### 5.3 创建相册
1. 点击进入刚创建的空间
2. 点击"创建相册"
3. 填写相册信息
4. 提交

### 5.4 上传照片
1. 点击进入相册
2. 点击"上传照片"
3. 选择图片文件（支持 JPG, PNG）
4. 等待上传完成
5. 查看照片列表和缩略图

### 5.5 创建分享链接
1. 在空间详情页点击"分享"
2. 选择访问类型：
   - PUBLIC（公开访问）
   - PASSWORD（密码保护）
   - PRIVATE（私密访问）
3. 生成分享链接
4. 复制链接

### 5.6 验证公开访问
1. 打开浏览器隐私/无痕模式
2. 访问分享链接
3. 应该看到照片展示页（无需登录）
4. 验证 3D 照片墙效果

---

## 步骤 6：使用 MinIO 控制台验证存储

1. 访问: http://localhost:9001
2. 登录信息：
   - Username: vie_local
   - Password: vie_local_secret
3. 查看 `vie-gallery` bucket
4. 验证照片和缩略图已上传：
   - `photos/` 目录 - 原图
   - `thumbnails/` 目录 - 缩略图

---

## 步骤 7：查看数据库数据

```bash
docker exec -it vie-gallery-mysql-1 mysql -uvie -pvie_local vie_gallery
```

执行查询：

```sql
-- 查看所有用户
SELECT id, username, email, created_at FROM users;

-- 查看照片空间
SELECT id, name, slug, user_id, created_at FROM spaces;

-- 查看相册
SELECT id, name, space_id, created_at FROM albums;

-- 查看照片
SELECT id, filename, album_id, storage_key, created_at FROM photos;

-- 查看分享链接
SELECT id, slug, access_type, space_id, expires_at FROM shares;
```

---

## 步骤 8：测试 API 端点（可选）

使用 curl 或 Postman 测试：

### 注册用户
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"api-test@example.com","password":"Test123456","username":"apitest"}'
```

### 登录
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"api-test@example.com","password":"Test123456"}'
```

### 创建空间
```bash
curl -X POST http://localhost:8080/api/spaces \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"API测试空间","description":"通过API创建"}'
```

### 上传照片
```bash
curl -X POST http://localhost:8080/api/spaces/{spaceId}/albums/{albumId}/photos \
  -b cookies.txt \
  -F "file=@/path/to/image.jpg"
```

---

## 故障排查

### Docker 服务启动失败

```bash
# 查看日志
cd E:\workspace\vie-gallery\infra
docker-compose logs

# 重启服务
docker-compose restart

# 完全重建
docker-compose down -v
docker-compose up -d
```

### API 连接失败

```bash
# 检查 API 日志
docker logs vie-gallery-gallery-api-1 -f

# 检查端口占用
netstat -ano | findstr :8080
```

### 前端无法连接后端

1. 检查前端配置中的 API URL
2. 查看浏览器开发者工具 Network 标签
3. 验证 CORS 配置

### 照片上传失败

1. 检查 MinIO 服务状态
2. 验证文件大小（默认限制 100MB）
3. 查看 API 日志中的错误信息

---

## 清理测试数据

```bash
cd E:\workspace\vie-gallery\infra

# 停止并删除所有容器和数据
docker-compose down -v

# 重新启动干净环境
docker-compose up -d
```

---

## 测试完成后

确认以下功能正常：
- [ ] 用户注册登录
- [ ] Session 持久化（刷新页面仍保持登录）
- [ ] 创建空间和相册
- [ ] 单张和批量上传照片
- [ ] 缩略图自动生成
- [ ] 创建公开分享链接
- [ ] 公开访问无需登录
- [ ] 密码保护分享
- [ ] 照片存储到 MinIO
- [ ] 3D 照片墙展示
- [ ] 租户数据隔离

---

## 参考文档

- 完整测试指南: docs/testing-guide.md
- API 测试文档: docs/mcp-test-guide.md
- 项目 README: README.md

EOF

echo ""
echo "✅ 测试指南已生成"
echo ""
echo "请按照上述步骤在 Windows 主机上执行测试"
