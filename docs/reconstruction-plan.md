# VIE Gallery 重构方案

## 1. 现状判断

原项目是 Maven 多模块 Spring Boot 3.3 项目，目标 Java 版本为 21，包含：

- `meiMei-db`：MyBatis-Plus、MySQL、`PhotoDO` 和 `PhotoMapper`
- `meiMei-service`：照片、相册、OSS、缓存、迁移和回收站服务
- `meiMei-starter`：启动类、Controller 和静态资源
- 前端：原生 HTML/CSS/JS、Three.js、GSAP，不是 Vue

页面视觉值得保留：全屏 3D 照片墙、球体/螺旋/网格/银河/心形布局、粒子特效、玻璃拟态控件、照片详情面板、全屏和移动端上传页。

不建议直接扩展原业务层，原因是：

- 相册主要存在于 `photo-cdn-urls.json` 和内存对象中，数据库照片表与相册数据存在双重事实来源
- `userId` 只是请求参数，不是登录身份或租户上下文
- 本地文件、OSS URL、CDN 配置三套访问路径并存
- 管理、迁移、OSS 测试接口和公开接口边界不清晰
- 没有真正的用户、租户、分享链接和配额模型

## 2. 新领域模型

```text
User 1──N Membership N──1 Tenant
Tenant 1──N Gallery 1──N Photo
Gallery 1──N ShareLink
Photo 1──N StorageObject
Tenant 1──1 TenantQuota
```

第一版可以把一个用户直接作为一个租户，保留 `tenant_id` 设计，以便以后加入团队协作。

### 核心表

```text
user
tenant
membership
gallery
photo
storage_object
share_link
tenant_quota
audit_log
```

每个业务表都应包含 `tenant_id`、创建时间、更新时间和软删除状态。所有查询默认附带租户条件，不能依赖 Controller 手工拼接。

## 3. API 分层

### 管理 API

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/galleries
POST   /api/galleries
PATCH  /api/galleries/{id}
DELETE /api/galleries/{id}

GET    /api/galleries/{id}/photos
POST   /api/galleries/{id}/photos/upload
PATCH  /api/photos/{id}
DELETE /api/photos/{id}

POST   /api/galleries/{id}/share-links
DELETE /api/share-links/{id}
```

### 公开展示 API

```text
GET /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
GET /api/public/g/{slug}/photos
```

公开接口只能返回当前分享空间允许公开的数据，不暴露管理对象 ID、租户 ID 或内部 OSS 配置。

## 4. 文件存储

- 使用 S3、阿里云 OSS 或 MinIO
- 数据库保存 `bucket`、`object_key`、MIME、大小、宽高和校验值
- 上传前检查扩展名、MIME 和图片实际解码结果
- 对象 key 使用服务端生成的随机值，不使用原始文件名作为路径
- 原图和缩略图分开保存
- 公开访问使用短期签名 URL 或受控图片代理
- 禁止将永久 OSS URL 直接写入前端配置

## 5. 认证与隔离

- 管理端使用 HttpOnly Cookie Session 或短期 Access Token + Refresh Token
- 租户从认证上下文解析，客户端不可覆盖
- `gallery_id`、`photo_id` 等资源查询必须同时校验 `tenant_id`
- 分享链接使用随机高熵 token，数据库只保存 token hash
- 密码相册使用强哈希，不保存明文密码
- 上传、下载、分享解锁和删除接口增加限流与审计日志

## 6. 从旧项目迁移

1. 导出 `photo-cdn-urls.json` 中的默认相册和其他相册
2. 建立一个迁移租户和对应相册
3. 将照片 URL 解析为对象存储 key
4. 对缺失元数据的照片重新读取尺寸、MIME 和文件大小
5. 写入 `gallery`、`photo` 和 `storage_object`
6. 对比迁移前后的照片数量、封面和排序
7. 新站只读验证通过后，再开放上传和删除

迁移工具必须支持 dry-run、失败重试、校验报告和幂等执行。

## 7. 视觉层迁移

保留原项目的以下模块作为 `gallery-viewer` 的视觉参考或代码来源：

- `static/js/gallery.js`
- `static/js/effects/layout-modes.js`
- `static/js/effects/particles.js`
- `static/js/effects/theme.js`
- `static/css/gallery.css`

管理端不继续维护原生 HTML 页面，使用 Vue 3 + TypeScript 重写。公开展示页与管理端共享 API 类型，但不共享管理布局。

公开展示页需要保留：

- WebGL 降级为普通响应式照片网格
- 移动端触摸手势和图片详情查看
- `prefers-reduced-motion` 支持
- 图片懒加载、缩略图优先和加载失败占位
- 分享页的公开状态、密码状态和过期状态

## 8. 部署规划

```text
gallery.vie-vibe.cn        前端和公开展示入口
api.gallery.vie-vibe.cn    Spring Boot API（可选）
对象存储                    原图和缩略图
MySQL/PostgreSQL            业务数据
Redis                       Session、限流和任务状态
Nginx/Caddy                 HTTPS、反向代理和静态缓存
```

新站与 `2wmei.top` 并行部署，验证完成后再考虑数据迁移或流量切换。不要让 Spring Boot 应用直接承担公网 HTTPS、静态缓存和所有图片流量。

## 9. 上线前检查

- 轮换旧项目中出现过的 OSS、数据库和证书凭据
- 删除或保护迁移、测试和管理接口
- 禁用 `@CrossOrigin("*")`
- 彻底移除 SQL `${ids}` 拼接，改为参数化批量查询
- 校验文件内容，限制尺寸、数量、频率和租户配额
- 进行跨租户访问测试
- 进行移动端、WebGL 降级和大批量图片性能测试
- 配置备份、日志、健康检查和错误监控
