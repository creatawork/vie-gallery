<script setup lang="ts">
import type { ViewerConfig, ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
</script>
<template>
  <section class="side-block"><h2>布局与照片</h2>
    <ConfigField v-for="field in [['layout.mode', '空间布局'], ['layout.params.scale', '照片大小'], ['layout.params.spacing', '照片间距']]" :key="field[0]" :path="field[0]!" :label="field[1]!" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="!['grid', 'random'].includes(config.layout.mode)" path="layout.params.radius" label="布局半径" :fallback="500" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="config.layout.mode === 'grid'" path="layout.params.columns" label="每行列数" :fallback="4" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="config.layout.mode === 'helix'" path="layout.params.height" label="螺旋高度" :fallback="600" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="['helix', 'spiral'].includes(config.layout.mode)" path="layout.params.turns" label="螺旋圈数" :fallback="3" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField path="visitorAllowDownload" label="允许访客下载照片" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
  </section>
</template>
