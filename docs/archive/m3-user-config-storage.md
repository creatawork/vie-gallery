# 用户配置存储方案设计

## 问题分析

当前设计的问题：
- ❌ 配置只存储在浏览器 localStorage
- ❌ 无法跨设备同步
- ❌ 无法为不同相册设置不同配置
- ❌ 公开访问者看到的是默认配置

## 新方案：服务端 + 客户端混合存储

### 存储层次

```
1. 系统默认配置（前端硬编码）
   ↓
2. 租户级默认配置（数据库）- 管理员设置
   ↓
3. 相册级配置（数据库）- 相册所有者设置
   ↓
4. 用户偏好（数据库 + localStorage）- 访客本地偏好
```

优先级：用户偏好 > 相册配置 > 租户配置 > 系统默认

---

## 数据库设计

### 1. 相册配置表

```sql
-- 每个相册的视觉配置
CREATE TABLE gallery_viewer_config (
    id CHAR(36) PRIMARY KEY,
    gallery_id CHAR(36) NOT NULL,
    
    -- 配置内容（JSON）
    config JSON NOT NULL,
    
    -- 是否启用（可以临时禁用配置回退到默认）
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- 预设名称（如果使用预设）
    preset_name VARCHAR(50),
    
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    
    UNIQUE KEY uk_gallery (gallery_id),
    CONSTRAINT fk_gallery_config_gallery 
        FOREIGN KEY (gallery_id) REFERENCES gallery(id) ON DELETE CASCADE
);

-- 示例数据
INSERT INTO gallery_viewer_config (id, gallery_id, config, preset_name) VALUES (
    UUID(),
    'gallery-uuid',
    '{
      "layout": {"mode": "sphere"},
      "background": {
        "type": "sky",
        "sky": {"theme": "forest", "timeOfDay": "auto"}
      },
      "particles": {
        "enabled": true,
        "types": ["stars", "sakura"]
      },
      "effects": {
        "bloom": {"enabled": true, "strength": 0.6},
        "fog": {"enabled": true}
      }
    }',
    'forest-dream'
);
```

### 2. 租户默认配置表

```sql
-- 租户级默认配置（可选）
CREATE TABLE tenant_viewer_config (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    
    config JSON NOT NULL,
    preset_name VARCHAR(50),
    
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    
    UNIQUE KEY uk_tenant (tenant_id)
);
```

### 3. 用户偏好表（可选）

```sql
-- 记录访客的偏好（跨相册）
CREATE TABLE viewer_preference (
    id CHAR(36) PRIMARY KEY,
    
    -- 用户标识（登录用户 = user_id，访客 = 设备指纹）
    user_id CHAR(36),
    device_fingerprint VARCHAR(64),
    
    -- 偏好配置（部分覆盖）
    config JSON NOT NULL,
    
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    
    KEY idx_user (user_id),
    KEY idx_device (device_fingerprint)
);
```

---

## 后端实现

### 1. 领域对象

```java
// domain/GalleryViewerConfig.java
public record GalleryViewerConfig(
    UUID id,
    UUID galleryId,
    String configJson,  // JSON 字符串
    boolean enabled,
    String presetName,
    Instant createdAt,
    Instant updatedAt
) {
    public static GalleryViewerConfig create(UUID galleryId, String configJson, String presetName) {
        return new GalleryViewerConfig(
            UUID.randomUUID(),
            galleryId,
            configJson,
            true,
            presetName,
            Instant.now(),
            Instant.now()
        );
    }
}
```

### 2. 仓储接口

```java
// application/GalleryViewerConfigRepository.java
public interface GalleryViewerConfigRepository {
    Optional<GalleryViewerConfig> findByGalleryId(UUID galleryId);
    GalleryViewerConfig save(GalleryViewerConfig config);
    int deleteByGalleryId(UUID galleryId);
}
```

### 3. Facade 服务

```java
// application/GalleryViewerConfigFacade.java
@Service
public class GalleryViewerConfigFacade {
    private final GalleryViewerConfigRepository configRepository;
    private final GalleryRepository galleryRepository;
    private final TenantContextHolder tenantContext;

    // 获取相册的配置（用于公开访问）
    public Optional<String> getPublicConfig(String slug) {
        // 1. 根据 slug 查找相册
        var gallery = galleryRepository.findBySlug(slug)
            .orElseThrow(() -> new GalleryNotFoundException(slug));

        // 2. 查找相册配置
        return configRepository.findByGalleryId(gallery.id())
            .filter(GalleryViewerConfig::enabled)
            .map(GalleryViewerConfig::configJson);
    }

    // 保存相册配置（管理端）
    public GalleryViewerConfig saveConfig(UUID galleryId, String configJson, String presetName) {
        UUID tenantId = tenantContext.getCurrentTenantId();
        
        // 验证相册所有权
        var gallery = galleryRepository.findById(tenantId, galleryId)
            .orElseThrow(() -> new GalleryNotFoundException(galleryId));

        // 查找现有配置
        var existing = configRepository.findByGalleryId(galleryId);

        GalleryViewerConfig config;
        if (existing.isPresent()) {
            // 更新
            config = new GalleryViewerConfig(
                existing.get().id(),
                galleryId,
                configJson,
                true,
                presetName,
                existing.get().createdAt(),
                Instant.now()
            );
        } else {
            // 创建
            config = GalleryViewerConfig.create(galleryId, configJson, presetName);
        }

        return configRepository.save(config);
    }

    // 删除配置（恢复默认）
    public void deleteConfig(UUID galleryId) {
        UUID tenantId = tenantContext.getCurrentTenantId();
        
        // 验证权限
        galleryRepository.findById(tenantId, galleryId)
            .orElseThrow(() -> new GalleryNotFoundException(galleryId));

        configRepository.deleteByGalleryId(galleryId);
    }

    // 启用/禁用配置
    public void toggleConfig(UUID galleryId, boolean enabled) {
        var config = configRepository.findByGalleryId(galleryId)
            .orElseThrow();

        var updated = new GalleryViewerConfig(
            config.id(),
            config.galleryId(),
            config.configJson(),
            enabled,
            config.presetName(),
            config.createdAt(),
            Instant.now()
        );

        configRepository.save(updated);
    }
}
```

### 4. API 端点

```java
// api/GalleryViewerConfigController.java
@RestController
@RequestMapping("/api/galleries/{galleryId}/viewer-config")
public class GalleryViewerConfigController {

    private final GalleryViewerConfigFacade configFacade;

    // 获取配置（管理端）
    @GetMapping
    public ResponseEntity<?> getConfig(@PathVariable UUID galleryId) {
        return configFacade.getConfig(galleryId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    // 保存配置
    @PutMapping
    public ResponseEntity<?> saveConfig(
        @PathVariable UUID galleryId,
        @RequestBody SaveConfigRequest request
    ) {
        var config = configFacade.saveConfig(
            galleryId,
            request.configJson(),
            request.presetName()
        );
        return ResponseEntity.ok(config);
    }

    // 删除配置（恢复默认）
    @DeleteMapping
    public ResponseEntity<?> deleteConfig(@PathVariable UUID galleryId) {
        configFacade.deleteConfig(galleryId);
        return ResponseEntity.noContent().build();
    }
}

record SaveConfigRequest(String configJson, String presetName) 
```

### 5. 公开 API 扩展

```java
// 扩展 PublicGalleryController
@GetMapping("/api/public/g/{slug}/viewer-config")
public ResponseEntity<?> getViewerConfig(@PathVariable String slug) {
    return configFacade.getPublicConfig(slug)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.ok("{}"));  // 返回空对象表示使用默认
}
```

---

## 前端实现调整

### 1. ConfigManager 扩展

```typescript
// core/ConfigManager.ts
export class ConfigManager {
  private config: ViewerConfig
  private serverConfig: Partial<ViewerConfig> | null = null
  private readonly STORAGE_KEY = 'vie-gallery-viewer-preference'

  constructor(initialConfig?: Partial<ViewerConfig>) {
    // 加载顺序：默认 -> 服务端 -> localStorage -> 初始配置
    this.config = this.deepMerge(
      DEFAULT_CONFIG,
      initialConfig || {}
    )
  }

  /**
   * 从服务端加载配置（优先级最高）
   */
  async loadFromServer(slug: string): Promise<ViewerConfig> {
    try {
      const response = await fetch(`/api/public/g/${slug}/viewer-config`)
      if (response.ok) {
        const serverConfig = await response.json()
        this.serverConfig = serverConfig
        this.config = this.deepMerge(
          DEFAULT_CONFIG,
          serverConfig,
          this.loadPreferenceFromStorage()
        )
      }
    } catch (error) {
      console.warn('Failed to load server config:', error)
    }
    return this.getConfig()
  }

  /**
   * 保存用户偏好（仅本地）
   * 这些偏好会覆盖服务端配置
   */
  savePreference(preference: Partial<ViewerConfig>): void {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(preference)
      )
      
      // 重新合并
      this.config = this.deepMerge(
        DEFAULT_CONFIG,
        this.serverConfig || {},
        preference
      )
    } catch (error) {
      console.warn('Failed to save preference:', error)
    }
  }

  /**
   * 获取用户偏好
   */
  private loadPreferenceFromStorage(): Partial<ViewerConfig> {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  }

  /**
   * 清除用户偏好
   */
  clearPreference(): void {
    localStorage.removeItem(this.STORAGE_KEY)
    this.config = this.deepMerge(
      DEFAULT_CONFIG,
      this.serverConfig || {}
    )
  }
}
```

### 2. ViewerEngine 初始化调整

```typescript
// core/ViewerEngine.ts
export class ViewerEngine {
  async init(slug?: string): Promise<void> {
    this.eventBus.emit('init')

    // 1. 如果提供了 slug，从服务端加载配置
    if (slug) {
      await this.configManager.loadFromServer(slug)
    }

    // 2. URL 参数覆盖
    const urlConfig = this.configManager.loadFromURL()
    if (urlConfig) {
      this.configManager.updateConfig(urlConfig)
    }

    // 3. 设备自适应
    if (this.configManager.getConfig().quality === 'auto') {
      this.configManager.autoAdjustForDevice()
    }

    this.eventBus.emit('ready')
  }
}
```

### 3. App.vue 使用

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { ViewerEngine } from '@/core/ViewerEngine'
import { useViewerState } from '@/composables/useViewerState'

const slug = location.pathname.split('/').filter(Boolean).pop() || 'demo'
const viewer = useViewerState(slug)

let engine: ViewerEngine | null = null

onMounted(async () => {
  // 1. 先获取相册状态
  await viewer.initialize()

  if (viewer.isReady.value) {
    // 2. 创建引擎（会自动从服务端加载配置）
    const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement
    engine = new ViewerEngine(canvas)
    await engine.init(slug)  // 传入 slug 加载服务端配置

    // 3. 注册和安装插件...
    
    // 4. 设置照片并启动
    engine.setPhotos(createPhotoMeshes(viewer.photos.value))
    engine.start()
  }
})

// 用户调整配置时保存偏好
function handleConfigChange(updates: any) {
  engine?.getConfigManager().savePreference(updates)
}
</script>
```

---

## 配置管理 UI

### 管理端：相册配置页面

```vue
<!-- ManageGalleryConfig.vue -->
<template>
  <div class="config-panel">
    <h2>相册展示配置</h2>

    <!-- 预设选择 -->
    <section>
      <h3>快速预设</h3>
      <div class="preset-grid">
        <button @click="applyPreset('forest-dream')">森林之梦</button>
        <button @click="applyPreset('starry-night')">星空夜曲</button>
        <button @click="applyPreset('minimal')">极简模式</button>
      </div>
    </section>

    <!-- 详细配置 -->
    <section>
      <h3>布局</h3>
      <select v-model="config.layout.mode">
        <option value="sphere">球形</option>
        <option value="helix">螺旋</option>
        <option value="grid">网格</option>
      </select>
    </section>

    <!-- 更多配置... -->

    <!-- 保存按钮 -->
    <div class="actions">
      <button @click="save">保存配置</button>
      <button @click="reset">恢复默认</button>
      <button @click="preview">预览</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ViewerConfig } from '@/core/types'

const props = defineProps<{ galleryId: string }>()

const config = ref<ViewerConfig>({...})

async function save() {
  await fetch(`/api/galleries/${props.galleryId}/viewer-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configJson: JSON.stringify(config.value),
      presetName: null
    })
  })
  alert('配置已保存')
}

async function applyPreset(name: string) {
  const response = await fetch(`/presets/${name}.json`)
  config.value = await response.json()
}

async function reset() {
  await fetch(`/api/galleries/${props.galleryId}/viewer-config`, {
    method: 'DELETE'
  })
  alert('已恢复默认配置')
}
</script>
```

### 访客端：偏好设置（可选）

```vue
<!-- ViewerPreference.vue -->
<template>
  <div class="preference-panel">
    <h3>我的偏好</h3>
    <p class="hint">这些设置只影响您的浏览体验</p>

    <!-- 简化的配置项 -->
    <label>
      <input type="checkbox" v-model="preference.particles.enabled">
      粒子效果
    </label>

    <label>
      <input type="checkbox" v-model="preference.audio.bgm.enabled">
      背景音乐
    </label>

    <button @click="save">保存偏好</button>
    <button @click="clear">清除偏好</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const preference = ref({
  particles: { enabled: true },
  audio: { bgm: { enabled: false } }
})

function save() {
  // 保存到 localStorage（通过 ConfigManager）
  window.viewerEngine?.getConfigManager().savePreference(preference.value)
}

function clear() {
  window.viewerEngine?.getConfigManager().clearPreference()
}
</script>
```

---

## 配置优先级示例

### 场景 1：使用相册自定义配置

```
1. 系统默认：layout = "sphere", particles = false
2. 相册配置：layout = "grid", particles = true, theme = "forest"
3. 用户偏好：audio.bgm = false

最终配置：
- layout = "grid" (来自相册)
- particles = true (来自相册)
- theme = "forest" (来自相册)
- audio.bgm = false (来自用户偏好)
```

### 场景 2：URL 参数覆盖

```
URL: /g/demo?layout=helix&particles=stars,hearts

最终配置：
- layout = "helix" (URL 覆盖)
- particles = ["stars", "hearts"] (URL 覆盖)
- 其他保持相册配置
```

---

## 数据库迁移

```sql
-- V5__gallery_viewer_config.sql

CREATE TABLE gallery_viewer_config (
    id CHAR(36) PRIMARY KEY,
    gallery_id CHAR(36) NOT NULL,
    config JSON NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    preset_name VARCHAR(50),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    
    UNIQUE KEY uk_gallery (gallery_id),
    CONSTRAINT fk_gallery_config_gallery 
        FOREIGN KEY (gallery_id) REFERENCES gallery(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_enabled ON gallery_viewer_config(enabled);
```

---

## 总结

### 新方案的优势

1. ✅ **服务端存储** - 配置保存在数据库，跨设备同步
2. ✅ **相册级配置** - 每个相册可以有独特的视觉风格
3. ✅ **用户偏好** - 访客可以覆盖部分配置
4. ✅ **优先级清晰** - 用户偏好 > 相册配置 > 系统默认
5. ✅ **URL 分享** - 仍支持 URL 参数临时覆盖
6. ✅ **向后兼容** - 如果没有服务端配置，回退到默认

### 实现清单

**后端**:
- [ ] 创建 `gallery_viewer_config` 表
- [ ] 实现 `GalleryViewerConfig` 领域对象
- [ ] 实现 `GalleryViewerConfigRepository`
- [ ] 实现 `GalleryViewerConfigFacade`
- [ ] 添加管理端 API (`/api/galleries/{id}/viewer-config`)
- [ ] 扩展公开 API (`/api/public/g/{slug}/viewer-config`)

**前端**:
- [ ] 扩展 `ConfigManager.loadFromServer()`
- [ ] 扩展 `ConfigManager.savePreference()`
- [ ] 调整 `ViewerEngine.init()` 加载流程
- [ ] 创建管理端配置 UI (`ManageGalleryConfig.vue`)
- [ ] 创建访客偏好 UI (可选)

这样就实现了完整的多层级配置系统！
