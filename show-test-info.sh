#!/bin/bash
# 生成测试报告的辅助脚本

cat << 'EOF'

╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           VIE Gallery - MCP 测试套件部署完成                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

✅ 测试框架已完整部署到：E:\workspace\vie-gallery\

═══════════════════════════════════════════════════════════════
📦 已创建的文件清单
═══════════════════════════════════════════════════════════════

✨ 启动脚本：
  • start-services.sh       - Docker 后端服务启动
  • start-frontend.sh       - 前端服务启动
  • quick-test.sh           - 一站式交互测试控制台

🧪 测试脚本：
  • test-mcp-flow.sh        - 当前 Gallery API 自动化冒烟测试
  • test-browser-mcp.sh     - 浏览器 MCP 测试指南

📖 文档：
  • docs/testing-guide.md   - 当前测试、启动和故障排查入口
  • README.md               - 项目概览和当前阶段
  • docs/archive/           - 历史实现记录和旧验收材料


═══════════════════════════════════════════════════════════════
🚀 立即开始测试
═══════════════════════════════════════════════════════════════

在 Windows PowerShell 或 Git Bash 中执行：

Step 1: 启动后端服务
─────────────────────────────────────────────────────────
cd E:\workspace\vie-gallery\infra
docker-compose up -d

⏱️ 等待 60 秒...

Step 2: 运行自动化测试
─────────────────────────────────────────────────────────
cd E:\workspace\vie-gallery
bash test-mcp-flow.sh

这将自动测试：
  ✓ 用户注册登录（含 CSRF）
  ✓ 创建并列出 Gallery
  ✓ 上传并列出照片（异步处理 API）
  ✓ 创建并列出分享链接
  ✓ 使用 X-Share-Token 验证私密 Gallery 访问
  ✓ 验证 PASSWORD Gallery 的 PASSWORD_REQUIRED 状态


═══════════════════════════════════════════════════════════════
📊 测试覆盖范围
═══════════════════════════════════════════════════════════════

API 端点（自动化测试）：
  1.  POST   /api/auth/register          - 用户注册
  2.  POST   /api/auth/login             - 用户登录
  3.  GET    /api/me                    - 获取当前用户
  4.  POST   /api/galleries              - 创建 Gallery
  5.  GET    /api/galleries              - 列出 Gallery
  6.  GET    /api/galleries/{id}         - 获取单个 Gallery
  7.  POST   /api/galleries/{id}/photos  - 上传照片（202，异步处理）
  8.  GET    /api/galleries/{id}/photos - 列出照片
  9.  POST   /api/galleries/{id}/share-links - 创建分享链接
  10. GET    /api/galleries/{id}/share-links - 列出分享链接
  11. GET    /api/public/g/{slug}        - 公开访问 Gallery
  12. POST   /api/public/g/{slug}/unlock - 密码 Gallery 解锁
  13. GET    /api/public/g/{slug}/photos - 公开照片分页
  14. POST   /api/auth/logout            - 用户登出

前端功能（手动测试）：
  • Admin 注册/登录界面
  • Gallery 总览和单 Gallery 工作区
  • 照片上传、处理状态和封面
  • 分享链接生成与 Token 访问
  • Viewer 公开状态和 3D 照片墙

数据和存储：
  • MySQL 数据持久化
  • Redis Session 管理
  • MinIO 对象存储
  • 租户数据隔离


═══════════════════════════════════════════════════════════════
🔗 服务地址（启动后可访问）
═══════════════════════════════════════════════════════════════

  API:             http://localhost:8088
  API Health:      http://localhost:8088/actuator/health
  Admin UI:        http://localhost:5173
  Viewer UI:       http://localhost:5174
  MinIO Console:   http://localhost:9001
    └─ 账号: vie_local / vie_local_secret


═══════════════════════════════════════════════════════════════
📋 推荐的完整测试流程
═══════════════════════════════════════════════════════════════

1. 启动 Docker 服务
   cd E:\workspace\vie-gallery\infra
   docker-compose up -d

2. 等待服务就绪（60 秒）

3. 验证服务健康
   curl http://localhost:8088/actuator/health

4. 运行 API 自动化测试
   cd E:\workspace\vie-gallery
   bash test-mcp-flow.sh

5. 查看测试结果
   - 检查每个步骤的 ✓ 或 ✗ 标记
   - 记录生成的分享链接

6. 启动前端进行手动验证（可选）
   bash start-frontend.sh

7. 在浏览器中测试
   - 打开 http://localhost:5173
   - 注册新用户
   - 创建空间和相册
   - 上传照片
   - 生成分享链接

8. 验证公开访问
   - 复制分享链接
   - 在隐私/无痕模式打开
   - 确认无需登录即可查看

9. 检查 MinIO 存储
   - 访问 http://localhost:9001
   - 查看 vie-gallery bucket
   - 确认照片和缩略图已上传

10. 查看数据库数据
    docker exec -it vie-gallery-mysql-1 mysql -uvie -pvie_local vie_gallery
    SELECT * FROM users;
    SELECT * FROM galleries;
    SELECT * FROM photos;


═══════════════════════════════════════════════════════════════
🎯 测试成功标准
═══════════════════════════════════════════════════════════════

自动化测试应该：
  ✓ 当前自动化 API 冒烟流程中的检查全部通过
  ✓ 生成有效的分享链接并通过 Token 访问私密 Gallery
  ✓ 公开访问返回正确的 Gallery 状态
  ✓ 密码 Gallery 返回 PASSWORD_REQUIRED；成功 /unlock 需先配置 Gallery 密码

手动测试应该：
  ✓ 能够注册和登录
  ✓ 创建空间和相册成功
  ✓ 照片上传成功并显示缩略图
  ✓ 分享链接可以在新窗口访问
  ✓ 3D 照片墙正常渲染

数据验证应该：
  ✓ MinIO 中存在上传的照片文件
  ✓ MySQL 中有相应的记录
  ✓ Redis 中有活跃的 Session


═══════════════════════════════════════════════════════════════
🛠️ 如果遇到问题
═══════════════════════════════════════════════════════════════

查看日志：
  docker-compose -f infra/docker-compose.yml logs -f

重启服务：
  cd infra
  docker-compose restart

完全重置：
  cd infra
  docker-compose down -v
  docker-compose up -d

查看详细故障排查指南：
  cat docs/testing-guide.md


═══════════════════════════════════════════════════════════════
📚 更多信息
═══════════════════════════════════════════════════════════════

• 当前测试指南：  cat docs/testing-guide.md
• 项目概览：      cat README.md
• 历史资料：      ls docs/archive


═══════════════════════════════════════════════════════════════

🎉 测试框架已就绪！打开终端开始测试吧！

═══════════════════════════════════════════════════════════════

EOF
