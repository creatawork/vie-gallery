<script setup lang="ts">
import { SCENE_PRESETS, VIEWER_PRESETS, isViewerPreset, sceneBackgroundUrl, type ViewerConfig, type PresetName } from '@vie/gallery-contracts'
defineProps<{ config: ViewerConfig; disabled: boolean }>()
const emit = defineEmits<{ preset: [name: PresetName]; reset: [] }>()
const labels: Record<PresetName, string> = Object.fromEntries(SCENE_PRESETS.map(item => [item.name, item.label])) as Record<PresetName, string>
</script>
<template><section class="side-block"><h2>场景预设</h2><p role="status">{{ config.presetName && isViewerPreset(config.presetName) ? labels[config.presetName] : '自定义场景' }}{{ config.customized ? ' · 已自定义' : '' }}</p>
  <div class="preset-cards"><button v-for="(_preset, name) in VIEWER_PRESETS" :key="name" class="preset-card" type="button" :disabled="disabled" :aria-pressed="config.presetName === name" @click="emit('preset', name)"><span class="preset-image"><img :src="sceneBackgroundUrl(name)" :alt="`${labels[name]}背景`" loading="lazy"></span><span class="preset-copy"><strong>{{ labels[name] }}</strong><small>{{ SCENE_PRESETS.find(item => item.name === name)?.hint }}</small></span><span v-if="config.presetName === name" class="preset-check" aria-hidden="true">✓</span></button></div>
  <button class="restore-preset" type="button" :disabled="disabled || !config.presetName || !isViewerPreset(config.presetName)" @click="emit('reset')">恢复当前预设</button>
</section></template>
<style scoped>
.preset-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .625rem; }
button { border: 1px solid #d7e1e9; border-radius: .75rem; background: #fff; color: #17212b; font: inherit; cursor: pointer; overflow: hidden; text-align: left; transition: border-color .2s, transform .2s, box-shadow .2s; }
button:hover:not(:disabled) { border-color: #2a9274; transform: translateY(-1px); box-shadow: 0 6px 16px rgb(20 99 72 / 12%); }
button[aria-pressed=true] { border-color: #168260; box-shadow: 0 0 0 2px rgb(22 130 96 / 14%); }button:focus-visible { outline: 2px solid #146348; outline-offset: 2px; }button:disabled { opacity: .5; cursor: default; }
.preset-image { display: block; aspect-ratio: 1.8; background: #dce7e1; }.preset-image img { display: block; width: 100%; height: 100%; object-fit: cover; }.preset-copy { display: grid; gap: .2rem; padding: .55rem .65rem .65rem; }.preset-copy strong { font-size: .82rem; }.preset-copy small { color: #64748b; font-size: .68rem; }.preset-card { position: relative; }.preset-check { position: absolute; right: .45rem; top: .45rem; display: grid; width: 1.35rem; height: 1.35rem; place-items: center; border-radius: 50%; background: #168260; color: #fff; font-size: .75rem; }
.restore-preset { margin-top: .75rem; width: 100%; }p { color: #475569; font-size: .8125rem; }
</style>
