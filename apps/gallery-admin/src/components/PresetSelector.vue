<template>
  <div class="preset-selector">
    <div class="preset-grid">
      <button
        v-for="preset in presets"
        :key="preset.name"
        class="preset-card"
        :class="{ active: currentPreset === preset.name }"
        @click="$emit('select', preset.name)"
      >
        <div class="preset-preview" :style="{ background: preset.gradient }"></div>
        <div class="preset-info">
          <h3>{{ preset.label }}</h3>
          <p>{{ preset.description }}</p>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  currentPreset?: string | null
}>()

defineEmits<{
  select: [presetName: string]
}>()

const presets = [
  {
    name: 'minimal',
    label: '极简模式',
    description: '干净清爽，无特效',
    gradient: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%)'
  },
  {
    name: 'forest-dream',
    label: '森林之梦',
    description: '森林天空 + 樱花飘落',
    gradient: 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)'
  },
  {
    name: 'starry-night',
    label: '星空夜曲',
    description: '星空背景 + 星尘粒子',
    gradient: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)'
  },
  {
    name: 'ocean-breeze',
    label: '海洋微风',
    description: '海洋天空 + 轻微雾效',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  {
    name: 'sunset-glow',
    label: '日落余晖',
    description: '日落天空 + 辉光效果',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
  },
  {
    name: 'romantic',
    label: '浪漫时光',
    description: '粉色渐变 + 心形粒子',
    gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
  }
]
</script>

<style scoped>
.preset-selector {
  width: 100%;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.preset-card {
  background: white;
  border: 2px solid #E7E3DA;
  border-radius: 8px;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  text-align: left;
}

.preset-card:hover {
  border-color: #3C5A78;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.preset-card.active {
  border-color: #3C5A78;
  border-width: 3px;
  box-shadow: 0 0 0 3px rgba(60, 90, 120, 0.1);
}

.preset-preview {
  height: 80px;
  width: 100%;
}

.preset-info {
  padding: 1rem;
}

.preset-info h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #1E2227;
  margin: 0 0 0.25rem 0;
}

.preset-info p {
  font-size: 0.875rem;
  color: #6B7077;
  margin: 0;
  line-height: 1.4;
}
</style>
