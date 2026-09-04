# VIE Gallery

多租户照片展示与分享平台。项目基于 `E:/workspace/vie-mei` 的现有视觉实现进行重构，部署目标为 `gallery.vie-vibe.cn`。

## 定位

- 公开用户可以创建照片空间并生成专属分享链接
- 管理端使用 Vue 3 + TypeScript
- 后端使用 Spring Boot，统一处理用户、租户、相册、照片、分享链接和对象存储
- 公开展示页保留原项目的 Three.js 3D 照片墙作为可选展示模式

## URL 规划

```text
vie-vibe.cn                         个人主页与项目介绍
gallery.vie-vibe.cn                 照片平台入口
gallery.vie-vibe.cn/app             登录后的管理端
gallery.vie-vibe.cn/g/{slug}        公开照片空间
api.gallery.vie-vibe.cn             后端 API（可选独立域名）
```

第一版采用路径分享链接。泛域名子域名分享作为后续能力，不作为 MVP 前置条件。

## 当前重构原则

1. 保留原项目的页面视觉和 3D 展示效果。
2. 重写认证、租户隔离、相册持久化和文件访问边界。
3. 相册和照片数据统一进入关系数据库，不再以 JSON 或内存对象作为主数据源。
4. 图片文件放在对象存储，数据库只保存对象元数据和 key。
5. 管理接口和公开展示接口分离。
6. 所有租户上下文从登录身份或分享令牌取得，不接受客户端传入的 `userId` 作为身份依据。

## MVP

- 注册、登录、退出
- 创建照片空间
- 创建相册
- 单张和批量上传照片
- 图片缩略图和基础元数据
- 公开/私密/密码访问
- 生成、撤销和过期分享链接
- 保留原 3D 展示页作为公开空间展示模式
- 管理端照片排序、封面设置和软删除

## 后续能力

- AI 自动标签、智能选封面和重复照片检测
- 相册协作与成员权限
- 定时备份和存储配额
- 自定义主题和模板
- 自定义子域名

## 目录规划

```text
vie-gallery/
├── apps/
│   ├── gallery-api/       # Spring Boot API
│   ├── gallery-admin/     # Vue 管理端
│   └── gallery-viewer/    # 公开展示页，复用 Three.js 视觉层
├── docs/
│   └── reconstruction-plan.md
└── infra/                 # Docker、反向代理和部署配置
```

## 测试

项目包含完整的 MCP 测试套件，支持自动化 API 测试和浏览器端到端测试。

### 快速测试

```bash
# 1. 启动所有服务
cd infra
docker-compose up -d

# 2. 运行自动化测试
bash test-mcp-flow.sh

# 3. 启动前端（可选）
bash start-frontend.sh
```

### 测试文档

- **[QUICK-START.txt](QUICK-START.txt)** - 快速启动参考卡片（⭐推荐）
- **[TEST-SUMMARY.md](TEST-SUMMARY.md)** - 测试总结和概览
- **[TESTING-HOST.md](TESTING-HOST.md)** - 主机端详细执行指南
- **[docs/testing-guide.md](docs/testing-guide.md)** - 完整测试使用指南
- **[docs/mcp-test-guide.md](docs/mcp-test-guide.md)** - API 测试详细文档

### 测试脚本

- `test-mcp-flow.sh` - 自动化 API 测试（13 个端点）
- `test-browser-mcp.sh` - 浏览器 MCP 测试准备
- `quick-test.sh` - 交互式测试控制台

### 服务地址

| 服务 | 地址 | 说明 |
|------|------|------|
| API | http://localhost:8080 | Spring Boot 后端 |
| Admin UI | http://localhost:5173 | Vue 管理端 |
| Viewer | http://localhost:5174 | 公开展示页 |
| MinIO Console | http://localhost:9001 | 对象存储控制台 |

## 参考项目

旧项目位于 `E:/workspace/vie-mei`。它作为视觉和数据迁移参考，不直接作为新平台的业务基础。
