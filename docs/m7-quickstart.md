# M7 开发快速启动指南

> 本文档帮助开发者快速了解 M7 阶段并开始编码。

---

## 一、快速概览

**目标**: 配置版本化、TEXTURE 阶段、性能降级、CDN 与社交预览  
**周期**: 3-4 周  
**优先级**: P0（配置版本化）、P1（TEXTURE/性能）、P2（CDN）  
**文档入口**:
- [详细实施计划](./next-slice-m7-implementation-plan.md) - 完整技术设计
- [执行摘要](./m7-executive-summary.md) - 管理层摘要
- [测试指南](./testing-guide.md) - M7 验收标准

---

## 二、环境准备

### 2.1 数据库备份（重要！）

M7 需要数据库迁移，**必须先备份**：

```bash
# 备份当前数据库
docker exec vie-gallery-mysql mysqldump -u root -p vie_gallery > backup_m6.sql

# 验证备份
gzip backup_m6.sql
ls -lh backup_m6.sql.gz
```

### 2.2 代码分支

```bash
# 创建 M7 开发分支
git checkout main
git pull origin main
git checkout -b feat/m7-viewer-config-and-performance
```

### 2.3 依赖检查

确保以下依赖可用：

```bash
# Java 17+
java -version

# Node.js 18+
node -v
npm -v

# Docker Compose
docker compose version

# WebP 支持（Java）
# 默认 Java 17 已内置，无需额外依赖
```

---

## 三、开发顺序（推荐）

### 📌 第一阶段：配置版本化（2 周，P0）

**目标**: 实现草稿/发布/回滚功能，让创作者敢改配置

#### Day 1-2: 数据库迁移

**文件**: `apps/gallery-api/gallery-api-boot/src/main/resources/db/migration/V9__m7_viewer_config_versions.sql`

**关键步骤**:
1. 创建 `gallery_viewer_config_version` 表
2. 修改 `gallery_viewer_config` 表（增加 `schema_version` / `is_draft` 字段）
3. 数据迁移脚本（现有配置 → V1 版本）

```sql
-- 复制以下模板开始
CREATE TABLE gallery_viewer_config_version (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    gallery_id BIGINT NOT NULL,
    config_json JSON NOT NULL,
    preset_name VARCHAR(50),
    schema_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL,
    created_by_user_id BIGINT NOT NULL,
    published_config_id BIGINT,
    INDEX idx_gallery_created (gallery_id, created_at),
    CONSTRAINT fk_version_config FOREIGN KEY (published_config_id) 
        REFERENCES gallery_viewer_config(id) ON DELETE SET NULL
);
```

**验收**: 
```bash
# 执行迁移
docker compose exec -T mysql mysql -u root -p vie_gallery < apps/gallery-api/gallery-api-boot/src/main/resources/db/migration/V9__m7_viewer_config_versions.sql

# 验证表结构
docker compose exec -T mysql mysql -u root -p vie_gallery -e "DESCRIBE gallery_viewer_config_version;"
```

#### Day 3-4: 领域模型

**新建文件**:
- `apps/gallery-api/gallery-api-domain/src/main/java/cn/vie/vibe/gallery/domain/ViewerConfigVersion.java`
- `apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/ViewerConfigVersionRepository.java`

**关键方法**:
```java
// Repository 接口
int save(@Param("tenantId") UUID tenantId, @Param("version") ViewerConfigVersion version);
List<ViewerConfigVersion> findByGallery(@Param("tenantId") UUID tenantId, @Param("galleryId") UUID galleryId);
Optional<ViewerConfigVersion> findById(@Param("tenantId") UUID tenantId, @Param("versionId") UUID versionId);
```

**验收**: 编写单元测试验证 Repository 方法

#### Day 5-7: Facade API

**修改文件**: `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/GalleryViewerConfigFacade.java`

**新增方法**:
```java
// 发布配置
public ViewerConfigVersion publishConfig(UUID tenantId, UUID galleryId, UUID userId)

// 回滚到历史版本
public ViewerConfigVersion rollbackToVersion(UUID tenantId, UUID galleryId, UUID versionId, UUID userId)

// 版本历史列表
public Page<ViewerConfigVersion> listVersions(UUID tenantId, UUID galleryId, int page, int size)
```

**验收**: 
```bash
cd apps/gallery-api
mvn test -Dtest=GalleryViewerConfigFacadeTest
```

#### Day 8-10: Admin 面板

**修改文件**: `apps/gallery-admin/src/views/ViewerConfigView.vue`

**新增功能**:
1. 保存草稿按钮（替代原 Save）
2. 发布到访客按钮（带确认弹窗）
3. 版本历史列表（时间、preset、回滚按钮）

**关键代码**:
```vue
<button @click="saveDraft" :disabled="saving">保存草稿</button>
<button @click="confirmPublish" :disabled="!hasChanges || publishing">发布到访客</button>

<template v-if="versions.length > 0">
  <ul>
    <li v-for="v in versions">
      {{ v.createdAt }} - {{ v.presetName }}
      <button @click="rollback(v.id)">回滚</button>
    </li>
  </ul>
</template>
```

**验收**: 浏览器打开 `http://localhost:5173`，创建 Gallery → 配置 → 保存草稿 → 发布 → 查看版本历史

#### Day 11-12: 集成测试

**E2E 测试**（建议）:
```typescript
// apps/gallery-admin/tests/viewer-config.spec.ts
describe('Viewer Config Versioning', () => {
  it('should save draft and publish', async () => {
    // 1. 访问配置页
    // 2. 修改 preset
    // 3. 保存草稿
    // 4. 发布
    // 5. 验证公开端立即生效
  });
});
```

**验收**: 运行测试脚本

---

### 📌 第二阶段：TEXTURE 阶段（1 周，P1）

**目标**: 实现 3D 纹理生成，前端文案真实落地

#### Day 15-17: TextureProcessor

**新建文件**:
- `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/TextureProcessor.java`
- `apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/ImageIoTextureProcessor.java`

**关键代码**:
```java
// 生成 WebP 纹理（2048px max, quality=0.8）
TextureResult createTexture(InputStream input, int maxDimension, float quality);
```

**验收**:
```bash
cd apps/gallery-api
mvn test -Dtest=TextureProcessorTest
```

#### Day 18-19: Worker 集成

**修改文件**: `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/PhotoProcessingWorker.java`

**新增阶段**:
```java
// 进度：VALIDATE(10) → THUMBNAIL(35) → TEXTURE(60) → FINALIZE(80) → SUCCEEDED
tasks.progress(task.tenantId(), task.id(), workerId, 60, "TEXTURE", now);

// 生成纹理
boolean enable3D = shouldGenerateTextures(task.tenantId(), task.galleryId());
if (enable3D) {
    TextureResult texture = textureProcessor.createTexture(in, 2048, 0.8f);
    storage.put(key, new ByteArrayInputStream(texture.content()), "image/webp", ...);
}
```

**验收**: 
```bash
# 上传 3D Gallery 照片
curl -X POST http://localhost:8088/api/galleries/{id}/photos -F "file=@test.jpg"

# 检查 MinIO
docker compose exec minio mc ls minio/bucket/tenant/{tenantId}/photos/{photoId}/
# 应看到 texture 文件
```

---

### 📌 第三阶段：性能优化（1 周，P1）

**目标**: 自动降级、LOD、WebGL fallback

#### Day 20-22: 设备探测与 LOD

**修改文件**: `apps/gallery-viewer/src/App.vue`

**新增功能**:
```javascript
// 设备能力探测
const detectDeviceCapabilities = () => {
  return {
    memory: navigator.deviceMemory || 4,
    cores: navigator.hardwareConcurrency || 4,
    dpr: window.devicePixelRatio,
    isMobile: /Mobi|Android/i.test(navigator.userAgent)
  };
};

// LOD 纹理切换
const updateTextureLOD = (mesh, camera) => {
  const distance = mesh.position.distanceTo(camera.position);
  mesh.material.map = distance > 10 ? textureCache.medium : textureCache.texture;
};
```

**验收**: 打开 Chrome DevTools → Network → Slow 3G，验证加载优化

#### Day 23-24: FPS 降级与 WebGL fallback

**关键代码**:
```javascript
// FPS 监控
let lowFpsCount = 0;
const monitorFPS = () => {
  const fps = getFPS();
  if (fps < 40) {
    lowFpsCount++;
    if (lowFpsCount > 10) degradeQuality();
  }
};

// WebGL fallback
const init3DEngine = async () => {
  try {
    if (!supportsWebGL()) throw new Error('WebGL not supported');
    await create3DScene();
  } catch {
    show2DGrid();
    showToast('当前设备不支持 3D，已切换经典视图');
  }
};
```

**验收**: Chrome DevTools → Sensing → Disable GPU

---

### 📌 第四阶段：CDN 与社交预览（1 周，P2）

**目标**: 媒体子域、边缘 Meta 壳

#### Day 27-28: Nginx 配置

**修改文件**: `infra/nginx/nginx.conf`

**新增站点**:
```nginx
server {
    listen 80;
    server_name media.vie-vibe.cn;
    
    location / {
        proxy_pass http://minio:9000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

**验收**: 
```bash
docker compose up -d nginx
curl -I http://localhost/media/test.jpg
# 应看到 Cache-Control 头
```

#### Day 29-31: Meta 服务器

**新建文件**: `infra/meta-server/index.js`

**关键逻辑**:
```javascript
// UA 识别爬虫
const isCrawler = /wechat|telegram|baidu|facebookbot/i.test(ua);

if (isCrawler) {
  return res.send(createMetaShell({ title, description, ogImage }));
} else {
  return res.sendFile('spa-shell.html');
}
```

**验收**: 
```bash
# 模拟微信 UA
curl -H "User-Agent: MicroMessenger/7.0" http://localhost:3000/g/{slug}
# 应看到静态 HTML 带 og:title/og:image
```

---

## 四、调试技巧

### 4.1 数据库迁移调试

```bash
# 查看迁移历史
docker compose exec -T mysql mysql -u root -p vie_gallery -e "SELECT * FROM flyway_schema_history;"

# 回滚迁移（如果失败）
docker compose exec -T mysql mysql -u root -p vie_gallery
> DELETE FROM gallery_viewer_config_version;
> ALTER TABLE gallery_viewer_config DROP COLUMN schema_version;
> ALTER TABLE gallery_viewer_config DROP COLUMN is_draft;
```

### 4.2 Worker 日志调试

```bash
# 实时查看 Worker 日志
docker compose logs -f gallery-api | grep "gallery_task_transition"

# 查看 TEXTURE 阶段执行
docker compose logs -f gallery-api | grep "TEXTURE"
```

### 4.3 前端性能调试

```bash
# Chrome DevTools
1. Open DevTools → Performance tab
2. Record loading 100 photos
3. Check FPS / Memory / Main thread
```

### 4.4 MinIO 对象调试

```bash
# 查看对象列表
docker compose exec minio mc ls minio/bucket/

# 下载对象验证
docker compose exec minio mc cp minio/bucket/tenant/{id}/photos/{photoId}/texture ./texture.webp
```

---

## 五、常见问题

### Q1: 数据库迁移失败

**A**: 
```bash
# 检查 flyway 日志
docker compose logs gallery-api | grep -i flyway

# 手动执行 SQL 调试
docker compose exec -T mysql mysql -u root -p vie_gallery
> SOURCE /app/db/migration/V9__m7_viewer_config_versions.sql;
```

### Q2: Worker 不执行 TEXTURE 阶段

**A**:
```bash
# 检查 Worker 是否运行
docker compose ps | grep gallery-api

# 查看 Worker 代码是否更新
docker compose exec gallery-api ps aux | grep PhotoProcessingWorker

# 重启 Worker
docker compose restart gallery-api
```

### Q3: 前端性能无改善

**A**:
```bash
# 清除浏览器缓存
Chrome DevTools → Application → Clear storage

# 验证代码已打包
cd apps/gallery-viewer
npm run build
# 检查 dist/ 文件时间戳
```

### Q4: Meta 服务器不返回静态 HTML

**A**:
```bash
# 检查 UA 识别
curl -H "User-Agent: MicroMessenger/7.0" http://localhost:3000/g/{slug}

# 检查 Node 进程
ps aux | grep node

# 重启 Meta 服务器
cd infra/meta-server
npm start
```

---

## 六、代码审查清单

在提交 PR 前，检查以下项：

### 数据库迁移
- [ ] SQL 脚本无语法错误
- [ ] 包含数据迁移逻辑
- [ ] 有回滚脚本（可选）
- [ ] 索引设计合理

### 后端代码
- [ ] 单元测试覆盖率 > 80%
- [ ] 权限校验正确（OWNER/EDITOR）
- [ ] 错误码语义清晰
- [ ] 日志完整（任务转换、错误跟踪）

### 前端代码
- [ ] 组件测试覆盖
- [ ] 类型安全（TypeScript）
- [ ] 用户体验（Toast 提示、加载状态）
- [ ] 性能优化（懒加载、防抖）

### 文档
- [ ] API 契约更新
- [ ] 数据库文档同步
- [ ] CHANGELOG 更新
- [ ] 测试证据截图/视频

---

## 七、下一步行动

1. **立即开始**: `git checkout -b feat/m7-viewer-config-and-performance`
2. **Day 1**: 创建 `V9__m7_viewer_config_versions.sql`
3. **Day 2**: 执行迁移脚本，验证表结构
4. **Day 3**: 实现 `ViewerConfigVersion` 领域模型
5. **每日**: 提交代码，更新 todo list

---

**状态**: 待启动  
**联系人**: creatawork  
**文档版本**: v1.0
