# M3 用户配置存储功能 - 实现完成

## 概述

已完成用户配置存储功能的后端和前端实现，支持多层级配置系统。

---

## 后端实现 ✅

### 1. 数据库迁移

**文件**: `V5__gallery_viewer_config.sql`

创建了 `gallery_viewer_config` 表：
- `id` - 配置ID
- `gallery_id` - 相册ID（唯一索引）
- `config` - JSON配置内容
- `enabled` - 是否启用
- `preset_name` - 预设名称
- `created_at/updated_at` - 时间戳

### 2. 领域对象

**文件**: `com.gallery.domain.GalleryViewerConfig`

Record 类型，包含：
- `create()` - 创建新配置
- `withUpdate()` - 更新配置
- `withEnabled()` - 切换启用状态

### 3. 应用层

#### GalleryViewerConfigRepository
- `findByGalleryId()` - 查找配置
- `save()` - 保存配置
- `deleteByGalleryId()` - 删除配置

#### GalleryViewerConfigFacade
- `getPublicConfig(slug)` - 公开API，获取相册配置
- `getConfig(galleryId)` - 管理端，获取配置
- `saveConfig()` - 保存配置（验证所有权）
- `deleteConfig()` - 删除配置
- `toggleConfig()` - 启用/禁用

### 4. 基础设施层

**MyBatisGalleryViewerConfigRepository** + **GalleryViewerConfigMapper**

实现了完整的 CRUD 操作，使用 MyBatis 注解。

### 5. API 层

#### GalleryViewerConfigController (管理端)
- `GET /api/galleries/{galleryId}/viewer-config` - 获取配置
- `PUT /api/galleries/{galleryId}/viewer-config` - 保存配置
- `DELETE /api/galleries/{galleryId}/viewer-config` - 删除配置
- `PATCH /api/galleries/{galleryId}/viewer-config/toggle` - 切换启用

#### PublicGalleryController (扩展)
- `GET /api/public/g/{slug}/viewer-config` - 获取相册的公开配置

### 6. 配置

**M3ShareLinkConfig** 添加了 `GalleryViewerConfigFacade` Bean。

---

## 前端实现 ✅

### 1. ConfigManager 扩展

**新增属性**:
- `serverConfig` - 服务端配置缓存
- `PREFERENCE_KEY` - 用户偏好存储键

**新增方法**:

```typescript
// 从服务端加载配置
async loadFromServer(slug: string): Promise<ViewerConfig>

// 保存用户偏好（覆盖服务端配置）
savePreference(preference: Partial<ViewerConfig>): void

// 加载用户偏好
private loadPreferenceFromStorage(): Partial<ViewerConfig>

// 清除用户偏好
clearPreference(): void
```

**配置合并顺序**:
1. 系统默认 (DEFAULT_CONFIG)
2. 服务端配置 (loadFromServer)
3. 用户偏好 (localStorage)
4. URL 参数 (最高优先级)

**修改的方法**:
- `constructor()` - 移除了自动 localStorage 加载
- `updateConfig()` - 不再自动保存
- `reset()` - 清除服务端配置和用户偏好
- `loadPreset()` / `importConfig()` - 不再自动保存

### 2. ViewerEngine 扩展

**修改的方法**:

```typescript
async init(slug?: string): Promise<void>
```

- 接受可选的 `slug` 参数
- 如果提供 slug，会自动调用 `configManager.loadFromServer(slug)`
- 加载顺序：服务端配置 → URL参数 → 设备自适应

---

## 使用示例

### 后端：保存相册配置

```bash
# 管理端保存配置
PUT /api/galleries/{galleryId}/viewer-config
Authorization: Bearer <token>

{
  "configJson": "{\"layout\":{\"mode\":\"grid\"},\"background\":{\"type\":\"sky\"}}",
  "presetName": "forest-dream"
}
```

### 前端：加载和使用配置

```typescript
import { ViewerEngine } from '@/core/ViewerEngine'

// 创建引擎
const engine = new ViewerEngine(canvas)

// 初始化时传入 slug，自动从服务端加载配置
await engine.init('my-gallery-slug')

// 用户可以调整偏好（覆盖服务端配置）
engine.getConfigManager().savePreference({
  audio: { bgm: { enabled: false } }  // 关闭背景音乐
})

// 清除用户偏好，恢复相册所有者的配置
engine.getConfigManager().clearPreference()
```

---

## 配置优先级示例

### 场景 1：完整配置链

```
1. 系统默认
   layout = "sphere"
   particles = false

2. 服务端配置（相册所有者设定）
   layout = "grid"
   particles = true
   theme = "forest"

3. 用户偏好（访客本地设置）
   audio.bgm = false

4. URL 参数
   layout = "helix"

最终配置：
- layout = "helix" (URL 覆盖)
- particles = true (来自服务端)
- theme = "forest" (来自服务端)
- audio.bgm = false (用户偏好)
```

### 场景 2：无服务端配置

```
1. 系统默认
   layout = "sphere"
   
2. 服务端配置 (无)

3. 用户偏好
   layout = "grid"

最终配置：
- layout = "grid" (用户偏好)
- 其他使用默认值
```

---

## 核心优势

1. ✅ **服务端存储** - 配置保存在数据库，跨设备同步
2. ✅ **相册级配置** - 每个相册可以有独特的视觉风格
3. ✅ **用户偏好** - 访客可以覆盖部分配置（仅本地）
4. ✅ **优先级清晰** - URL > 用户偏好 > 相册配置 > 系统默认
5. ✅ **向后兼容** - 如果没有服务端配置，回退到默认
6. ✅ **权限控制** - 管理端验证所有权，公开端只读

---

## 下一步

现在配置存储功能已经完整实现，可以：

1. **创建配置面板 UI** - 管理端配置页面（Vue组件）
2. **迁移 vie-mei 插件** - 将视觉特效封装为插件
3. **创建预设配置** - 预定义风格（森林之梦、星空夜曲等）
4. **测试集成** - 端到端测试配置加载和保存

---

**实现日期**: 2026-09-03  
**状态**: 后端 ✅ | 前端 ✅ | 测试 ⏳
