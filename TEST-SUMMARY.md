# VIE Gallery - MCP 测试总结

## 📦 已准备的测试资源

我已经为你的项目创建了完整的 MCP 测试框架，包括：

### ✅ 启动脚本
- `start-services.sh` - Docker 后端服务启动
- `start-frontend.sh` - Vue 和 Viewer 前端启动
- `quick-test.sh` - 一站式交互式测试控制台

### ✅ 测试脚本
- `test-mcp-flow.sh` - 完整 API 自动化测试（13 个步骤）
- `test-browser-mcp.sh` - 浏览器 MCP 测试准备和指南

### ✅ 文档
- `docs/testing-guide.md` - 完整测试使用指南
- `docs/mcp-test-guide.md` - 详细 API 测试文档
- `TESTING-HOST.md` - 主机端执行指南（⭐推荐阅读）

---

## 🚀 立即开始测试（在你的 Windows 主机上执行）

### 第一步：启动所有服务

打开 PowerShell 或 Git Bash：

```bash
cd E:\workspace\vie-gallery\infra
docker-compose up -d
```

等待约 60 秒，然后验证：

```bash
docker-compose ps
```

### 第二步：启动前端

打开两个新终端：

**终端 1：**
```bash
cd E:\workspace\vie-gallery\apps\gallery-admin
npm install
npm run dev
```

**终端 2：**
```bash
cd E:\workspace\vie-gallery\apps\gallery-viewer
npm install
npm run dev
```

### 第三步：运行自动化测试

打开新终端：

```bash
cd E:\workspace\vie-gallery
bash test-mcp-flow.sh
```

这将自动测试完整流程并显示结果。

---

## 🎯 测试覆盖范围

### 后端 API 测试 ✅
1. ✓ 用户注册（POST /api/auth/register）
2. ✓ 用户登录（POST /api/auth/login）
3. ✓ 获取当前用户（GET /api/auth/me）
4. ✓ 创建照片空间（POST /api/spaces）
5. ✓ 列出我的空间（GET /api/spaces）
6. ✓ 创建相册（POST /api/spaces/{id}/albums）
7. ✓ 上传照片（POST /api/spaces/{id}/albums/{id}/photos）
8. ✓ 列出照片（GET /api/spaces/{id}/albums/{id}/photos）
9. ✓ 创建公开分享（POST /api/spaces/{id}/shares）
10. ✓ 公开访问空间（GET /api/public/g/{slug}）
11. ✓ 创建密码分享（POST /api/spaces/{id}/shares）
12. ✓ 验证分享密码（POST /api/public/g/{slug}/verify）
13. ✓ 用户登出（POST /api/auth/logout）

### 前端功能测试（手动）
- 注册/登录界面
- 空间管理界面
- 相册管理界面
- 照片上传和展示
- 分享链接生成
- 公开展示页（3D 照片墙）

### 存储和数据验证
- MinIO 对象存储
- MySQL 数据持久化
- Redis Session 管理
- 租户数据隔离

---

## 📊 服务端口一览

| 服务 | 地址 | 说明 |
|------|------|------|
| API | http://localhost:8080 | Spring Boot 后端 |
| Admin UI | http://localhost:5173 | Vue 管理端 |
| Viewer | http://localhost:5174 | 公开展示页 |
| MySQL | localhost:3306 | 数据库 |
| Redis | localhost:6379 | Session 存储 |
| MinIO | http://localhost:9000 | 对象存储 API |
| MinIO Console | http://localhost:9001 | 控制台（vie_local/vie_local_secret）|

---

## 🔍 快速验证命令

### 检查所有服务是否运行

```bash
# 检查 Docker 容器
cd E:\workspace\vie-gallery\infra
docker-compose ps

# 测试 API
curl http://localhost:8080/actuator/health

# 测试 Admin UI
curl http://localhost:5173

# 测试 Viewer
curl http://localhost:5174
```

### 查看数据库数据

```bash
docker exec -it vie-gallery-mysql-1 mysql -uvie -pvie_local vie_gallery -e "
SELECT 'Users' as Table_Name, COUNT(*) as Count FROM users
UNION ALL
SELECT 'Spaces', COUNT(*) FROM spaces
UNION ALL
SELECT 'Albums', COUNT(*) FROM albums
UNION ALL
SELECT 'Photos', COUNT(*) FROM photos
UNION ALL
SELECT 'Shares', COUNT(*) FROM shares;
"
```

### 查看 Redis Session

```bash
docker exec -it vie-gallery-redis-1 redis-cli KEYS "vie:session:*"
```

### 查看 MinIO 存储

访问 http://localhost:9001
- Username: vie_local
- Password: vie_local_secret
- 查看 bucket: vie-gallery

---

## 🧪 使用浏览器 MCP 测试

如果你的环境有浏览器 MCP 服务，可以执行：

```bash
cd E:\workspace\vie-gallery
bash test-browser-mcp.sh
```

这会生成测试数据和详细的浏览器测试步骤指南。

---

## 💡 推荐的测试顺序

1. **启动服务** → 使用 `docker-compose up -d`
2. **验证健康** → 检查所有服务端口可访问
3. **运行 API 测试** → 执行 `bash test-mcp-flow.sh`
4. **手动验证 UI** → 在浏览器中打开 http://localhost:5173
5. **测试完整流程** → 注册 → 创建空间 → 上传照片 → 生成分享
6. **验证公开访问** → 在隐私模式中打开分享链接
7. **检查存储** → 在 MinIO 控制台查看上传的文件

---

## ⚠️ 环境限制说明

由于 Claude 的 Linux 沙箱环境限制：
- ❌ 无法访问 Docker 命令
- ❌ 无法直接启动服务
- ❌ 无法运行需要 Docker 的测试脚本

**解决方案：**
所有测试脚本已经创建在你的项目目录中，请在你的 Windows 主机上执行这些脚本。

---

## 📋 测试检查清单

执行测试后，确认以下功能：

### 基础功能
- [ ] 用户可以注册新账号
- [ ] 用户可以登录
- [ ] Session 在刷新页面后保持
- [ ] 用户可以登出

### 空间和相册
- [ ] 创建照片空间
- [ ] 列出我的空间
- [ ] 创建相册
- [ ] 编辑相册信息

### 照片管理
- [ ] 单张照片上传成功
- [ ] 批量照片上传成功
- [ ] 缩略图自动生成
- [ ] 照片列表正确显示
- [ ] 设置相册封面
- [ ] 删除照片

### 分享功能
- [ ] 创建公开分享链接
- [ ] 公开链接无需登录可访问
- [ ] 创建密码保护分享
- [ ] 密码验证正确工作
- [ ] 撤销分享链接
- [ ] 分享链接过期机制

### 存储和数据
- [ ] 照片正确存储到 MinIO
- [ ] 缩略图存储到 MinIO
- [ ] 数据正确写入 MySQL
- [ ] Redis Session 正常工作
- [ ] 不同用户数据隔离

### 前端展示
- [ ] 管理端界面正常渲染
- [ ] 公开展示页正常加载
- [ ] 3D 照片墙效果正常
- [ ] 响应式布局正常

---

## 📖 详细文档

- **[TESTING-HOST.md](TESTING-HOST.md)** - 主机端详细执行步骤
- **[docs/testing-guide.md](docs/testing-guide.md)** - 完整测试指南
- **[docs/mcp-test-guide.md](docs/mcp-test-guide.md)** - API 测试文档

---

## 🛠️ 下一步

1. 在你的 Windows 主机上打开终端
2. 阅读 `TESTING-HOST.md` 获取详细步骤
3. 执行 Docker 启动命令
4. 运行 `test-mcp-flow.sh` 查看自动化测试结果
5. 在浏览器中手动验证所有功能

如有任何问题，查看文档中的"故障排查"章节。

---

**祝测试顺利！** 🎉
