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
.layout-settings {
  width: 100%;
}

.layout-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.layout-option {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  background: #ffffff;
  border: 1.5px solid rgba(226, 232, 240, 0.85);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  box-shadow: 
    0 2px 8px rgba(15, 23, 42, 0.03),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset;
  position: relative;
}

.layout-option:hover {
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-3px) scale(1.01);
  box-shadow: 
    0 12px 24px -4px rgba(15, 23, 42, 0.06),
    0 4px 12px rgba(16, 185, 129, 0.08);
}

.layout-option.active {
  border-color: rgba(16, 185, 129, 0.45);
  background: linear-gradient(145deg, #ffffff 0%, #f0fdf4 100%);
  box-shadow: 
    0 0 0 2.5px rgba(16, 185, 129, 0.2),
    0 8px 20px rgba(16, 185, 129, 0.12);
}

.layout-icon-circle {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.8);
  color: var(--layout-color, #334155);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.layout-option:hover .layout-icon-circle {
  transform: scale(1.1) rotate(6deg);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.layout-option.active .layout-icon-circle {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
}

.layout-content {
  flex: 1;
  min-width: 0;
}

.layout-label {
  display: block;
  font-size: 14.5px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
  letter-spacing: -0.01em;
  transition: color 0.2s ease;
}

.layout-option:hover .layout-label {
  color: #059669;
}

.layout-option.active .layout-label {
  color: #047857;
}

.layout-desc {
  display: block;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

.check-mark {
  color: #059669;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding-top: 2px;
}
</style>
