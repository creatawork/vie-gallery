<script setup lang="ts">
import { computed, ref } from 'vue'
import { RECOMMENDED_SCENE_PRESET, VIEWER_PRESET_CARDS, VIEWER_PRESETS, PHOTO_EFFECTS, resolvePhotoEffect, resolvePhotoArrangement, isViewerPreset, type ViewerConfig, type PresetName } from '@vie/gallery-contracts'

const props = defineProps<{ config: ViewerConfig; disabled: boolean }>()
const emit = defineEmits<{ preset: [name: PresetName]; reset: [] }>()
const filter = ref('all')
const cards = computed(() => VIEWER_PRESET_CARDS.filter(card => filter.value === 'all' || card.category === filter.value))
const selected = computed(() => VIEWER_PRESET_CARDS.find(card => card.name === props.config.presetName))
const treatment = computed(() => PHOTO_EFFECTS.find(item => item.id === resolvePhotoEffect(props.config).style))
const treatmentLabel = computed(() => props.config.layout.params?.composition === 'curated' && resolvePhotoArrangement(props.config) === 'book' ? '原片印相' : treatment.value?.label)
const categories = [
  { id: 'all', label: '全部风格' },
  { id: 'light', label: '照片艺术' },
  { id: 'panorama', label: '全景空间' }
]
function thumbnail(name: PresetName) {
  return `${import.meta.env.BASE_URL}effect-previews/${name}.webp`
}
function swatch(name: PresetName) {
  const bg = VIEWER_PRESETS[name].background!
  return { background: `radial-gradient(ellipse at 65% 30%, ${bg.secondaryColor}, transparent 72%), ${bg.color}` }
}
</script>

<template>
  <section class="side-block preset-section">
    <div class="section-heading"><h2>选择整体风格</h2><span>16 种灵感</span></div>
    <p class="section-intro">编排、照片质感与空间氛围，一次搭配好。选定后，仍可逐项微调。</p>
    <div class="selected-look" role="status">
      <span v-if="selected" class="selected-swatch" :style="swatch(selected.name)" aria-hidden="true"><img :src="thumbnail(selected.name)" alt="" /></span>
      <div class="selected-copy"><span>正在使用<span v-if="config.customized"> · 已微调</span></span><strong>{{ selected?.label ?? '自定义风格' }}</strong><p class="preset-detail">{{ treatmentLabel }}<span> · </span>{{ config.layout.params?.composition === 'curated' ? '逐张策展' : '自由漫游' }}</p></div>
      <span class="selected-indicator" aria-hidden="true">✓</span>
    </div>
    <div class="preset-filters" role="group" aria-label="风格分类">
      <button v-for="item in categories" :key="item.id" type="button" :aria-pressed="filter === item.id" @click="filter = item.id">{{ item.label }}<span>{{ item.id === 'all' ? VIEWER_PRESET_CARDS.length : VIEWER_PRESET_CARDS.filter(card => card.category === item.id).length }}</span></button>
    </div>
    <div class="preset-cards">
      <button v-for="card in cards" :key="card.name" class="preset-card" type="button" :disabled="disabled" :aria-pressed="config.presetName === card.name" :title="card.description" @click="emit('preset', card.name)">
        <span class="preset-image" :style="swatch(card.name)"><img :src="thumbnail(card.name)" :alt="`${card.label}风格预览`" loading="lazy" width="320" height="200"><span class="preset-image-shade"></span></span>
        <span class="preset-copy"><strong><i :style="{ background: card.accent }" aria-hidden="true"></i>{{ card.label }}</strong><small>{{ card.hint }}</small></span>
        <span v-if="card.name === RECOMMENDED_SCENE_PRESET" class="preset-recommend">推荐</span>
        <span v-if="config.presetName === card.name" class="preset-check" aria-hidden="true">✓</span>
      </button>
    </div>
    <div class="preset-footer"><p>换个风格，发现作品的另一面。</p><button class="restore-preset" type="button" :disabled="disabled || !config.presetName || !isViewerPreset(config.presetName)" @click="emit('reset')">恢复当前预设</button></div>
  </section>
</template>

<style scoped>
.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px }
.section-heading h2 { margin:0!important; font-size:16px!important }
.section-heading>span { font-size:11px; color:var(--text-tertiary); white-space:nowrap }
.section-intro { margin:10px 0 18px; font-size:12px; color:var(--text-secondary); line-height:1.8 }
.selected-look { display:flex; align-items:center; gap:12px; padding:10px; background:#f2f4ef; border:1px solid #e3e8df; border-radius:10px }
.selected-swatch { flex:0 0 62px; height:62px; border-radius:6px; overflow:hidden }
.selected-swatch img { width:100%; height:100%; object-fit:cover }
.selected-copy { display:grid; gap:4px; min-width:0 }
.selected-copy>span { font-size:10px; color:var(--text-secondary) }
.selected-copy strong { font-size:14px; font-weight:600; color:var(--text-primary) }
.preset-detail { margin:0; font-size:11px; color:var(--text-secondary); line-height:1.5 }
.selected-indicator { margin-left:auto; margin-right:5px; color:var(--brand-deep); font-size:16px }
.preset-filters { display:flex; gap:4px; padding:4px; margin:20px 0 14px; background:var(--bg-app); border-radius:8px }
.preset-filters button { display:flex; align-items:center; justify-content:center; gap:5px; flex:1; min-height:34px; padding:5px 6px; border:0; border-radius:5px; background:transparent; color:var(--text-secondary); font:inherit; font-size:11px; cursor:pointer; white-space:nowrap }
.preset-filters button>span { font-size:10px; color:var(--text-tertiary); font-variant-numeric:tabular-nums }
.preset-filters button[aria-pressed="true"] { color:var(--brand-deep); background:var(--bg-surface); box-shadow:0 1px 4px #16251d0c; font-weight:600 }
.preset-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px }
.preset-card { position:relative; min-width:0; border:1px solid var(--border-strong); border-radius:9px; background:var(--bg-surface); color:var(--text-primary); font:inherit; cursor:pointer; overflow:hidden; text-align:left; transition:border-color .2s,box-shadow .2s }
.preset-card:hover:not(:disabled) { border-color:var(--brand-accent); box-shadow:0 4px 14px #17261d0d }
.preset-card[aria-pressed="true"] { border-color:var(--brand-accent); box-shadow:0 0 0 1px var(--brand-accent) }
.preset-card:focus-visible,.preset-filters button:focus-visible,.restore-preset:focus-visible { outline:2px solid var(--brand-accent); outline-offset:3px }
.preset-card:disabled { opacity:.55; cursor:not-allowed }
.preset-image { position:relative; display:block; aspect-ratio:1.45; background:#dce7df; overflow:hidden }
.preset-image img { display:block; width:100%; height:100%; object-fit:cover; transition:transform .5s cubic-bezier(.2,.7,.2,1) }
.preset-image-shade { position:absolute; inset:0; background:linear-gradient(transparent 70%,#0002) }
.preset-card:hover:not(:disabled) .preset-image img { transform:scale(1.04) }
.preset-copy { display:grid; gap:5px; padding:12px 10px }
.preset-copy strong { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600 }
.preset-copy strong i { width:6px; height:6px; border-radius:50%; flex-shrink:0 }
.preset-copy small { color:var(--text-secondary); font-size:10px; line-height:1.55 }
.preset-check { position:absolute; top:8px; right:8px; display:grid; width:22px; height:22px; place-items:center; border-radius:50%; background:var(--brand-accent); border:1px solid #ffffff8a; color:white; font-size:12px; box-shadow:0 1px 6px #0002 }
.preset-recommend { position:absolute; top:8px; left:8px; padding:4px 7px; border-radius:4px; background:#fffefaeb; color:#28583e; font-size:10px; font-weight:650 }
.preset-footer { display:grid; gap:10px; margin-top:22px; text-align:center }
.preset-footer p { color:var(--text-tertiary); font-size:11px }
.restore-preset { min-height:38px; border:1px solid var(--border-strong); border-radius:7px; background:transparent; color:var(--text-secondary); font:inherit; font-size:12px; cursor:pointer }
.restore-preset:hover:not(:disabled) { border-color:var(--brand-accent); color:var(--brand-deep) }
.restore-preset:disabled { opacity:.5; cursor:not-allowed }
@media(prefers-reduced-motion:reduce) { .preset-image img,.preset-card { transition:none } .preset-card:hover:not(:disabled) .preset-image img { transform:none } }
</style>
