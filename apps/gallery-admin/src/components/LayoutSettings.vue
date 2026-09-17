<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  mode: string
  disabled?: boolean
}>()

defineEmits<{
  'update:mode': [mode: string]
}>()

const layouts = [
  {
    mode: 'sphere',
    label: '球面漫游',
    description: 'Fibonacci 黄金分割全景星盘，法线对齐与包围感',
    iconName: 'cube',
    color: '#6366f1'
  },
  {
    mode: 'carousel',
    label: '3D 剧场环幕',
    description: '圆柱环幕立体展陈，微波浪起伏与聚焦内倾',
    iconName: 'gallery',
    color: '#0284c7'
  },
  {
    mode: 'helix',
    label: '立体双螺旋',
    description: 'DNA 双螺旋纵深上升，阶梯时序流动美感',
    iconName: 'sliders',
    color: '#8b5cf6'
  },
  {
    mode: 'grid',
    label: '波浪画廊墙',
    description: '双向正弦曲面画廊墙，现代艺术展厅震撼排布',
    iconName: 'grid',
    color: '#ea580c'
  },
  {
    mode: 'spiral',
    label: '银河旋臂',
    description: '对数旋臂星轨，厚度起伏与宇宙星云漫游',
    iconName: 'sparkles',
    color: '#10b981'
  },
  {
    mode: 'random',
    label: '自由引力',
    description: '引力星团自然悬浮，随性漂浮的流光卡片',
    iconName: 'globe',
    color: '#ec4899'
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
        :disabled="disabled"
        @click="$emit('update:mode', layout.mode)"
      >
        <div class="layout-icon-circle" :style="{ '--layout-color': layout.color }">
          <Icon :name="layout.iconName" :size="20" />
        </div>
        <div class="layout-content">
          <span class="layout-label">{{ layout.label }}</span>
          <span class="layout-desc">{{ layout.description }}</span>
        </div>
        <div v-if="mode === layout.mode" class="check-mark">
          <Icon name="check" :size="16" stroke-width="2.5" />
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.layout-settings { width: 100%; }
.layout-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.layout-option {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  border-radius: 16px;
  cursor: pointer;
  text-align: center;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.8);
  transition: all 0.22s ease;
}
.layout-option:hover {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.1);
}
.layout-option.is-active,
.layout-option.active {
  border-color: rgba(16, 185, 129, 0.45);
  background: rgba(236, 253, 245, 0.9);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
}
.layout-icon-circle {
  width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center;
  color: #047857; background: linear-gradient(135deg, #ecfdf5, #d1fae5);
}
.layout-option.is-active .layout-icon-circle,
.layout-option.active .layout-icon-circle {
  color: #fff; background: linear-gradient(135deg, #34d399, #059669);
}
.layout-content { display: flex; flex-direction: column; gap: 4px; }
.layout-label { font-size: 13px; font-weight: 700; color: #0f172a; }
.layout-desc { font-size: 11.5px; color: var(--text-tertiary); }
.check-mark {
  position: absolute; top: 8px; right: 8px; color: #059669; font-size: 12px; font-weight: 800;
}
</style>
