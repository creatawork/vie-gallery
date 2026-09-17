# M3 后端实现进度总结

## 已完成模块

### 1. 领域层 (Domain)
- ✅ `ShareLink` - 分享链接领域对象
- ✅ `ShareLinkStatus` - 分享链接状态枚举 (ACTIVE, EXPIRED, REVOKED)
- ✅ `PublicAccessState` - 公开访问状态枚举 (READY, PASSWORD_REQUIRED, SHARE_LINK_REQUIRED, EMPTY)
- ✅ `PublicAccessException` - 公开访问异常及错误码
- ✅ `Gallery` - 更新支持 passwordHash 和 coverPhotoId

### 2. 应用层 (Application)
- ✅ `ShareLinkFacade` - 分享链接管理门面
  - createShareLink - 创建分享链接
  - listShareLinks - 列出相册分享链接
  - revokeShareLink - 撤销分享链接
  - deleteShareLink - 删除分享链接
- ✅ `PublicAccessFacade` - 公开访问门面
  - resolvePublicGallery - 解析公开相册状态
  - unlockGallery - 解锁密码相册
  - listPublicPhotos - 列出公开照片
- ✅ `TokenGenerator` - Token 生成器接口
- ✅ `ShareLinkRepository` - 分享链接仓储接口
- ✅ DTO 类型
  - `PublicGalleryView` - 公开相册视图
  - `PublicPhotoView` - 公开照片视图
  - `ShareLinkView` - 分享链接视图
  - `CreateShareLinkResult` - 创建分享链接结果
  - `CreateShareLinkCommand` - 创建分享链接命令

### 3. 基础设施层 (Infrastructure)
- ✅ `Sha256TokenGenerator` - SHA-256 Token 生成器实现（带常量时间比较）
- ✅ `MyBatisShareLinkRepository` - 分享链接仓储实现
- ✅ `ShareLinkMapper` - MyBatis Mapper
- ✅ `GalleryMapper` - 更新支持 passwordHash 和 coverPhotoId
- ✅ `PhotoMapper` - 添加公开查询方法
- ✅ 更新 `MyBatisGalleryRepository` 和 `MyBatisPhotoRepository`

### 4. API 层 (Boot)
- ✅ `ShareLinkController` - 分享链接管理 API
  - POST /api/galleries/{galleryId}/share-links
  - GET /api/galleries/{galleryId}/share-links
  - DELETE /api/share-links/{shareLinkId}
- ✅ `PublicGalleryController` - 公开展示 API
  - GET /api/public/g/{slug}
  - POST /api/public/g/{slug}/unlock
  - GET /api/public/g/{slug}/photos
- ✅ `GlobalExceptionHandler` - 添加 PublicAccessException 处理
- ✅ `M3ShareLinkConfig` - M3 配置类

### 5. 数据库迁移
- ✅ `V4__m3_share_link.sql`
  - 创建 share_link 表
  - 为 gallery 表添加 password_hash 字段

## 安全实现要点

1. **Token 安全**
   - 使用 SecureRandom 生成 32 字节随机 token
   - 数据库只存储 SHA-256 hash
   - 常量时间比较防止时序攻击
   - 原始 token 只在创建响应中返回一次

2. **密码保护**
   - 使用现有 BCrypt/Argon2id 密码哈希
   - 密码验证失败统一返回 403
   - 过期/撤销/不存在统一返回 404，防止枚举

3. **访问控制**
   - PUBLIC 相册无需验证
   - PRIVATE 相册需要有效分享 token
   - PASSWORD 相册需要 token + 密码 + Session
   - 公开 API 不返回内部 ID、租户 ID、bucket、object key

4. **Session 管理**
   - HttpOnly、Secure、SameSite=Lax
   - 30 分钟有效期
   - 撤销链接后 Session 立即失效

## 待实现

### 后端
- [ ] 限流实现（unlock 接口防暴力破解）
- [ ] 审计日志（SHARE_LINK_CREATED, PUBLIC_UNLOCK_SUCCEEDED 等）
- [ ] Redis 缓存层（公开状态、签名 URL）
- [ ] 签名 URL 刷新机制
- [ ] 单元测试和集成测试

### 前端
- [ ] viewer 状态机和 API 客户端 (Task #8)
- [ ] 响应式网格降级视图 (Task #9)
- [ ] Three.js 场景和布局系统 (Task #10)
- [ ] 移动端交互和可访问性 (Task #11)
- [ ] 管理端分享链接 UI (Task #12)
- [ ] 前端测试 (Task #14)
- [ ] 验收和发布演练 (Task #15)

## 下一步

开始前端 viewer 实现：
1. 创建 viewer 路由和状态机
2. 实现公开 API 客户端
3. 实现响应式网格基础能力
4. 集成 Three.js 照片墙（参考旧项目）
