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
  • test-mcp-flow.sh        - API 自动化测试（13 个步骤）
  • test-browser-mcp.sh     - 浏览器 MCP 测试指南

📖 文档：
  • QUICK-START.txt         - 快速启动卡片（⭐首选）
  • TEST-SUMMARY.md         - 测试总结和概览
  • TESTING-HOST.md         - 主机端详细指南
  • docs/testing-guide.md   - 完整测试手册
  • docs/mcp-test-guide.md  - API 测试详细文档
  • README.md               - 已更新测试章节


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
  ✓ 用户注册登录
  ✓ 创建空间和相册
  ✓ 上传照片
  ✓ 生成分享链接
  ✓ 公开访问验证
  ✓ 密码保护测试


═══════════════════════════════════════════════════════════════
📊 测试覆盖范围
═══════════════════════════════════════════════════════════════

API 端点（自动化测试）：
  1.  POST   /api/auth/register          - 用户注册
  2.  POST   /api/auth/login             - 用户登录
  3.  GET    /api/auth/me                - 获取当前用户
  4.  POST   /api/spaces                 - 创建照片空间
  5.  GET    /api/spaces                 - 列出我的空间
  6.  POST   /api/spaces/{id}/albums     - 创建相册
  7.  GET    /api/spaces/{id}/albums     - 列出相册
  8.  POST   /api/.../photos             - 上传照片
  9.  GET    /api/.../photos             - 列出照片
  10. POST   /api/spaces/{id}/shares     - 创建分享链接
  11. GET    /api/public/g/{slug}        - 公开访问空间
  12. POST   /api/public/g/{slug}/verify - 验证分享密码
  13. POST   /api/auth/logout            - 用户登出

前端功能（手动测试）：
  • 管理端注册/登录界面
  • 空间和相册管理
  • 照片上传和展示
  • 分享链接生成
  • 公开展示页（3D 照片墙）

数据和存储：
  • MySQL 数据持久化
  • Redis Session 管理
  • MinIO 对象存储
  • 租户数据隔离


═══════════════════════════════════════════════════════════════
🔗 服务地址（启动后可访问）
═══════════════════════════════════════════════════════════════

  API:             http://localhost:8080
  API Health:      http://localhost:8080/actuator/health
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
   curl http://localhost:8080/actuator/health

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
    SELECT * FROM spaces;
    SELECT * FROM photos;


═══════════════════════════════════════════════════════════════
🎯 测试成功标准
═══════════════════════════════════════════════════════════════

自动化测试应该：
  ✓ 所有 13 个 API 测试步骤都显示 ✓
  ✓ 生成有效的分享链接
  ✓ 公开访问返回正确的空间数据
  ✓ 密码验证正常工作

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
  cat TESTING-HOST.md | grep -A 20 "故障排查"


═══════════════════════════════════════════════════════════════
📚 更多信息
═══════════════════════════════════════════════════════════════

• 快速参考：      cat QUICK-START.txt
• 测试总结：      cat TEST-SUMMARY.md
• 详细指南：      cat docs/testing-guide.md
• API 文档：      cat docs/mcp-test-guide.md


═══════════════════════════════════════════════════════════════

🎉 测试框架已就绪！打开终端开始测试吧！

═══════════════════════════════════════════════════════════════

EOF
