<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  currentPreset?: string | null
}>()

defineEmits<{
  select: [presetName: string]
}>()

const presets = [
  {
    name: 'minimal',
    label: '极简空间',
    description: '通透白净 · 经典光影 · 纯粹画廊',
    tag: 'Minimal',
    gradient: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    textColor: '#1e293b'
  },
  {
    name: 'forest-dream',
    label: '森林之梦',
    description: '暮色森林 · 樱花与星尘 · 浪漫氛围',
    tag: 'Atmospheric',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #d1fae5 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'starry-night',
    label: '星空夜曲',
    description: '深邃宇宙 · 辉光星尘 · 3D球形曲面',
    tag: 'Cosmic 3D',
    gradient: 'linear-gradient(135deg, #090d16 0%, #1e1b4b 60%, #4338ca 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'ocean-breeze',
    label: '海洋微风',
    description: '蔚蓝天穹 · 晨曦微雾 · 银河螺旋',
    tag: 'Ethereal',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 60%, #bae6fd 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'sunset-glow',
    label: '日落余晖',
    description: '晚霞云彩 · 梦幻泛光 · 规律网格墙',
    tag: 'Warm Glow',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #fed7aa 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'romantic',
    label: '心动浪漫',
    description: '玫瑰粉雾 · 粒子心形 · 柔和光晕',
    tag: 'Heartbeat',
    gradient: 'linear-gradient(135deg, #831843 0%, #db2777 50%, #fce7f3 100%)',
    textColor: '#ffffff'
  }
]
</script>

<template>
  <div class="preset-selector">
    <div class="preset-grid">
      <button
        v-for="preset in presets"
        :key="preset.name"
        type="button"
        class="preset-card"
        :class="{ active: currentPreset === preset.name }"
        @click="$emit('select', preset.name)"
      >
        <div class="preset-preview" :style="{ background: preset.gradient }">
          <span class="preset-tag">{{ preset.tag }}</span>
          <div v-if="currentPreset === preset.name" class="active-badge">
            <Icon name="check" :size="14" />
          </div>
        </div>
        <div class="preset-info">
          <h4>{{ preset.label }}</h4>
          <p>{{ preset.description }}</p>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.preset-selector {
  width: 100%;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}

.preset-card {
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0;
  cursor: pointer;
  transition: all 0.2s var(--ease-spring);
  overflow: hidden;
  text-align: left;
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
}

.preset-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.preset-card.active {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3), var(--shadow-sm);
}

.preset-preview {
  position: relative;
  height: 90px;
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px;
}

.preset-tag {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.3);
  color: #ffffff;
  padding: 2px 7px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}

.active-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #10b981;
  color: #ffffff;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.preset-info {
  padding: 12px 14px;
}

.preset-info h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.preset-info p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
}
</style>
