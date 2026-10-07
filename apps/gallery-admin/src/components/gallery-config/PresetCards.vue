<script setup lang="ts">
import { RECOMMENDED_SCENE_PRESET, SCENE_PRESETS, VIEWER_PRESETS, isViewerPreset, sceneBackgroundThumbUrl, type ViewerConfig, type PresetName } from '@vie/gallery-contracts'
defineProps<{ config: ViewerConfig; disabled: boolean }>()
const emit = defineEmits<{ preset: [name: PresetName]; reset: [] }>()
const labels: Record<PresetName, string> = Object.fromEntries(SCENE_PRESETS.map(item => [item.name, item.label])) as Record<PresetName, string>
</script>
<template><section class="side-block"><h2>场景预设</h2><p role="status">{{ config.presetName && isViewerPreset(config.presetName) ? labels[config.presetName] : '自定义场景' }}{{ config.customized ? ' · 已自定义' : '' }}</p>
  <div class="preset-cards"><button v-for="(_preset, name) in VIEWER_PRESETS" :key="name" class="preset-card" type="button" :disabled="disabled" :aria-pressed="config.presetName === name" @click="emit('preset', name)"><span class="preset-image"><img :src="sceneBackgroundThumbUrl(name)" :alt="`${labels[name]}背景`" loading="lazy"></span><span class="preset-copy"><strong>{{ labels[name] }}</strong><small>{{ SCENE_PRESETS.find(item => item.name === name)?.hint }}</small></span><span v-if="name === RECOMMENDED_SCENE_PRESET" class="preset-recommend">推荐</span><span v-if="config.presetName === name" class="preset-check" aria-hidden="true">✓</span></button></div>
  <button class="restore-preset" type="button" :disabled="disabled || !config.presetName || !isViewerPreset(config.presetName)" @click="emit('reset')">恢复当前预设</button>
</section></template>
<style scoped>
.preset-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.preset-card { position: relative; border: 1px solid #d7e1e9; border-radius: 14px; background: #fff; color: #17212b; font: inherit; cursor: pointer; overflow: hidden; text-align: left; transition: border-color .2s, transform .2s, box-shadow .2s; }
.preset-card:hover:not(:disabled) { border-color: #75ab91; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(20, 99, 72, .12); }
.preset-card[aria-pressed="true"] { border-color: #168260; box-shadow: 0 0 0 2px rgba(22, 130, 96, .14); }
.preset-card:focus-visible { outline: 2px solid #146348; outline-offset: 2px; }
.preset-card:disabled { opacity: .5; cursor: default; }
.preset-image { position: relative; display: block; height: 72px; background: #dce7df; overflow: hidden; }
.preset-image img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .2s; }
.preset-card:hover:not(:disabled) .preset-image img { transform: scale(1.05); }
.preset-copy { display: grid; gap: .2rem; padding: 9px; }
.preset-copy strong { display: block; font-size: 12.5px; color: #111827; }
.preset-copy small { color: #6a7c71; font-size: 11px; }
.preset-check { position: absolute; top: 7px; right: 7px; display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #146e4e; border: 1px solid rgba(255, 255, 255, .69); color: #fff; font-size: 12px; }
.preset-recommend { position: absolute; top: 7px; left: 7px; z-index: 1; padding: 2px 7px; border-radius: 999px; background: #146e4e; color: #fff; font-size: 10.5px; font-weight: 650; letter-spacing: .02em; }
.restore-preset { margin-top: .75rem; width: 100%; min-height: 36px; border: 1px solid #d7e1e9; border-radius: 10px; background: #fff; color: #334f42; font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; transition: border-color .2s; }
.restore-preset:hover:not(:disabled) { border-color: #75ab91; }
.restore-preset:focus-visible { outline: 2px solid #146348; outline-offset: 2px; }
.restore-preset:disabled { opacity: .5; cursor: default; }
p { color: #475569; font-size: .8125rem; }
@media (prefers-reduced-motion: reduce) { .preset-image img { transition: none; } }
</style>
