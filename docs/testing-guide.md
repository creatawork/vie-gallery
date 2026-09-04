# VIE Gallery - MCP 测试指南

## 快速开始

### 方式一：交互式菜单（推荐）

```bash
bash quick-test.sh
```

这将打开一个交互式菜单，你可以：
- 启动所有服务
- 运行 API 测试
- 运行浏览器 MCP 测试
- 查看服务状态
- 停止所有服务

### 方式二：命令行

```bash
# 启动所有服务
bash quick-test.sh start

# 运行 API 测试
bash quick-test.sh test

# 运行浏览器测试指南
bash quick-test.sh test-browser

# 查看服务状态
bash quick-test.sh status

# 停止所有服务
bash quick-test.sh stop
```

## 测试脚本说明

### 1. `start-services.sh` - 启动后端服务

启动 Docker 容器中的所有后端服务：
- MySQL (端口 3306)
- Redis (端口 6379)
- MinIO (端口 9000, 9001)
- Spring Boot API (端口 8080)

```bash
bash start-services.sh
```

**验证服务启动：**
```bash
# 检查 Docker 容器
cd infra && docker-compose ps

# 测试 API 健康检查
curl http://localhost:8080/actuator/health

# 访问 MinIO 控制台
# http://localhost:9001
# 用户名: vie_local
# 密码: vie_local_secret
```

### 2. `start-frontend.sh` - 启动前端服务

启动两个前端应用：
- Admin UI (Vue.js) - http://localhost:5173
- Viewer UI (Three.js) - http://localhost:5174

```bash
bash start-frontend.sh
```

前端会在后台运行，日志保存在：
- Admin: `/tmp/vie-admin.log`
- Viewer: `/tmp/vie-viewer.log`

### 3. `test-mcp-flow.sh` - API 全流程测试

使用 curl 测试完整的 API 流程：

✅ 测试覆盖：
- 用户注册
- 用户登录（获取 SESSION）
- 创建照片空间
- 创建相册
- 上传照片
- 创建公开分享链接
- 创建密码保护分享链接
- 验证公开访问
- 用户登出

```bash
bash test-mcp-flow.sh
```

**输出示例：**
```
🧪 VIE Gallery - Full MCP Test Suite
====================================

📋 Step 0: Checking service availability...
Checking API Health... ✓
Checking Admin UI... ✓
Checking Viewer UI... ✓

📋 Step 1: User Registration
----------------------------
✓ Registration successful
  User ID: 1

📋 Step 2: User Login
---------------------
✓ Login successful
  Session cookie saved to /tmp/vie-gallery-session.txt
...
```

### 4. `test-browser-mcp.sh` - 浏览器 MCP 测试指南

准备浏览器自动化测试所需的测试数据和步骤指南。

```bash
bash test-browser-mcp.sh
```

这会：
1. 生成测试用的图片文件
2. 创建测试数据 JSON
3. 显示详细的手动测试步骤

**测试步骤：**
```
1️⃣ Registration & Login
2️⃣ Create Photo Space
3️⃣ Create Album
4️⃣ Upload Photo
5️⃣ Create Share Link
6️⃣ Verify Public Access
7️⃣ Test Password-Protected Share
```

### 5. `quick-test.sh` - 一站式测试脚本

集成所有功能的总控脚本，提供交互式菜单或命令行模式。

```bash
# 交互式
bash quick-test.sh

# 命令行
bash quick-test.sh start   # 启动所有服务
bash quick-test.sh test    # 运行 API 测试
bash quick-test.sh stop    # 停止所有服务
```

## 测试前准备

### 系统要求

- Docker & Docker Compose
- Node.js 18+
- Java 17+
- curl
- (可选) ImageMagick - 用于生成测试图片

### 安装依赖

```bash
# 前端依赖
cd apps/gallery-admin && npm install
cd ../gallery-viewer && npm install

# 后端已构建好，在 apps/gallery-api/gallery-api-boot/target/
```

## 服务 URL 速查

| 服务 | URL | 用途 |
|------|-----|------|
| API | http://localhost:8080 | 后端 REST API |
| API Health | http://localhost:8080/actuator/health | 健康检查 |
| Admin UI | http://localhost:5173 | 管理端界面 |
| Viewer UI | http://localhost:5174 | 公开展示页 |
| MySQL | localhost:3306 | 数据库 |
| Redis | localhost:6379 | Session 存储 |
| MinIO | http://localhost:9000 | 对象存储 API |
| MinIO Console | http://localhost:9001 | MinIO 管理界面 |

## 测试数据

### 默认用户

测试脚本会自动创建临时用户：
- Email: `test-{timestamp}@example.com`
- Password: `Test123456`

### 数据库连接

```bash
docker exec -it vie-gallery-mysql-1 mysql -uvie -pvie_local vie_gallery
```

常用查询：
```sql
-- 查看所有用户
SELECT id, username, email, created_at FROM users;

-- 查看照片空间
SELECT id, name, slug, user_id FROM spaces;

-- 查看相册
SELECT id, name, space_id FROM albums;

-- 查看照片
SELECT id, filename, album_id, storage_key FROM photos;

-- 查看分享链接
SELECT id, slug, access_type, space_id FROM shares;
```

### Redis 连接

```bash
docker exec -it vie-gallery-redis-1 redis-cli

# 查看所有 session keys
KEYS vie:session:v2:*

# 查看 session 详情
GET vie:session:v2:{session_id}
```

### MinIO 控制台

访问 http://localhost:9001
- 用户名: `vie_local`
- 密码: `vie_local_secret`

查看 bucket: `vie-gallery`
- `photos/` - 原图
- `thumbnails/` - 缩略图

## 故障排查

### 服务无法启动

```bash
# 查看 Docker 日志
cd infra
docker-compose logs -f

# 单独查看某个服务
docker-compose logs -f mysql
docker-compose logs -f gallery-api

# 重启所有服务
docker-compose restart
```

### API 返回 500 错误

1. 检查数据库连接：
```bash
docker exec vie-gallery-mysql-1 mysqladmin ping -h localhost -uroot -proot_local
```

2. 查看 API 日志：
```bash
docker-compose -f infra/docker-compose.yml logs gallery-api
```

3. 检查 Redis：
```bash
docker exec vie-gallery-redis-1 redis-cli ping
```

### 前端无法访问 API

1. 检查 CORS 配置
2. 检查前端环境变量中的 API URL
3. 查看浏览器控制台网络请求

### 照片上传失败

1. 检查 MinIO 服务：
```bash
curl http://localhost:9000/minio/health/live
```

2. 检查 MinIO bucket 是否存在：
   - 访问 http://localhost:9001
   - 查看 `vie-gallery` bucket

3. 检查文件大小限制（默认 100MB）

## 清理测试数据

```bash
# 停止并删除所有容器和数据卷
cd infra
docker-compose down -v

# 清理测试文件
rm /tmp/vie-gallery-*.txt
rm /tmp/vie-gallery-*.jpg
rm /tmp/vie-*.log
rm /tmp/vie-*.pid

# 重新启动干净环境
docker-compose up -d
```

## 进阶：使用浏览器 MCP

如果你有浏览器 MCP 服务，可以实现完全自动化的 E2E 测试：

```javascript
// 伪代码示例
async function testVieGallery() {
  // 1. 打开管理端
  await browser.navigate('http://localhost:5173');
  
  // 2. 注册用户
  await browser.click('text=注册');
  await browser.fill('input[name="email"]', 'test@example.com');
  await browser.fill('input[name="password"]', 'Test123456');
  await browser.click('button[type="submit"]');
  
  // 3. 创建空间
  await browser.click('text=创建空间');
  await browser.fill('input[name="name"]', '测试空间');
  await browser.click('button:has-text("提交")');
  
  // 4. 上传照片
  await browser.click('text=上传照片');
  await browser.setInputFiles('input[type="file"]', '/tmp/test-photo.jpg');
  await browser.waitForSelector('.photo-item');
  
  // 5. 创建分享链接
  await browser.click('text=分享');
  const shareUrl = await browser.textContent('.share-url');
  
  // 6. 验证公开访问
  await browser.navigate(shareUrl);
  await browser.waitForSelector('.gallery-viewer');
}
```

## 持续集成

在 CI/CD 中运行测试：

```yaml
# .github/workflows/test.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Start services
        run: bash start-services.sh
        
      - name: Wait for services
        run: sleep 30
        
      - name: Run API tests
        run: bash test-mcp-flow.sh
        
      - name: Stop services
        run: cd infra && docker-compose down
```

## 相关文档

- [完整测试指南](docs/mcp-test-guide.md) - 详细的 API 测试文档
- [项目 README](README.md) - 项目整体说明
- [重构计划](docs/reconstruction-plan.md) - 架构设计文档
