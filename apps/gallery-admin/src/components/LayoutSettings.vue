<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  mode: string
}>()

defineEmits<{
  'update:mode': [mode: string]
}>()

const layouts = [
  {
    mode: 'sphere',
    label: '球面漫游',
    description: 'Fibonacci 黄金分割全景星盘，法线对齐与包围感',
    iconName: 'cube'
  },
  {
    mode: 'carousel',
    label: '3D 剧场环幕',
    description: '圆柱环幕立体展陈，微波浪起伏与聚焦内倾',
    iconName: 'gallery'
  },
  {
    mode: 'helix',
    label: '立体双螺旋',
    description: 'DNA 双螺旋纵深上升，阶梯时序流动美感',
    iconName: 'sliders'
  },
  {
    mode: 'grid',
    label: '波浪画廊墙',
    description: '双向正弦曲面画廊墙，现代艺术展厅震撼排布',
    iconName: 'grid'
  },
  {
    mode: 'spiral',
    label: '银河旋臂',
    description: '对数旋臂星轨，厚度起伏与宇宙星云漫游',
    iconName: 'sparkles'
  },
  {
    mode: 'random',
    label: '自由引力',
    description: '引力星团自然悬浮，随性漂浮的流光卡片',
    iconName: 'globe'
  }
]
</script>

<template>
  <div class="layout-settings">
    <div class="layout-grid">
      <button
        v-for="layout in layouts"
        :key="layout.mode"
        type="button"
        class="layout-option"
        :class="{ active: mode === layout.mode }"
        @click="$emit('update:mode', layout.mode)"
      >
        <div class="layout-icon-circle">
          <Icon :name="layout.iconName" :size="22" />
        </div>
        <div class="layout-content">
          <span class="layout-label">{{ layout.label }}</span>
          <span class="layout-desc">{{ layout.description }}</span>
        </div>
        <div v-if="mode === layout.mode" class="check-mark">
          <Icon name="check" :size="16" />
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.layout-settings {
  width: 100%;
}

.layout-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.layout-option {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.2s var(--ease-spring);
  text-align: left;
  box-shadow: var(--shadow-xs);
  position: relative;
}

.layout-option:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.layout-option.active {
  border-color: #10b981;
  background: #f0fdf4;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25), var(--shadow-sm);
}

.layout-icon-circle {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #f1f5f3;
  color: #334155;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.layout-option.active .layout-icon-circle {
  background: #10b981;
  color: #ffffff;
}

.layout-content {
  flex: 1;
  min-width: 0;
}

.layout-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.layout-desc {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.check-mark {
  color: #059669;
}
</style>
