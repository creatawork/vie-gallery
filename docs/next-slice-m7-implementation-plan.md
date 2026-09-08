# M7: Viewer 配置版本化与性能优化 - 实施计划

> **阶段定位**: 将 Viewer 从"功能可用"演进为"配置可回溯、资源可分发、体验可降级、分享可传播"的面向访客的产品面
> **当前基线**: M6.5 发布前硬化（已完成：rate limiting、413 错误、任务中心、生产化加固）
> **开始时间**: 2026-09-08
> **预计周期**: 3-4 周（5 个子阶段，串行推进）

---

## 一、阶段概览与目标

### 1.1 核心痛点

| 问题 | 影响 | 现状证据 |
|------|------|----------|
| Viewer 配置覆盖式保存 | 误操作无法回滚，创作风险高 | `GalleryViewerConfig.java` 仅有 `withUpdate` |
| 3D 渲染无分级降级 | 大量照片时内存/带宽压力大，低端设备卡顿 | `App.vue:141-183` 遍历全部照片加载纹理 |
| 无 TEXTURE 阶段 | 前端宣称"生成 3D 纹理"但后端未实现 | Migration V8 已预留，Worker 仅有 VALIDATE/THUMBNAIL/FINALIZE |
| 社交分享无爬虫友好预览 | 微信/Telegram 等抓取器拿不到正确卡片 | `seo.ts` 仅运行时 DOM 注入 |
| 资源直连对象存储 | 无 CDN 缓存，大流量下后端压力大 | `PublicAccessFacade.createReadUrl` 生成短期签名 URL |

### 1.2 阶段目标（按优先级）

```
┌─────────────────────────────────────────────────────────────────┐
│  M7.1 配置版本化（P0：2 周）                                      │
│  ✅ 草稿/发布分离、版本历史、一键回滚、schema 版本校验            │
│  ✅ Admin 面板可操作，公开端立即生效                               │
├─────────────────────────────────────────────────────────────────┤
│  M7.2 TEXTURE 阶段与资源分级（P1：1 周）                           │
│  ✅ Worker 实现 TEXTURE 阶段，WebP 纹理生成                        │
│  ✅ 缩略图分级（medium/high/texture）                             │
│  ✅ 前端文案对齐，3D 相册自动生成纹理                               │
├─────────────────────────────────────────────────────────────────┤
│  M7.3 性能降级与自适应（P1：1 周）                                │
│  ✅ LOD 换图、视野内加载、距离剔除                                │
│  ✅ FPS 自动降级策略 + 设备能力探测                                │
│  ✅ WebGL 不可用自动切 2D 视图                                     │
├─────────────────────────────────────────────────────────────────┤
│  M7.4 CDN 与社交预览（P2：1 周）                                  │
│  ✅ 媒体子域、CDN 配置段、签名 URL 短 TTL                           │
│  ✅ 边缘静态 meta 壳（UA 识别抓取）                                │
│  ✅ 私有/密码相册 noindex 无泄漏                                   │
├─────────────────────────────────────────────────────────────────┤
│  M7.5 综合验收与回归（P0：2-3 天）                                │
│  ✅ Docker/CLI/浏览器 MCP 全链路                                 │
│  ✅ M4/M5/M6 回归测试                                             │
│  ✅ 移动端模拟、社交调试器检查                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Definition of Done

- [ ] 配置版本化闭环（草稿/发布/回滚/版本历史）实现，Admin 面板可操作
- [ ] `schema_version` 校验与契约包字段同步更新，前后端一致
- [ ] TEXTURE 阶段真实施，上传文案与服务端行为一致
- [ ] 缩略图分级、LOD 换图与按视野加载可用；FPS 自动降级有证据
- [ ] WebGL 不可用自动切 2D 并提示；移动端触控行为正确
- [ ] CDN/媒体子域配置段与失效策略落地，签名 URL 短 TTL 生效
- [ ] 社交抓取 UA 得到完整 meta 壳；PRIVATE/PASSWORD 无泄漏且 noindex
- [ ] M4/M5/M6 全量回归；Docker、CLI、浏览器 MCP 与测试矩阵通过

---

## 二、技术设计

### 2.1 数据库迁移设计（V9）

**文件**: `apps/gallery-api/gallery-api-boot/src/main/resources/db/migration/V9__m7_viewer_config_versions.sql`

```sql
-- 新增 viewer_config_version 表（版本历史，只追加）
CREATE TABLE gallery_viewer_config_version (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    gallery_id BIGINT NOT NULL,
    config_json JSON NOT NULL,
    preset_name VARCHAR(50),
    schema_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL,
    created_by_user_id BIGINT NOT NULL,
    published_config_id BIGINT, -- 指向当前生效发布版（ nullable，未发布时为 NULL）
    INDEX idx_gallery_created (gallery_id, created_at),
    INDEX idx_published (published_config_id),
    CONSTRAINT fk_version_config FOREIGN KEY (published_config_id) 
        REFERENCES gallery_viewer_config(id) ON DELETE SET NULL
);

-- 修改 gallery_viewer_config 增加草稿状态与 schema_version
ALTER TABLE gallery_viewer_config 
    ADD COLUMN schema_version INT NOT NULL DEFAULT 1,
    ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN updated_by_user_id BIGINT,
    ADD COLUMN last_published_at TIMESTAMP NULL,
    ADD INDEX idx_gallery_draft (gallery_id, is_draft);

-- 添加 comments
COMMENT ON TABLE gallery_viewer_config_version IS 'Viewer 配置版本历史（只追加，不可修改）';
COMMENT ON COLUMN gallery_viewer_config_version.published_config_id IS '指向当前生效的发布版配置 ID（通过 DRAFT 行引用）';
COMMENT ON COLUMN gallery_viewer_config.schema_version IS '配置协议版本号（1=当前版本，演进时递增）';
COMMENT ON COLUMN gallery_viewer_config.is_draft IS '是否为草稿状态（TRUE=未发布，FALSE=已发布到公开端）';
```

**升级脚本**: 将现有配置迁移为 V1 版本：

```sql
-- V9_upgrade.sql 插入到 V9__m7_viewer_config_versions.sql 末尾
INSERT INTO gallery_viewer_config_version (gallery_id, config_json, preset_name, schema_version, created_at, created_by_user_id, published_config_id)
SELECT 
    id as gallery_id,
    config_json,
    preset_name,
    1 as schema_version,
    created_at,
    created_by_user_id, -- 假设原有字段
    id as published_config_id
FROM gallery_viewer_config
WHERE is_draft = FALSE;

-- 将现有 DRAFT 标记为 TRUE
UPDATE gallery_viewer_config 
SET is_draft = TRUE, schema_version = 1
WHERE is_draft IS NULL;
```

### 2.2 领域模型演进

**文件**: `apps/gallery-api/gallery-api-domain/src/main/java/cn/vie/vibe/gallery/domain/ViewerConfigVersion.java`

```java
package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record ViewerConfigVersion(
    UUID id,
    UUID galleryId,
    String configJson,
    String presetName,
    int schemaVersion,
    Instant createdAt,
    UUID createdByUserId,
    UUID publishedConfigId // 指向当前生效发布版（通过 DRAFT 行引用）
) {
    public static ViewerConfigVersion of(UUID galleryId, String configJson, String presetName, UUID createdBy) {
        return new ViewerConfigVersion(
            UUID.randomUUID(),
            galleryId,
            configJson,
            presetName,
            1, // 当前 schema_version
            Instant.now(),
            createdBy,
            null
        );
    }
}
```

**新增 Repository**: `ViewerConfigVersionRepository.java`

```java
package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Optional;
import java.time.Instant;

@Mapper
public interface ViewerConfigVersionRepository {
    int save(@Param("tenantId") UUID tenantId, @Param("version") ViewerConfigVersion version);
    List<ViewerConfigVersion> findByGallery(@Param("tenantId") UUID tenantId, @Param("galleryId") UUID galleryId);
    Optional<ViewerConfigVersion> findById(@Param("tenantId") UUID tenantId, @Param("versionId") UUID versionId);
    Optional<ViewerConfigVersion> findLatestPublished(@Param("tenantId") UUID tenantId, @Param("galleryId") UUID galleryId);
    int updatePublishedConfigId(@Param("tenantId") UUID tenantId, @Param("versionId") UUID versionId, @Param("publishedId") UUID publishedId);
}
```

### 2.3 Facade 层 API 设计

**文件**: `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/GalleryViewerConfigFacade.java`

**新增方法**:

```java
// 发布 DRAFT 配置 → 创建新版本并生效
public ViewerConfigVersion publishConfig(UUID tenantId, UUID galleryId, UUID userId) {
    // 1. 获取 DRAFT 配置
    GalleryViewerConfig draft = configRepository.findDraft(tenantId, galleryId)
        .orElseThrow(() -> new DomainException("CONFIG_NOT_FOUND", "No draft configuration"));
    
    // 2. 校验 schema_version（前端传递，后端验证兼容性）
    validateSchemaVersion(draft.schemaVersion());
    
    // 3. 创建新版本记录
    ViewerConfigVersion version = ViewerConfigVersion.of(
        galleryId,
        draft.configJson(),
        draft.presetName(),
        userId
    );
    versionRepository.save(tenantId, version);
    
    // 4. 更新 DRAFT 的 last_published_at
    configRepository.updateLastPublished(tenantId, galleryId, Instant.now());
    
    // 5. 返回版本信息（前端用于 UI 更新）
    return version;
}

// 回滚到指定历史版本
public ViewerConfigVersion rollbackToVersion(UUID tenantId, UUID galleryId, UUID versionId, UUID userId) {
    // 1. 获取历史版本
    ViewerConfigVersion source = versionRepository.findById(tenantId, versionId)
        .orElseThrow(() -> new DomainException("VERSION_NOT_FOUND", "Version not found"));
    
    // 2. 基于历史版本创建新发布快照（不删除旧版本）
    ViewerConfigVersion newVersion = new ViewerConfigVersion(
        UUID.randomUUID(),
        source.galleryId(),
        source.configJson(),
        source.presetName(),
        source.schemaVersion(),
        Instant.now(),
        userId,
        null
    );
    versionRepository.save(tenantId, newVersion);
    
    // 3. 更新 DRAFT 为新版本内容（供后续编辑）
    GalleryViewerConfig draft = configRepository.findDraft(tenantId, galleryId)
        .orElseGet(() -> configRepository.createDraft(tenantId, galleryId, newVersion.configJson(), newVersion.presetName()));
    configRepository.updateDraft(tenantId, draft.id(), newVersion.configJson(), newVersion.presetName());
    
    return newVersion;
}

// 获取版本历史列表（分页）
public Page<ViewerConfigVersion> listVersions(UUID tenantId, UUID galleryId, int page, int size) {
    return versionRepository.findByGallery(tenantId, galleryId)
        .stream()
        .skip((long) page * size)
        .limit(size)
        .collect(Collectors.collectingAndThen(Collectors.toList(), Page::of));
}
```

### 2.4 Worker TEXTURE 阶段实现

**文件**: `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/PhotoProcessingWorker.java`

**修改计划**:

```java
// 修改进度百分比：VALIDATE(10) → THUMBNAIL(35) → TEXTURE(60) → FINALIZE(80) → SUCCEEDED
// 新增 TEXTURE 阶段（60%）：生成 3D 纹理 WebP

private void process(PhotoProcessingTask task) {
    // ... existing VALIDATE (10%) ...
    tasks.progress(task.tenantId(), task.id(), workerId, 10, "VALIDATE", now);
    
    // ... existing THUMBNAIL (35%) ...
    tasks.progress(task.tenantId(), task.id(), workerId, 35, "THUMBNAIL", now);
    
    // === 新增 TEXTURE 阶段 (60%) ===
    requireLease(task, leaseLost);
    tasks.progress(task.tenantId(), task.id(), workerId, 60, "TEXTURE", now);
    
    try (InputStream in = storage.get(object.objectKey())) {
        // 检查 Gallery 是否启用 3D 模式（避免所有照片都生成纹理）
        boolean enable3D = shouldGenerateTextures(task.tenantId(), task.galleryId());
        
        if (enable3D) {
            // 生成 WebP 纹理（最长边 2048px，有损压缩）
            ThumbnailProcessor.TextureResult textureResult = thumbnails.createTexture(
                object.mimeType(), 
                in, 
                2048, // max dimension
                0.8f // quality
            );
            
            String key = "tenant/" + task.tenantId() + "/photos/" + task.photoId() + "/texture";
            storage.put(key, new ByteArrayInputStream(textureResult.content()), 
                       "image/webp", textureResult.content().length);
        }
    }
    
    // ... existing FINALIZE (80%) ...
    tasks.progress(task.tenantId(), task.id(), workerId, 80, "FINALIZE", now);
    // ...
}

private boolean shouldGenerateTextures(UUID tenantId, UUID galleryId) {
    // 读取 Gallery 配置，判断是否启用 3D 模式
    // 简化：暂时检查是否有 3D preset
    GalleryViewerConfig config = viewerConfigRepository.findDraft(tenantId, galleryId)
        .orElse(null);
    return config != null && config.presetName() != null && 
           config.presetName().contains("3d");
}
```

**新增 TextureProcessor**: `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/TextureProcessor.java`

```java
package cn.vie.vibe.gallery.application;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.util.Iterator;

public interface TextureProcessor {
    record TextureResult(byte[] content, int width, int height) {}
    
    TextureResult createTexture(InputStream input, int maxDimension, float quality);
}
```

**实现**: `apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/ImageIoTextureProcessor.java`

```java
package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.TextureProcessor;
import org.springframework.stereotype.Component;
import javax.imageio.*;
import javax.imageio.stream.ImageOutputStream;
import java.awt.geomAffineTransform;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.Iterator;

@Component
public class ImageIoTextureProcessor implements TextureProcessor {
    
    @Override
    public TextureResult createTexture(InputStream input, int maxDimension, float quality) 
            throws IOException {
        
        BufferedImage source = ImageIO.read(input);
        int width = source.getWidth();
        int height = source.getHeight();
        
        // 计算缩放比例
        float ratio = Math.min((float) maxDimension / width, (float) maxDimension / height);
        if (ratio < 1.0f) {
            int newWidth = (int) (width * ratio);
            int newHeight = (int) (height * ratio);
            
            BufferedImage scaled = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_RGB);
            Graphics2D g2d = scaled.createGraphics();
            g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g2d.drawImage(source, 0, 0, newWidth, newHeight, null);
            g2d.dispose();
            
            source = scaled;
            width = newWidth;
            height = newHeight;
        }
        
        // 编码为 WebP
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("webp").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(quality);
        
        ImageOutputStream ios = ImageIO.createImageOutputStream(baos);
        writer.setOutput(ios);
        writer.write(null, new IIOImage(source, null, null), param);
        
        writer.dispose();
        ios.close();
        
        return new TextureResult(baos.toByteArray(), width, height);
    }
}
```

### 2.5 前端 Admin 配置面板调整

**文件**: `apps/gallery-admin/src/views/ViewerConfigView.vue`

**新增功能**:

1. **保存草稿按钮** (替代原 Save 直接发布):
```vue
<button @click="saveDraft" :disabled="saving">保存草稿</button>
```

2. **发布到访客按钮**:
```vue
<button @click="confirmPublish" :disabled="!hasChanges || publishing">发布到访客</button>
```

3. **版本历史列表**:
```vue
<template v-if="versions.length > 0">
  <h3>版本历史</h3>
  <ul>
    <li v-for="version in versions" :key="version.id">
      <span>{{ version.createdAt }}</span>
      <span>{{ version.presetName }}</span>
      <button @click="rollbackToVersion(version.id)">回滚</button>
    </li>
  </ul>
</template>
```

4. **发布确认弹窗**（展示差异）:
```typescript
const confirmPublish = async () => {
  const diff = calculateConfigDifference(currentDraft, lastPublished);
  const confirmed = await showDialog({
    title: '发布配置变更',
    message: `以下配置将更新到访客端：${diff}`,
    confirmText: '确认发布',
    cancelText: '取消'
  });
  
  if (confirmed) {
    await publishConfig();
    showToast('配置已发布到访客端', 'success');
  }
};
```

### 2.6 前端 Viewer 性能优化

**文件**: `apps/gallery-viewer/src/App.vue`

**修改计划**:

1. **设备能力探测**（启动时）:
```javascript
const detectDeviceCapabilities = () => {
  const caps = {
    isMobile: /Mobi|Android/i.test(navigator.userAgent),
    memory: navigator.deviceMemory || 4, // GB
    cores: navigator.hardwareConcurrency || 4,
    dpr: window.devicePixelRatio,
    supportsWebGL: supportsWebGL()
  };
  
  // 自动降级策略
  if (caps.memory < 4 || caps.isMobile) {
    caps.autoDisableParticles = true;
    caps.maxTextureQuality = 'medium';
  }
  
  return caps;
};
```

2. **LOD 纹理切换**（根据距离）:
```javascript
const updateTextureLOD = (mesh, camera) => {
  const distance = mesh.position.distanceTo(camera.position);
  const threshold = 10; // 米
  
  if (distance > threshold) {
    // 远处：使用缩略图 medium
    mesh.material.map = textureCache.medium;
  } else {
    // 近处：使用纹理 texture
    mesh.material.map = textureCache.texture;
  }
  mesh.material.needsUpdate = true;
};
```

3. **FPS 自动降级策略**:
```javascript
let lowFpsCount = 0;
const FPS_THRESHOLD = 40;
const DEGRADATION_STEPS = ['particles', 'bloom', 'fog', 'dpr'];
let currentStep = 0;

const monitorFPS = () => {
  const fps = getFPS();
  
  if (fps < FPS_THRESHOLD) {
    lowFpsCount++;
    if (lowFpsCount > 10) { // 持续 10 秒低 FPS
      degradeQuality();
      lowFpsCount = 0;
    }
  } else {
    lowFpsCount = Math.max(0, lowFpsCount - 1);
    if (lowFpsCount === 0 && currentStep > 0) {
      recoverQuality(); // 恢复（防抖动）
    }
  }
  
  requestAnimationFrame(monitorFPS);
};
```

4. **WebGL 不可用回退 2D**:
```javascript
const init3DEngine = async () => {
  try {
    if (!supportsWebGL()) {
      throw new Error('WebGL not supported');
    }
    
    // 创建 Three.js 场景...
    await create3DScene();
  } catch (error) {
    console.warn('3D not available, switching to 2D:', error);
    show2DGrid();
    showToast('当前设备不支持 3D，已切换经典视图', 'info');
  }
};
```

### 2.7 CDN 与社交预览方案

**文件**: `infra/nginx/nginx.conf`

**媒体子域配置**:
```nginx
# 媒体资源子域
server {
    listen 80;
    server_name media.vie-vibe.cn;
    
    location / {
        proxy_pass http://minio:9000;
        proxy_set_header Host $http_host;
        
        # CDN 缓存策略
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Access-Control-Allow-Origin *;
    }
}

# API 主域
server {
    listen 80;
    server_name api.vie-vibe.cn;
    
    location /api/ {
        proxy_pass http://gallery-api:8080/api/;
    }
}
```

**边缘静态 Meta 壳**（Node.js 轻量服务）:
```javascript
// infra/meta-server/index.js
const express = require('express');
const app = express();

app.get('/g/:slug', async (req, res) => {
  const ua = req.get('User-Agent') || '';
  const isCrawler = /wechat|telegram|baidu|facebookbot|twitterbot/i.test(ua);
  
  if (!isCrawler) {
    // 正常浏览器返回 SPA
    return res.sendFile(__dirname + '/spa-shell.html');
  }
  
  // 爬虫抓取器返回静态 Meta
  const slug = req.params.slug;
  const config = await fetchPublicConfig(slug);
  
  if (!config || config.accessType === 'PRIVATE') {
    return res.send(createNoIndexShell());
  }
  
  return res.send(createMetaShell({
    title: config.title,
    description: config.description,
    ogImage: config.coverUrl, // 使用不带 token 的 URL
    canonical: `https://vie-vibe.cn/g/${slug}`
  }));
});

function createMetaShell(meta) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>${meta.title}</title>
  <meta property="og:title" content="${meta.title}" />
  <meta property="og:description" content="${meta.description}" />
  <meta property="og:image" content="${meta.ogImage}" />
  <meta property="og:url" content="${meta.canonical}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${meta.canonical}" />
</head>
<body>
  <noscript><a href="${meta.canonical}">View Gallery</a></noscript>
</body>
</html>`;
}
```

---

## 三、实施顺序与时间表

### 阶段划分（预计 3-4 周）

| 子阶段 | 任务 | 预计时间 | 依赖 |
|--------|------|----------|------|
| **M7.1** | 配置版本化 | 2 周 | 无 |
| M7.1.1 | 数据库迁移 V9 | 0.5 天 | - |
| M7.1.2 | 领域模型与 Repository | 0.5 天 | V9 |
| M7.1.3 | Facade API（publish/rollback） | 1 天 | Repository |
| M7.1.4 | Admin 面板（保存草稿/发布/历史） | 2 天 | API |
| M7.1.5 | 前后端集成测试 | 1 天 | UI |
| **M7.2** | TEXTURE 阶段与资源分级 | 1 周 | M7.1 |
| M7.2.1 | TextureProcessor 实现 | 1 天 | - |
| M7.2.2 | Worker TEXTURE 阶段集成 | 1 天 | TextureProcessor |
| M7.2.3 | 缩略图分级策略 | 0.5 天 | Worker |
| M7.2.4 | 前端文案对齐 | 0.5 天 | Worker |
| **M7.3** | 性能降级与自适应 | 1 周 | M7.2 |
| M7.3.1 | 设备能力探测 | 0.5 天 | - |
| M7.3.2 | LOD 纹理切换 | 1 天 | 探测 |
| M7.3.3 | FPS 自动降级策略 | 1 天 | LOD |
| M7.3.4 | WebGL 不可用回退 2D | 0.5 天 | 降级 |
| M7.3.5 | 移动端触控优化 | 1 天 | 回退 |
| **M7.4** | CDN 与社交预览 | 1 周 | M7.3 |
| M7.4.1 | 媒体子域 Nginx 配置 | 0.5 天 | - |
| M7.4.2 | Meta 服务器实现 | 1 天 | Nginx |
| M7.4.3 | CDN 缓存策略 | 0.5 天 | Meta |
| M7.4.4 | 私有/密码相册 noindex | 0.5 天 | Meta |
| **M7.5** | 综合验收与回归 | 2-3 天 | M7.4 |
| M7.5.1 | Docker/CLI 全链路 | 1 天 | - |
| M7.5.2 | M4/M5/M6 回归 | 1 天 | 全链路 |
| M7.5.3 | 移动端/社交调试器检查 | 0.5 天 | 回归 |

### 详细里程碑

#### Week 1-2: M7.1 配置版本化

**Day 1-2**: 数据库迁移
- [ ] 编写 V9 migration SQL
- [ ] 执行升级脚本验证
- [ ] 回滚脚本测试

**Day 3-4**: 领域模型与 Repository
- [ ] `ViewerConfigVersion` 实体
- [ ] `ViewerConfigVersionRepository` 实现
- [ ] 集成测试

**Day 5-7**: Facade API
- [ ] `publishConfig` 方法
- [ ] `rollbackToVersion` 方法
- [ ] `listVersions` 分页查询
- [ ] schema_version 校验
- [ ] 权限验证（OWNER/EDITOR）

**Day 8-10**: Admin 面板
- [ ] 保存草稿按钮
- [ ] 发布确认弹窗
- [ ] 版本历史列表
- [ ] 回滚按钮与 Toast
- [ ] 实时预览基于 DRAFT

**Day 11-12**: 集成测试
- [ ] 前后端联调
- [ ] 边界条件测试（空历史、重复发布）
- [ ] 权限测试（VIEWER 不可写）

**Day 13-14**: 文档与代码审查
- [ ] API 契约更新
- [ ] Admin 使用文档
- [ ] 代码审查与优化

#### Week 3: M7.2 & M7.3

**Day 15-17**: TEXTURE 阶段
- [ ] TextureProcessor 接口与实现
- [ ] WebP 编码优化
- [ ] Worker 集成 TEXTURE 阶段
- [ ] 3D 模式检测逻辑

**Day 18-19**: 缩略图分级
- [ ] medium/thumbnail/texture key 策略
- [ ] 前端资源加载适配
- [ ] 存储成本评估

**Day 20-22**: 性能优化
- [ ] 设备能力探测
- [ ] LOD 换图实现
- [ ] 视野内懒加载
- [ ] FPS 降级策略

**Day 23-24**: WebGL 回退
- [ ] WebGL 检测
- [ ] 2D 网格 fallback
- [ ] 用户提示 Toast

**Day 25-26**: 移动端优化
- [ ] 触控事件适配
- [ ] 单指旋转/双指缩放
- [ ] 小屏测试

#### Week 4: M7.4 & M7.5

**Day 27-28**: CDN 配置
- [ ] Nginx 媒体子域
- [ ] MinIO 私有桶配置
- [ ] 签名 URL TTL 调整

**Day 29-31**: Meta 服务器
- [ ] Express 轻量服务
- [ ] UA 识别爬虫
- [ ] 静态 Meta 生成
- [ ] noindex 私有相册

**Day 32-33**: 综合测试
- [ ] Docker Compose 全服务
- [ ] CLI 测试流程
- [ ] 浏览器 MCP 验证

**Day 34-35**: 回归与文档
- [ ] M4/M5/M6 回归
- [ ] 社交调试器检查
- [ ] 阶段总结文档
- [ ] M8 规划启动

---

## 四、测试矩阵

### 4.1 配置版本化测试

```typescript
// E2E 测试场景
describe('Viewer Config Versioning', () => {
  it('should create draft on first save', async () => {
    // 1. 访问配置页面
    // 2. 修改 preset
    // 3. 点击保存草稿
    // 4. 验证 DRAFT 行更新，无版本记录
  });
  
  it('should create version on publish', async () => {
    // 1. 发布草稿
    // 2. 验证 gallery_viewer_config_version 新增记录
    // 3. 验证 published_config_id 指向新版本
    // 4. 验证公开端立即生效
  });
  
  it('should rollback to historical version', async () => {
    // 1. 发布 V1
    // 2. 修改并发布 V2
    // 3. 回滚到 V1
    // 4. 验证 V3 记录创建（回滚点）
    // 5. 验证公开端回滚后内容
  });
  
  it('should reject old schema_version', async () => {
    // 1. 假设 schema_version=2
    // 2. 前端传递 version=1
    // 3. 后端返回 400 BAD_SCHEMA_VERSION
  });
  
  it('should 403 for VIEWER role', async () => {
    // 1. 登录 VIEWER 账号
    // 2. 尝试发布配置
    // 3. 验证 403 CONFIG_WRITE_REQUIRED
  });
});
```

### 4.2 TEXTURE 阶段测试

```typescript
describe('TEXTURE Stage', () => {
  it('should generate WebP texture for 3D galleries', async () => {
    // 1. 创建 3D preset Gallery
    // 2. 上传照片
    // 3. 验证 worker 执行 TEXTURE 阶段
    // 4. 验证 MinIO 存在 texture 文件
    // 5. 验证文件为 WebP 格式
  });
  
  it('should skip texture for 2D galleries', async () => {
    // 1. 创建 2D preset Gallery
    // 2. 上传照片
    // 3. 验证 worker 跳过 TEXTURE 阶段
    // 4. 验证 MinIO 无 texture 文件
  });
  
  it('should show correct progress文案', async () => {
    // 1. 上传照片
    // 2. 验证文案显示"正在生成 3D 纹理"
    // 3. 验证进度条 60%
  });
});
```

### 4.3 性能优化测试

```typescript
describe('Performance Optimization', () => {
  it('should detect low-end device and auto-degrade', async () => {
    // 1. 模拟 DeviceMemory < 4GB
    // 2. 验证启动时自动禁用粒子
    // 3. 验证纹理质量为 medium
  });
  
  it('should switch LOD based on distance', async () => {
    // 1. 相机距离 > 10m
    // 2. 验证使用 medium 纹理
    // 3. 相机距离 < 10m
    // 4. 验证切换 texture 纹理
  });
  
  it('should auto-degrade on low FPS', async () => {
    // 1. 模拟 FPS < 40 持续 10 秒
    // 2. 验证依次关闭 particles → bloom → fog
    // 3. 恢复 FPS 后逐步回退
  });
  
  it('should fallback to 2D on WebGL failure', async () => {
    // 1. 禁用 WebGL（DevTools）
    // 2. 验证自动切换到 2D 网格
    // 3. 验证 Toast 提示
  });
});
```

### 4.4 CDN 与社交预览测试

```typescript
describe('CDN & Social Preview', () => {
  it('should serve meta shell for crawlers', async () => {
    // 1. 请求 /g/:slug with WeChat UA
    // 2. 验证返回静态 HTML
    // 3. 验证 og:title/og:image/canonical 正确
  });
  
  it('should noindex private galleries', async () => {
    // 1. 访问 PRIVATE Gallery
    // 2. 验证返回 noindex meta
    // 3. 验证无 token 泄漏
  });
  
  it('should cache media with versioned keys', async () => {
    // 1. 发布配置（触发 key 变化）
    // 2. 验证 CDN 缓存失效（新 key）
    // 3. 验证签名 URL TTL < 1 小时
  });
});
```

---

## 五、风险与缓解

### 5.1 技术风险

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| WebP 编码性能 | 纹理生成耗时较长 | 1. 异步队列处理<br>2. 限制并发任务数<br>3. 监控 CPU 使用率 |
| 前端内存泄漏 | 大量纹理导致 OOM | 1. 纹理缓存 LRU<br>2. 视野外纹理卸载<br>3. 监控内存使用 |
| CDN 缓存失效 | 发布后旧内容仍可见 | 1. 版本化 key 策略<br>2. 强制 purge 备用<br>3. TTL 短期化 |
| Meta 服务器单点 | 爬虫抓取失败 | 1. 无状态设计<br>2. 水平扩展<br>3. 降级为 SPA 抓取 |

### 5.2 集成风险

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| 旧版本迁移失败 | 现有配置丢失 | 1. 备份表<br>2. 回滚脚本<br>3. 灰度发布 |
| schema 演进不兼容 | 前端发布失败 | 1. schema_version 校验<br>2. 向后兼容读取<br>3. 灰度升级 |
| 移动端兼容性 | 低端设备崩溃 | 1. 设备能力探测<br>2. 自动降级<br>3. 2D fallback |

### 5.3 时间风险

- **关键路径**: M7.1 → M7.2 → M7.3 → M7.4
- **缓冲时间**: 预留 2-3 天应对技术难点
- **降级策略**: M7.4（CDN/Meta）可延后，核心功能 M7.1-3 优先完成

---

## 六、交付物清单

### 6.1 代码交付

- [ ] `V9__m7_viewer_config_versions.sql` - 数据库迁移
- [ ] `ViewerConfigVersion.java` - 领域实体
- [ ] `ViewerConfigVersionRepository.java` - 持久化层
- [ ] `GalleryViewerConfigFacade.publishConfig()` - Facade API
- [ ] `TextureProcessor.java` - 纹理处理接口与实现
- [ ] `PhotoProcessingWorker.java` - TEXTURE 阶段集成
- [ ] `ViewerConfigView.vue` - Admin 配置面板（含版本历史）
- [ ] `App.vue` - Viewer 性能优化（LOD/降级/2D fallback）
- [ ] `nginx.conf` - CDN 媒体子域配置
- [ ] `meta-server/index.js` - 边缘 Meta 服务

### 6.2 文档交付

- [ ] `next-slice-m7-implementation-plan.md` - 本文档
- [ ] `docs/m7-api-changes.md` - API 变更说明
- [ ] `docs/m7-db-migration-guide.md` - 数据库升级指南
- [ ] `docs/m7-testing-results.md` - 测试结果与证据
- [ ] `CHANGELOG.md` - 阶段更新日志

### 6.3 测试证据

- [ ] 后端单元测试覆盖率 > 85%
- [ ] 前端组件测试覆盖核心功能
- [ ] E2E 测试脚本（Playwright）
- [ ] 性能基准测试报告（FPS/内存/加载时间）
- [ ] 移动端兼容性测试报告

---

## 七、完成后进入 M8

M7 完成后，根据产品优先级选择 M8 方向：

1. **创作者体验优化**（高优先级）
   - 服务端聚合 photoCount/updatedAt
   - Dashboard 卡片搜索、筛选、排序
   - 批量导入照片

2. **协作增强**（中优先级）
   - 双 EDITOR 并发冲突可见性
   - 角色变更会话即时失效审计
   - 邮件邀请功能

3. **登录访客能力**（低优先级）
   - PRIVATE 相册登录访问
   - 访客计数与统计
   - 登录态分享链接

---

## 八、附录

### A. API 契约变更

```typescript
// gallery-contracts/src/viewer-config.ts

// 新增类型
export interface ViewerConfigVersion {
  id: string;
  galleryId: string;
  configJson: string;
  presetName: string;
  schemaVersion: number;
  createdAt: string;
  createdByUserId: string;
  publishedConfigId?: string;
}

export interface PublishConfigRequest {
  galleryId: string;
  schemaVersion: number;
}

export interface RollbackConfigRequest {
  versionId: string;
}

// 响应变更
export interface ViewerConfigResponse {
  id: string;
  galleryId: string;
  configJson: string;
  presetName: string;
  schemaVersion: number;
  isDraft: boolean;
  lastPublishedAt?: string;
  versions?: ViewerConfigVersion[];
}
```

### B. 数据库 schema 快照

```sql
-- gallery_viewer_config
CREATE TABLE gallery_viewer_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    gallery_id BIGINT NOT NULL,
    config_json JSON NOT NULL,
    preset_name VARCHAR(50),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    schema_version INT NOT NULL DEFAULT 1,
    is_draft BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    created_by_user_id BIGINT,
    updated_by_user_id BIGINT,
    last_published_at TIMESTAMP NULL,
    UNIQUE KEY uk_gallery (gallery_id),
    INDEX idx_gallery_draft (gallery_id, is_draft)
);

-- gallery_viewer_config_version
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
    INDEX idx_published (published_config_id),
    CONSTRAINT fk_version_config FOREIGN KEY (published_config_id) 
        REFERENCES gallery_viewer_config(id) ON DELETE SET NULL
);
```

### C. 关键性能指标目标

| 指标 | 当前 | 目标 |
|------|------|------|
| 3D 加载时间（100 照片） | 8s | < 3s |
| 低端设备 FPS | 25 | > 40（自动降级后） |
| 内存使用（峰值） | 800MB | < 500MB |
| 首屏渲染时间 | 2s | < 1s |
| CDN 命中率 | 0% | > 80% |
| 社交分享预览成功率 | 30% | > 95% |

---

**文档版本**: v1.0  
**最后更新**: 2026-09-07  
**维护者**: creatawork  
**状态**: M7.1 代码完成，待 Docker/Flyway 与浏览器运行态验收
