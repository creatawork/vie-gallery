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
.preset-selector {
  width: 100%;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 16px;
}

/* ==========================================
   Ultra-Modern Clean Card Architecture
   ========================================== */
.preset-card {
  position: relative;
  background: #ffffff;
  border: 1.5px solid rgba(226, 232, 240, 0.85);
  border-radius: 16px;
  padding: 18px 20px 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  box-shadow: 
    0 2px 8px rgba(15, 23, 42, 0.03),
    0 0 0 1px rgba(255, 255, 255, 0.9) inset;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.preset-card:hover {
  transform: translateY(-3px) scale(1.008);
  border-color: var(--accent-color);
  box-shadow: 
    0 12px 24px -4px rgba(15, 23, 42, 0.08),
    0 4px 12px rgba(16, 185, 129, 0.06);
}

.preset-card.active {
  border-color: #10b981;
  background: linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%);
  box-shadow: 
    0 0 0 2px rgba(16, 185, 129, 0.35),
    0 10px 24px rgba(16, 185, 129, 0.12);
}

/* ==========================================
   Top Header Row: Icon + Swatch + Category
   ========================================== */
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preset-icon-badge {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--accent-bg);
  color: var(--accent-color);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.25s ease;
}

.preset-card:hover .preset-icon-badge {
  transform: scale(1.08) rotate(4deg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.preset-card.active .preset-icon-badge {
  background: #10b981;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
}

.header-right-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Swatch Dots */
.palette-swatch {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 12px;
}

.swatch-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.category-pill {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #475569;
  background: #f1f5f9;
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid rgba(203, 213, 225, 0.5);
  text-transform: uppercase;
}

.preset-card.active .category-pill {
  color: #047857;
  background: #d1fae5;
  border-color: rgba(16, 185, 129, 0.3);
}

/* ==========================================
   Title & Subtitle
   ========================================== */
.card-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.main-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title-group h4 {
  font-size: 16px;
  font-weight: 750;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin: 0;
  transition: color 0.2s ease;
}

.preset-card:hover h4 {
  color: var(--accent-color);
}

.preset-card.active h4 {
  color: #047857;
}

.en-subtitle {
  font-size: 11.5px;
  color: #94a3b8;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.active-indicator-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: #10b981;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
}

/* ==========================================
   Feature Tags Container
   ========================================== */
.tags-container {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.feature-tag {
  font-size: 11.5px;
  font-weight: 550;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.85);
  padding: 3px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.preset-card:hover .feature-tag {
  background: #ffffff;
  border-color: rgba(203, 213, 225, 0.9);
  color: #334155;
}

.preset-card.active .feature-tag {
  background: rgba(255, 255, 255, 0.9);
  color: #047857;
  border-color: rgba(16, 185, 129, 0.25);
}

/* ==========================================
   Bottom Spectrum Line
   ========================================== */
.spectrum-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(226, 232, 240, 0.4);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
}

.spectrum-bar-fill {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  opacity: 0.7;
  transition: opacity 0.25s ease;
}

.preset-card:hover .spectrum-bar-fill {
  opacity: 1;
}

.preset-card.active .spectrum-bar-fill {
  opacity: 1;
}
</style>
