<template>
  <div class="config-panel">
    <header class="panel-header">
      <h1>展示配置</h1>
      <p class="subtitle">自定义相册的视觉效果和布局</p>
    </header>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>加载配置中...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadConfig" class="retry-btn">重试</button>
    </div>

    <div v-else class="panel-content">
      <!-- 预设选择器 -->
      <section class="config-section">
        <h2>快速预设</h2>
        <PresetSelector
          :current-preset="config.presetName"
          @select="applyPreset"
        />
      </section>

      <!-- 布局设置 -->
      <section class="config-section">
        <h2>布局</h2>
        <LayoutSettings
          v-model:mode="config.layout.mode"
        />
      </section>

      <!-- 背景设置 -->
      <section class="config-section">
        <h2>背景</h2>
        <div class="form-group">
          <label>类型</label>
          <select v-model="config.background.type" class="select-input">
            <option value="gradient">渐变</option>
            <option value="sky">天空盒</option>
            <option value="image">图片</option>
            <option value="none">无</option>
          </select>
        </div>

        <!-- 渐变配置 -->
        <div v-if="config.background.type === 'gradient'" class="sub-section">
          <div class="form-group">
            <label>方向</label>
            <select v-model="config.background.gradient.direction" class="select-input">
              <option value="vertical">垂直</option>
              <option value="horizontal">水平</option>
              <option value="radial">径向</option>
            </select>
          </div>
        </div>

        <!-- 天空盒配置 -->
        <div v-if="config.background.type === 'sky'" class="sub-section">
          <div class="form-group">
            <label>主题</label>
            <select v-model="config.background.sky.theme" class="select-input">
              <option value="forest">森林</option>
              <option value="ocean">海洋</option>
              <option value="starry">星空</option>
              <option value="sunset">日落</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 粒子特效 -->
      <section class="config-section">
        <h2>粒子特效</h2>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="config.particles.enabled">
            <span>启用粒子</span>
          </label>
        </div>

        <div v-if="config.particles.enabled" class="sub-section">
          <label class="checkbox-label">
            <input type="checkbox" :checked="config.particles.types.includes('stars')" @change="toggleParticleType('stars')">
            <span>星尘</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" :checked="config.particles.types.includes('sakura')" @change="toggleParticleType('sakura')">
            <span>樱花</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" :checked="config.particles.types.includes('hearts')" @change="toggleParticleType('hearts')">
            <span>心形</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" :checked="config.particles.types.includes('snow')" @change="toggleParticleType('snow')">
            <span>雪花</span>
          </label>
        </div>
      </section>

      <!-- 后处理特效 -->
      <section class="config-section">
        <h2>后处理特效</h2>
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.effects.bloom.enabled">
          <span>辉光 (Bloom)</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.effects.fog.enabled">
          <span>雾效 (Fog)</span>
        </label>
      </section>

      <!-- 交互设置 -->
      <section class="config-section">
        <h2>交互</h2>
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.interaction.clickRipple">
          <span>点击涟漪</span>
        </label>
      </section>

      <!-- 音频设置 -->
      <section class="config-section">
        <h2>音频</h2>
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.audio.bgm.enabled">
          <span>背景音乐</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.audio.sfx.enabled">
          <span>音效</span>
        </label>
      </section>

      <!-- 操作按钮 -->
      <footer class="panel-footer">
        <button @click="preview" class="btn btn-secondary">
          预览效果
        </button>
        <button @click="reset" class="btn btn-ghost">
          恢复默认
        </button>
        <button @click="save" class="btn btn-primary" :disabled="saving">
          {{ saving ? '保存中...' : '保存配置' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRoute } from 'vue-router'
import PresetSelector from '@/components/PresetSelector.vue'
import LayoutSettings from '@/components/LayoutSettings.vue'

const route = useRoute()
const galleryId = route.params.id as string

const loading = ref(true)
const saving = ref(false)
const error = ref('')

// 配置对象
const config = reactive({
  presetName: null as string | null,
  layout: {
    mode: 'sphere'
  },
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#F7F5F1', '#E7E3DA'],
      direction: 'vertical'
    },
    sky: {
      theme: 'forest',
      timeOfDay: 'auto'
    }
  },
  particles: {
    enabled: false,
    types: [] as string[]
  },
  effects: {
    bloom: {
      enabled: false
    },
    fog: {
      enabled: false
    }
  },
  interaction: {
    clickRipple: true
  },
  audio: {
    bgm: {
      enabled: false
    },
    sfx: {
      enabled: true
    }
  },
  theme: {
    engine: 'custom'
  }
})

// 加载配置
async function loadConfig() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`/api/galleries/${galleryId}/viewer-config`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.configJson) {
        Object.assign(config, JSON.parse(data.configJson))
        config.presetName = data.presetName
      }
    } else if (response.status !== 404) {
      throw new Error('加载配置失败')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载配置失败'
  } finally {
    loading.value = false
  }
}

// 应用预设
async function applyPreset(presetName: string) {
  try {
    const response = await fetch(`/presets/${presetName}.json`)
    if (response.ok) {
      const preset = await response.json()
      Object.assign(config, preset)
      config.presetName = presetName
    }
  } catch (err) {
    console.error('Failed to load preset:', err)
  }
}

// 切换粒子类型
function toggleParticleType(type: string) {
  const index = config.particles.types.indexOf(type)
  if (index > -1) {
    config.particles.types.splice(index, 1)
  } else {
    config.particles.types.push(type)
  }
}

// 保存配置
async function save() {
  saving.value = true

  try {
    const response = await fetch(`/api/galleries/${galleryId}/viewer-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        configJson: JSON.stringify(config),
        presetName: config.presetName
      })
    })

    if (!response.ok) {
      throw new Error('保存失败')
    }

    alert('配置已保存')
  } catch (err) {
    alert(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

// 恢复默认
async function reset() {
  if (!confirm('确定要恢复默认配置吗？')) {
    return
  }

  try {
    const response = await fetch(`/api/galleries/${galleryId}/viewer-config`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })

    if (response.ok) {
      await loadConfig()
      alert('已恢复默认配置')
    }
  } catch (err) {
    alert('操作失败')
  }
}

// 预览
function preview() {
  const baseUrl = window.location.origin
  const slug = route.params.slug || 'demo'
  window.open(`${baseUrl}/g/${slug}`, '_blank')
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.config-panel {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.panel-header {
  margin-bottom: 2rem;
}

.panel-header h1 {
  font-size: 2rem;
  font-weight: 600;
  color: #1E2227;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #6B7077;
  font-size: 1rem;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #6B7077;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #E7E3DA;
  border-top-color: #3C5A78;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.retry-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #3C5A78;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.config-section {
  background: white;
  border: 1px solid #E7E3DA;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.config-section h2 {
  font-size: 1.25rem;
  font-weight: 500;
  color: #1E2227;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #1E2227;
  margin-bottom: 0.5rem;
}

.select-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #E7E3DA;
  border-radius: 4px;
  font-size: 1rem;
  background: white;
}

.checkbox-label {
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  margin-right: 0.5rem;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label span {
  font-size: 0.9375rem;
  color: #1E2227;
}

.sub-section {
  margin-top: 1rem;
  padding-left: 1.5rem;
  border-left: 2px solid #E7E3DA;
}

.panel-footer {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 2rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: #3C5A78;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2E4760;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: white;
  color: #3C5A78;
  border: 1px solid #3C5A78;
}

.btn-secondary:hover {
  background: #F7F5F1;
}

.btn-ghost {
  background: transparent;
  color: #6B7077;
}

.btn-ghost:hover {
  color: #1E2227;
  background: #F7F5F1;
}
</style>
