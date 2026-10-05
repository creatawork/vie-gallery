<script setup lang="ts">
import { VIEWER_PRESETS, isViewerPreset, type ViewerConfig, type PresetName } from '@vie/gallery-contracts'
defineProps<{ config: ViewerConfig; disabled: boolean }>()
const emit = defineEmits<{ preset: [name: PresetName]; reset: [] }>()
const labels: Record<PresetName, string> = { minimal: '极简空间', 'forest-dream': '森林之梦', 'starry-night': '星空夜曲', 'ocean-breeze': '海洋微风', 'sunset-glow': '日落余晖', romantic: '心动浪漫', snowfall: '冬日雪境', film: '胶片展厅' }
</script>
<template><section class="side-block"><h2>场景预设</h2><p role="status">{{ config.presetName && isViewerPreset(config.presetName) ? labels[config.presetName] : '自定义场景' }}{{ config.customized ? ' · 已自定义' : '' }}</p>
  <div class="preset-cards"><button v-for="(_preset, name) in VIEWER_PRESETS" :key="name" type="button" :disabled="disabled" :aria-pressed="config.presetName === name" @click="emit('preset', name)">{{ labels[name] }}</button></div>
  <button class="restore-preset" type="button" :disabled="disabled || !config.presetName || !isViewerPreset(config.presetName)" @click="emit('reset')">恢复当前预设</button>
</section></template>
<style scoped>
.preset-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
button { padding: .75rem; border: 1px solid #cbd5e1; border-radius: .5rem; background: #fff; color: #111827; font: inherit; font-size: .8125rem; cursor: pointer; }
button[aria-pressed=true] { border-color: #146348; background: #eaf3ee; }button:focus-visible { outline: 2px solid #146348; outline-offset: 2px; }button:disabled { opacity: .5; cursor: default; }
.restore-preset { margin-top: .75rem; width: 100%; }p { color: #475569; font-size: .8125rem; }
</style>
