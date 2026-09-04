<template>
  <div class="layout-settings">
    <div class="layout-grid">
      <button
        v-for="layout in layouts"
        :key="layout.mode"
        class="layout-option"
        :class="{ active: mode === layout.mode }"
        @click="$emit('update:mode', layout.mode)"
      >
        <div class="layout-icon">
          <svg :viewBox="layout.viewBox" width="60" height="60">
            <g v-html="layout.svg"></g>
          </svg>
        </div>
        <span class="layout-label">{{ layout.label }}</span>
        <span class="layout-desc">{{ layout.description }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  mode: string
}>()

defineEmits<{
  'update:mode': [mode: string]
}>()

const layouts = [
  {
    mode: 'sphere',
    label: '球形',
    description: 'Fibonacci球面',
    viewBox: '0 0 100 100',
    svg: '<circle cx="50" cy="50" r="40" fill="none" stroke="#3C5A78" stroke-width="2"/><circle cx="30" cy="30" r="3" fill="#3C5A78"/><circle cx="70" cy="35" r="3" fill="#3C5A78"/><circle cx="50" cy="50" r="3" fill="#3C5A78"/><circle cx="35" cy="70" r="3" fill="#3C5A78"/><circle cx="65" cy="65" r="3" fill="#3C5A78"/>'
  },
  {
    mode: 'helix',
    label: '螺旋',
    description: 'DNA双螺旋',
    viewBox: '0 0 100 100',
    svg: '<path d="M 20 20 Q 35 35 50 50 T 80 80" fill="none" stroke="#3C5A78" stroke-width="2"/><path d="M 80 20 Q 65 35 50 50 T 20 80" fill="none" stroke="#3C5A78" stroke-width="2"/><circle cx="20" cy="20" r="3" fill="#3C5A78"/><circle cx="50" cy="50" r="3" fill="#3C5A78"/><circle cx="80" cy="80" r="3" fill="#3C5A78"/>'
  },
  {
    mode: 'grid',
    label: '网格',
    description: '规则网格墙',
    viewBox: '0 0 100 100',
    svg: '<rect x="15" y="15" width="20" height="20" fill="none" stroke="#3C5A78" stroke-width="2"/><rect x="40" y="15" width="20" height="20" fill="none" stroke="#3C5A78" stroke-width="2"/><rect x="65" y="15" width="20" height="20" fill="none" stroke="#3C5A78" stroke-width="2"/><rect x="15" y="40" width="20" height="20" fill="none" stroke="#3C5A78" stroke-width="2"/><rect x="40" y="40" width="20" height="20" fill="none" stroke="#3C5A78" stroke-width="2"/><rect x="65" y="40" width="20" height="20" fill="none" stroke="#3C5A78" stroke-width="2"/>'
  },
  {
    mode: 'spiral',
    label: '银河',
    description: '旋臂布局',
    viewBox: '0 0 100 100',
    svg: '<path d="M 50 50 Q 60 40 70 35 T 90 30" fill="none" stroke="#3C5A78" stroke-width="2"/><path d="M 50 50 Q 40 60 35 70 T 30 90" fill="none" stroke="#3C5A78" stroke-width="2"/><circle cx="50" cy="50" r="3" fill="#3C5A78"/><circle cx="70" cy="35" r="3" fill="#3C5A78"/><circle cx="35" cy="70" r="3" fill="#3C5A78"/>'
  },
  {
    mode: 'random',
    label: '随机',
    description: '自由分散',
    viewBox: '0 0 100 100',
    svg: '<circle cx="25" cy="30" r="3" fill="#3C5A78"/><circle cx="70" cy="25" r="3" fill="#3C5A78"/><circle cx="40" cy="55" r="3" fill="#3C5A78"/><circle cx="65" cy="70" r="3" fill="#3C5A78"/><circle cx="30" cy="75" r="3" fill="#3C5A78"/><circle cx="80" cy="50" r="3" fill="#3C5A78"/>'
  }
]
</script>

<style scoped>
.layout-settings {
  width: 100%;
}

.layout-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.layout-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: white;
  border: 2px solid #E7E3DA;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.layout-option:hover {
  border-color: #3C5A78;
  transform: translateY(-2px);
}

.layout-option.active {
  border-color: #3C5A78;
  border-width: 3px;
  background: #F7F5F1;
}

.layout-icon {
  margin-bottom: 0.5rem;
}

.layout-label {
  font-size: 1rem;
  font-weight: 600;
  color: #1E2227;
  margin-bottom: 0.25rem;
}

.layout-desc {
  font-size: 0.75rem;
  color: #6B7077;
  text-align: center;
}
</style>
