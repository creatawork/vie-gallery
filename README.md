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

## 参考项目

旧项目位于 `E:/workspace/vie-mei`。它作为视觉和数据迁移参考，不直接作为新平台的业务基础。
