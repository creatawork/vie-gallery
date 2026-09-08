<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  currentPreset?: string | null
  disabled?: boolean
}>()

defineEmits<{
  select: [presetName: string]
}>()

const presets = [
  {
    name: 'minimal',
    label: '极简空间',
    enLabel: 'Pure Minimal Studio',
    tags: ['通透白净', '经典光影', '纯粹画廊'],
    category: 'Minimalist',
    accentColor: '#475569',
    accentBg: '#f1f5f9',
    iconName: 'gallery',
    gradient: 'linear-gradient(90deg, #94a3b8 0%, #cbd5e1 50%, #f1f5f9 100%)',
    palette: ['#475569', '#94a3b8', '#e2e8f0']
  },
  {
    name: 'forest-dream',
    label: '森林之梦',
    enLabel: 'Atmospheric Forest',
    tags: ['暮色森林', '樱花微尘', '景深雾效'],
    category: 'Atmospheric',
    accentColor: '#059669',
    accentBg: '#ecfdf5',
    iconName: 'sparkles',
    gradient: 'linear-gradient(90deg, #065f46 0%, #10b981 50%, #6ee7b7 100%)',
    palette: ['#065f46', '#10b981', '#a7f3d0']
  },
  {
    name: 'starry-night',
    label: '星空夜曲',
    enLabel: 'Cosmic 3D Space',
    tags: ['深邃宇宙', '辉光星尘', '球形曲面'],
    category: 'Cosmic 3D',
    accentColor: '#6366f1',
    accentBg: '#eef2ff',
    iconName: 'cube',
    gradient: 'linear-gradient(90deg, #312e81 0%, #6366f1 50%, #a5b4fc 100%)',
    palette: ['#1e1b4b', '#6366f1', '#c7d2fe']
  },
  {
    name: 'ocean-breeze',
    label: '海洋微风',
    enLabel: 'Ethereal Azure Sky',
    tags: ['蔚蓝天穹', '晨曦微雾', '银河螺旋'],
    category: 'Ethereal',
    accentColor: '#0284c7',
    accentBg: '#f0f9ff',
    iconName: 'globe',
    gradient: 'linear-gradient(90deg, #0369a1 0%, #0ea5e9 50%, #7dd3fc 100%)',
    palette: ['#075985', '#0284c7', '#bae6fd']
  },
  {
    name: 'sunset-glow',
    label: '日落余晖',
    enLabel: 'Warm Twilight Glow',
    tags: ['晚霞云彩', '梦幻泛光', '规律网格'],
    category: 'Warm Glow',
    accentColor: '#ea580c',
    accentBg: '#fff7ed',
    iconName: 'grid',
    gradient: 'linear-gradient(90deg, #9a3412 0%, #f97316 50%, #fdba74 100%)',
    palette: ['#7c2d12', '#ea580c', '#fed7aa']
  },
  {
    name: 'romantic',
    label: '心动浪漫',
    enLabel: 'Rose Quartz Aura',
    tags: ['玫瑰粉雾', '心形粒子', '柔和光晕'],
    category: 'Heartbeat',
    accentColor: '#db2777',
    accentBg: '#fdf2f8',
    iconName: 'star',
    gradient: 'linear-gradient(90deg, #9d174d 0%, #ec4899 50%, #f472b6 100%)',
    palette: ['#831843', '#db2777', '#fbcfe8']
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
        :disabled="disabled"
        :style="{
          '--accent-color': preset.accentColor,
          '--accent-bg': preset.accentBg
        }"
        @click="$emit('select', preset.name)"
      >
        <!-- Top Bar: Icon Box + Category Pill & Swatch Dots -->
        <div class="card-header-row">
          <div class="preset-icon-badge">
            <Icon :name="preset.iconName" :size="20" />
          </div>

          <div class="header-right-meta">
            <!-- Palette Swatch Dots -->
            <div class="palette-swatch" title="色彩梯度预览">
              <span
                v-for="(color, cIdx) in preset.palette"
                :key="cIdx"
                class="swatch-dot"
                :style="{ background: color }"
              ></span>
            </div>

            <!-- Category Tag -->
            <span class="category-pill">{{ preset.category }}</span>
          </div>
        </div>

        <!-- Middle: Title & Subtitle -->
        <div class="card-title-group">
          <div class="main-title-row">
            <h4>{{ preset.label }}</h4>
            <div v-if="currentPreset === preset.name" class="active-indicator-tag">
              <Icon name="check" :size="12" stroke-width="3" />
              <span>当前使用</span>
            </div>
          </div>
          <span class="en-subtitle">{{ preset.enLabel }}</span>
        </div>

        <!-- Tags Row: Clean Frosted Pills -->
        <div class="tags-container">
          <span
            v-for="(tag, tIdx) in preset.tags"
            :key="tIdx"
            class="feature-tag"
          >
            {{ tag }}
          </span>
        </div>

        <!-- Bottom Spectrum Line -->
        <div class="spectrum-bar-track">
          <div class="spectrum-bar-fill" :style="{ background: preset.gradient }"></div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.preset-selector { width: 100%; }
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.preset-card {
  position: relative;
  padding: 14px;
  border-radius: 16px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 4px 14px rgba(14, 41, 32, 0.04);
  transition: all 0.22s ease;
}
.preset-card:hover {
  transform: translateY(-2px);
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 10px 24px rgba(16, 185, 129, 0.1);
}
.preset-card.is-active,
.preset-card.active {
  border-color: rgba(16, 185, 129, 0.45);
  background: rgba(236, 253, 245, 0.85);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15), 0 10px 24px rgba(16, 185, 129, 0.12);
}
.card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.preset-icon-badge {
  width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
  color: #047857; background: linear-gradient(135deg, #ecfdf5, #d1fae5);
}
.header-right-meta { display: flex; align-items: center; gap: 6px; }
.palette-swatch, .swatch-dot { display: flex; gap: 4px; }
.swatch-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.8); }
.category-pill {
  padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  color: #047857; background: rgba(16, 185, 129, 0.12);
}
.card-title-group { margin-top: 10px; }
.main-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.main-title-row strong { font-size: 14px; color: #0f172a; }
.en-subtitle { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.active-indicator-tag {
  font-size: 11px; font-weight: 700; color: #047857;
  padding: 2px 8px; border-radius: 999px; background: rgba(16, 185, 129, 0.14);
}
.tags-container { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.feature-tag {
  font-size: 10.5px; padding: 2px 7px; border-radius: 999px;
  color: #475569; background: rgba(241, 245, 249, 0.9);
}
.spectrum-bar-track {
  margin-top: 12px; height: 4px; border-radius: 999px; background: rgba(16, 185, 129, 0.12); overflow: hidden;
}
.spectrum-bar-fill {
  height: 100%; border-radius: inherit; background: linear-gradient(90deg, #34d399, #059669);
}
</style>
