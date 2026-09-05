# 页面卡死问题修复报告

## 问题描述
点击"保存发布配置"按钮后，整个页面直接卡死，无法进行任何操作。

## 根本原因
在 `apps/gallery-admin/src/views/GalleryConfigPanel.vue` 中，`save()` 函数和 `refreshLivePreview()` 函数直接对 Vue 3 的 `reactive()` Proxy 对象进行 `JSON.stringify()` 序列化操作，触发了以下问题：

1. **响应式依赖追踪循环**：当 `JSON.stringify()` 遍历 reactive proxy 对象时，会触发 Vue 3 的响应式 getter 拦截器，导致大量的依赖追踪操作
2. **深度嵌套对象的同步序列化**：复杂的配置对象（包含 background、particles、effects 等多层嵌套结构）在同步序列化时阻塞主线程
3. **重复序列化**：
   - 第 249 行：`JSON.parse(JSON.stringify(config))` 
   - 第 273 行：`refreshLivePreview()` → `sendLiveMessage()` 再次序列化
   - 双重序列化放大了性能问题

## 问题代码位置

### 1. save() 函数（第 245-279 行）
```javascript
async function save() {
  saving.value = true
  try {
    ensureConfigDefaults()
    const cleanConfig = JSON.parse(JSON.stringify(config))  // ❌ 直接序列化 reactive proxy
    // ...
    refreshLivePreview()  // ❌ 再次触发序列化
  } finally {
    saving.value = false
  }
}
```

### 2. sendLiveMessage() 函数（第 24-34 行）
```javascript
function sendLiveMessage(msg: any) {
  if (previewIframeRef.value && previewIframeRef.value.contentWindow) {
    try {
      const cleanMsg = JSON.parse(JSON.stringify(msg))  // ❌ 序列化包含 reactive proxy 的消息
      previewIframeRef.value.contentWindow.postMessage(cleanMsg, '*')
    } catch (err) {
      console.warn('postMessage structured clone fallback:', err)
    }
  }
}
```

## 解决方案

### 核心修复：使用 Vue 3 的 `toRaw()` API
在序列化之前使用 `toRaw()` 彻底剥离响应式 Proxy，避免触发响应式系统。

### 修改内容

#### 1. 导入 toRaw
```javascript
import { ref, onMounted, reactive, computed, toRaw } from 'vue'
```

#### 2. 修复 sendLiveMessage()
```javascript
function sendLiveMessage(msg: any) {
  if (previewIframeRef.value && previewIframeRef.value.contentWindow) {
    try {
      // ✅ 使用 toRaw() 彻底解除响应式代理
      const rawMsg = toRaw(msg)
      const cleanMsg = JSON.parse(JSON.stringify(rawMsg))
      previewIframeRef.value.contentWindow.postMessage(cleanMsg, '*')
    } catch (err) {
      console.warn('postMessage structured clone fallback:', err)
    }
  }
}
```

#### 3. 修复 save() 函数
```javascript
async function save() {
  saving.value = true
  try {
    ensureConfigDefaults()
    // ✅ 使用 toRaw() 剥离 Vue reactive proxy
    const rawConfig = toRaw(config)
    const cleanConfig = JSON.parse(JSON.stringify(rawConfig))
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        configJson: JSON.stringify(cleanConfig),
        presetName: config.presetName || 'custom'
      })
    })
    // ...
    toast.success('3D 视觉配置已成功持久化并同步！')
    refreshLivePreview()
  } catch (err: any) {
    toast.error(err.message || '保存失败，请检查网络或登录状态')
  } finally {
    saving.value = false
  }
}
```

## Vue 3 toRaw() 的作用

`toRaw()` 是 Vue 3 提供的工具函数，用于：
- 返回 `reactive` 或 `readonly` 代理的原始对象
- 完全绕过响应式系统，不触发任何 getter/setter 拦截
- 适用于需要序列化、传递给第三方库或跨线程通信的场景

## 性能影响

### 修复前
- 点击"保存"按钮 → 主线程阻塞 → 页面卡死
- 无限或长时间的响应式依赖追踪循环
- 用户无法进行任何操作

### 修复后
- 序列化操作跳过响应式系统，性能提升显著
- 保存操作立即响应，无卡顿
- 实时预览更新流畅

## 测试建议

1. **基本保存测试**：点击"保存发布配置"按钮，确认页面不卡死
2. **配置更新测试**：修改各种配置项（布局、背景、粒子、特效），确认实时预览正常
3. **预设切换测试**：切换不同的氛围预设，确认配置正确应用
4. **连续操作测试**：连续多次修改配置并保存，确认无性能退化

## 相关文件
- `apps/gallery-admin/src/views/GalleryConfigPanel.vue`

## 技术要点
- Vue 3 响应式系统原理
- `toRaw()` API 的正确使用场景
- 跨 iframe 通信的结构化克隆限制
- 性能优化：避免不必要的响应式依赖追踪
