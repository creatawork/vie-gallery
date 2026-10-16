<script setup lang="ts">
import { computed } from 'vue'
import { PHOTO_EFFECTS, resolvePhotoEffect, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
const props = defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const effect = computed(() => resolvePhotoEffect(props.config))
const treatment = computed(() => PHOTO_EFFECTS.find(item => item.id === effect.value.style))
function adjust(key: 'intensity' | 'speed', event: Event) {
  emit('patch', { effects: { photo: { ...effect.value, [key]: Number((event.target as HTMLInputElement).value) } } })
}
function setStyle(input: unknown) {
  const patch = input as { effects: { photo: { style: string } } }
  emit('patch', { effects: { photo: { ...effect.value, ...patch.effects.photo } } })
}
</script>
<template>
  <section class="side-block photo-effect-controls">
    <h2>照片特效</h2>
    <p>光影、质感与形变直接作用于每张照片。</p>
    <ConfigField path="effects.photo.style" label="画面处理" :fallback="effect.style" :hint="treatment?.description" :config="config" :issues="issues" :disabled="disabled" @patch="setStyle" />
    <template v-if="effect.style !== 'none'">
      <label class="effect-slider" for="photo-effect-intensity"><span>特效强度 <output>{{ Math.round(effect.intensity * 100) }}%</output></span><input id="photo-effect-intensity" type="range" min="0" max="1" step="0.01" :value="effect.intensity" :disabled="disabled" @input="adjust('intensity', $event)"><small>调至 0% 查看原片</small></label>
      <label v-if="!['paper', 'duotone'].includes(effect.style)" class="effect-slider" for="photo-effect-speed"><span>流动速度 <output>{{ effect.speed === 0 ? '静止' : `${effect.speed.toFixed(2)}×` }}</output></span><input id="photo-effect-speed" type="range" min="0" max="2" step="0.05" :value="effect.speed" :disabled="disabled" @input="adjust('speed', $event)"></label>
    </template>
  </section>
</template>
<style scoped>
p, small { color: var(--text-tertiary); font-size: .75rem; line-height: 1.6; }
.effect-slider { display: grid; gap: .6rem; margin: 1.2rem 0; color: var(--brand-deep); font-size: .8125rem; font-weight: 650; }
.effect-slider span { display: flex; justify-content: space-between; gap: 8px; }
output { color: var(--text-secondary); font-weight: 450; font-variant-numeric: tabular-nums; }
input { width: 100%; accent-color: var(--brand-deep); cursor: pointer; }
input:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 5px; }
input:disabled { opacity: .5; cursor: default; }
small { font-weight: 400; }
</style>
