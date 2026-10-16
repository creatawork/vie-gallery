<script setup lang="ts">
import { resolvePhotoArrangement, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
const props = defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
function setComposition(input: unknown) {
  const composition = (input as { layout: { params: { composition: 'curated' | 'spatial' } } }).layout.params.composition
  emit('patch', { layout: { mode: composition === 'curated' && !['helix', 'carousel', 'grid'].includes(props.config.layout.mode) ? 'helix' : props.config.layout.mode, params: { composition }, transition: { style: 'smooth' } } })
}
function setMode(input: unknown) {
  const mode = (input as { layout: { mode: string } }).layout.mode
  emit('patch', props.config.layout.params?.composition === 'curated'
    ? { layout: { mode, params: { arrangement: ({ helix: 'ribbon', carousel: 'arc', grid: 'wave' } as Record<string, string>)[mode] } } } : input)
}
</script>
<template>
  <section class="side-block"><h2>布局与照片</h2>
    <ConfigField path="layout.params.composition" label="观看编排" fallback="spatial" hint="逐张策展聚焦当前作品；自由漫游可拖动旋转整个空间。" :config="config" :issues="issues" :disabled="disabled" @patch="setComposition" />
    <ConfigField path="layout.mode" label="空间布局" :options="config.layout.params?.composition === 'curated' ? ['helix', 'carousel', 'grid'] : undefined" :config="config" :issues="issues" :disabled="disabled" @patch="setMode" />
    <ConfigField v-if="config.layout.params?.composition === 'curated'" path="layout.params.arrangement" label="照片编排" :fallback="resolvePhotoArrangement(config)" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-for="field in [['layout.params.scale', '照片大小'], ['layout.params.spacing', '照片间距']]" :key="field[0]" :path="field[0]!" :label="field[1]!" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="!['grid', 'random'].includes(config.layout.mode)" path="layout.params.radius" label="布局半径" :fallback="config.layout.params?.composition === 'curated' ? 340 : 500" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="config.layout.mode === 'grid' && config.layout.params?.composition !== 'curated'" path="layout.params.columns" label="每行列数" :fallback="4" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="config.layout.mode === 'helix'" path="layout.params.height" label="螺旋高度" :fallback="config.layout.params?.composition === 'curated' ? 430 : 600" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="['helix', 'spiral'].includes(config.layout.mode)" path="layout.params.turns" label="螺旋圈数" :fallback="config.layout.params?.composition === 'curated' ? 1.15 : 3" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField path="visitorAllowDownload" label="允许访客下载照片" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
  </section>
</template>
