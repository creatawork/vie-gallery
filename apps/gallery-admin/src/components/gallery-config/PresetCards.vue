<script setup lang="ts">
import { computed, ref } from 'vue'
import { RECOMMENDED_SCENE_PRESET, VIEWER_PRESET_CARDS, VIEWER_PRESETS, isViewerPreset, sceneBackgroundThumbUrl, type ViewerConfig, type PresetName } from '@vie/gallery-contracts'
import { viewerOrigin } from '../../lib/preview'
const props = defineProps<{ config: ViewerConfig; disabled: boolean }>()
const emit = defineEmits<{ preset: [name: PresetName]; reset: [] }>()
const filter = ref('all')
const cards = computed(() => VIEWER_PRESET_CARDS.filter(card => filter.value === 'all' || card.category === filter.value))
const selected = computed(() => VIEWER_PRESET_CARDS.find(card => card.name === props.config.presetName))
function thumbnail(name: PresetName) {
  const url = sceneBackgroundThumbUrl(name)
  return url ? new URL(url, viewerOrigin()).toString() : undefined
}
function swatch(name: PresetName) {
  const bg = VIEWER_PRESETS[name].background!
  return { background: `radial-gradient(ellipse at 65% 30%, ${bg.secondaryColor}, transparent 72%), ${bg.color}` }
}
</script>
<template><section class="side-block"><h2>一键特效</h2><p role="status">{{ selected?.label ?? '自定义场景' }}{{ config.customized ? ' · 已自定义' : '' }}</p>
  <div class="preset-filters" role="group" aria-label="特效分类"><button v-for="item in [{ id: 'all', label: '全部 16' }, { id: 'light', label: '流动光影' }, { id: 'panorama', label: '全景意境' }]" :key="item.id" type="button" :aria-pressed="filter === item.id" @click="filter = item.id">{{ item.label }}</button></div>
  <div class="preset-cards"><button v-for="card in cards" :key="card.name" class="preset-card" type="button" :disabled="disabled" :aria-pressed="config.presetName === card.name" @click="emit('preset', card.name)"><span class="preset-image" :style="swatch(card.name)"><img v-if="thumbnail(card.name)" :src="thumbnail(card.name)" :alt="`${card.label}背景`" loading="lazy"><span v-else class="light-art" :class="VIEWER_PRESETS[card.name].layout.mode" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span><span class="preset-copy"><strong>{{ card.label }}</strong><small>{{ card.hint }}</small></span><span v-if="card.name === RECOMMENDED_SCENE_PRESET" class="preset-recommend">推荐</span><span v-if="config.presetName === card.name" class="preset-check" aria-hidden="true">✓</span></button></div>
  <button class="restore-preset" type="button" :disabled="disabled || !config.presetName || !isViewerPreset(config.presetName)" @click="emit('reset')">恢复当前预设</button>
</section></template>
<style scoped>
.preset-filters { display: flex; flex-wrap: wrap; gap: 5px; margin: 12px 0; }
.preset-filters button { min-height: 34px; padding: 6px 9px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--bg-surface); color: var(--text-secondary); font: inherit; font-size: 11px; cursor: pointer; }
.preset-filters button[aria-pressed="true"] { color: var(--brand-deep); background: var(--mint-soft); border-color: var(--brand-accent); }
.light-art { position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; gap: 7px; perspective: 200px; }
.light-art i { width: 21px; height: 29px; border: 1px solid #ffffff80; background: linear-gradient(145deg, #ffffff38, #ffffff09); box-shadow: 0 0 16px #ffffff16; transform: rotateY(-20deg) translateY(7px); }
.light-art i:nth-child(2) { transform: translateY(-6px) rotateY(-10deg); }
.light-art i:nth-child(3) { transform: translateY(2px) rotateY(15deg); }
.light-art i:nth-child(4) { transform: translateY(-10px) rotateY(25deg); }
.light-art.carousel i { transform: rotateY(-25deg); }.light-art.carousel i:nth-child(2), .light-art.carousel i:nth-child(3) { transform: translateY(5px); }
.preset-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.preset-card { position: relative; border: 1px solid var(--border-strong); border-radius: 12px; background: var(--bg-surface); color: var(--text-primary); font: inherit; cursor: pointer; overflow: hidden; text-align: left; transition: border-color .2s, transform .2s, box-shadow .2s; }
.preset-card:hover:not(:disabled) { border-color: #75ab91; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(20, 99, 72, .12); }
.preset-card[aria-pressed="true"] { border-color: var(--brand-accent); box-shadow: 0 0 0 2px var(--mint-soft); }
.preset-card:focus-visible { outline: 2px solid var(--brand-accent); outline-offset: 2px; }
.preset-card:disabled { opacity: .5; cursor: default; }
.preset-image { position: relative; display: block; height: 72px; background: #dce7df; overflow: hidden; }
.preset-image img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .2s; }
.preset-card:hover:not(:disabled) .preset-image img { transform: scale(1.05); }
.preset-copy { display: grid; gap: .2rem; padding: 9px; }
.preset-copy strong { display: block; font-size: 12.5px; color: var(--text-primary); }
.preset-copy small { color: var(--text-tertiary); font-size: 11px; }
.preset-check { position: absolute; top: 7px; right: 7px; display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: var(--brand-deep); border: 1px solid rgba(255, 255, 255, .69); color: var(--bg-surface); font-size: 12px; }
.preset-recommend { position: absolute; top: 7px; left: 7px; z-index: 1; padding: 2px 7px; border-radius: 999px; background: var(--brand-deep); color: var(--bg-surface); font-size: 10.5px; font-weight: 650; letter-spacing: .02em; }
.restore-preset { margin-top: .75rem; width: 100%; min-height: 36px; border: 1px solid var(--border-strong); border-radius: 10px; background: var(--bg-surface); color: var(--brand-deep); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; transition: border-color .2s; }
.restore-preset:hover:not(:disabled) { border-color: #75ab91; }
.restore-preset:focus-visible { outline: 2px solid var(--brand-accent); outline-offset: 2px; }
.restore-preset:disabled { opacity: .5; cursor: default; }
p { color: var(--text-secondary); font-size: .8125rem; }
@media (prefers-reduced-motion: reduce) { .preset-image img { transition: none; } }
</style>
