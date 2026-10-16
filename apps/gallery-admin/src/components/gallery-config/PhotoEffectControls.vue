<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PHOTO_EFFECTS, resolvePhotoArrangement, resolvePhotoEffect, type PhotoEffectStyle, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
const props = defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const effect = computed(() => resolvePhotoEffect(props.config))
const treatment = computed(() => PHOTO_EFFECTS.find(item => item.id === effect.value.style))
const isBook = computed(() => props.config.layout.params?.composition === 'curated' && resolvePhotoArrangement(props.config) === 'book')
const hasIssue = computed(() => props.issues.some(issue => issue.path.startsWith('effects.photo.')))
const categories = [
  { id: 'light', label: '光影', styles: ['silk', 'prism', 'dapple', 'light-leak', 'bokeh'] },
  { id: 'motion', label: '流动', styles: ['hologram', 'ripple', 'stardust', 'caustics', 'crystal'] },
  { id: 'material', label: '材质', styles: ['film', 'frost', 'paper', 'contact'] },
  { id: 'color', label: '色调', styles: ['silver', 'duotone'] }
]
function categoryFor(style: string) { return categories.find(item => item.styles.includes(style))?.id ?? 'light' }
const category = ref(categoryFor(effect.value.style))
const options = computed(() => PHOTO_EFFECTS.filter(item => categories.find(group => group.id === category.value)?.styles.includes(item.id)))
const animated = computed(() => !['none', 'paper', 'duotone'].includes(effect.value.style))
watch(() => effect.value.style, style => { if (style !== 'none') category.value = categoryFor(style) })
function chooseStyle(style: PhotoEffectStyle) { emit('patch', { effects: { photo: { ...effect.value, style } } }) }
function adjust(input: unknown) {
  const patch = input as { effects: { photo: { intensity?: number; speed?: number } } }
  emit('patch', { effects: { photo: { ...effect.value, ...patch.effects.photo } } })
}
const swatches: Record<string, string> = {
  silk: 'linear-gradient(125deg, #112d2c, #87ad99 45%, #dbe0bc 48%, #274e4d 68%)', prism: 'linear-gradient(125deg, #2e334d, #7b95ab 35%, #e0c8bd 54%, #ad7f96 75%, #404868)',
  dapple: 'radial-gradient(ellipse at 70% 25%, #e3d0a1, transparent 35%), linear-gradient(135deg, #172e21, #789573)', 'light-leak': 'linear-gradient(115deg, #6b3338, #bd7855 38%, #efc083 50%, #3b3651)', bokeh: 'radial-gradient(circle at 65% 35%, #efd2bb 0, #efd2bb55 15%, transparent 27%), linear-gradient(135deg, #433245, #9c7c87)',
  hologram: 'repeating-linear-gradient(0deg, transparent 0 4px, #e1d8fc22 4px 5px), linear-gradient(135deg, #152347, #8b7dad, #73c2bb)', ripple: 'repeating-radial-gradient(ellipse at 50% 60%, #719faf99 0 3px, transparent 5px 11px), #173747', stardust: 'radial-gradient(circle at 65% 32%, #eee1b2 0 1px, transparent 2px), radial-gradient(circle at 25% 65%, #b9cde2 0 1px, transparent 2px), linear-gradient(135deg, #132340, #536784)', caustics: 'repeating-radial-gradient(ellipse at 20% 0, #a4e7d377 0 2px, transparent 3px 12px), linear-gradient(135deg, #123f52, #438f93)', crystal: 'conic-gradient(from 35deg at 65% 30%, #7290a2, #d1e7ec, #667990, #bedbe1, #7290a2)',
  film: 'linear-gradient(135deg, #4a3527, #b18a60, #e3c698)', frost: 'linear-gradient(135deg, #677d83, #c8dad5 48%, #8ca9aa)', paper: 'linear-gradient(135deg, #ded5be, #faf7e9)', contact: 'repeating-linear-gradient(90deg, #242727 0 8px, #919c98 8px 9px, #242727 9px 17px)', silver: 'linear-gradient(135deg, #273436, #d4ded7 55%, #657471)', duotone: 'linear-gradient(135deg, #564374 40%, #efe3c8 40%, #efe3c8 64%, #79618d 64%)'
}
</script>
<template>
  <section class="side-block photo-effect-controls">
    <div class="section-heading"><span class="section-index">02</span><div><h2>照片处理</h2><p>为作品加入光影、材质或色彩语言。</p></div></div>
    <p v-if="isBook" class="book-note">翻页画册按原片印相，保留照片本来的色彩。可在上方调整照片大小；原有处理设置会保留，切换其他编排后继续使用。</p>
    <template v-if="!isBook || hasIssue">
    <p v-for="issue in issues.filter(item => item.path === 'effects.photo.style')" :key="issue.path" class="choice-error" role="alert">{{ issue.message }}</p>
    <div class="treatment-status"><span>当前 · <strong>{{ treatment?.label }}</strong></span><button type="button" class="original-button" :aria-pressed="effect.style === 'none'" :disabled="disabled" @click="chooseStyle('none')">保留原片</button></div>
    <div class="treatment-categories" role="group" aria-label="照片处理分类"><button v-for="item in categories" :key="item.id" type="button" :aria-pressed="category === item.id" @click="category = item.id">{{ item.label }}</button></div>
    <div class="treatment-options" role="group" aria-label="照片处理">
      <button v-for="item in options" :key="item.id" type="button" :disabled="disabled" :aria-pressed="effect.style === item.id" :aria-label="item.label" @click="chooseStyle(item.id)">
        <span class="treatment-swatch" :style="{ background: swatches[item.id] }" aria-hidden="true"><i></i></span><strong>{{ item.label }}</strong><span class="treatment-check" aria-hidden="true">{{ effect.style === item.id ? '✓' : '+' }}</span>
      </button>
    </div>
    <p class="treatment-description" role="status">{{ treatment?.description }}{{ effect.style !== 'none' ? '。效果会应用到所有照片。' : '，让照片本身成为主角。' }}</p>
    <template v-if="effect.style !== 'none' || hasIssue">
      <ConfigField path="effects.photo.intensity" label="处理强度" presentation="range" format="percent" :fallback="effect.intensity" hint="向左更接近原片，向右更有表现力；0% 为原片。" :config="config" :issues="issues" :disabled="disabled" @patch="adjust" />
      <ConfigField v-if="animated || hasIssue" path="effects.photo.speed" label="流动速度" presentation="range" format="speed" :fallback="effect.speed" hint="调至 0，保留画面质感并停止流动。" :config="config" :issues="issues" :disabled="disabled" @patch="adjust" />
      <p v-else class="static-note">此处理为静态质感，无需调整速度。</p>
    </template>
    </template>
  </section>
</template>
<style scoped>
.section-heading { display: flex; gap: 11px; align-items: flex-start; margin-bottom: 17px; }.section-index { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; border: 1px solid var(--border-strong); border-radius: 9px; color: var(--brand-deep); font-size: 10px; letter-spacing: .04em; }
.section-heading h2 { margin: 0 0 4px; }p { color: var(--text-tertiary); font-size: 11px; line-height: 1.7; margin: 0; }
.book-note { padding: 13px; background: #f5f7f3; border: 1px solid var(--border-subtle); border-radius: 9px; }
.choice-error { margin: 9px 0; color: #b91c1c; }
button { font: inherit; cursor: pointer; transition: border-color .18s, background .18s; }button:disabled { opacity: .5; cursor: not-allowed; }button:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 3px; }
.treatment-status { display: flex; gap: 8px; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-tertiary); }.treatment-status strong { color: var(--text-primary); font-weight: 600; }.original-button { border: 1px solid var(--border-strong); border-radius: 7px; padding: 6px 9px; color: var(--text-secondary); background: var(--bg-surface); font-size: 10px; }.original-button[aria-pressed=true] { background: var(--mint-soft); border-color: var(--brand-accent); color: var(--brand-deep); }
.treatment-categories { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; margin: 17px 0 11px; padding: 4px; border-radius: 9px; background: #eef2ee; }.treatment-categories button { padding: 7px 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-tertiary); font-size: 11px; }.treatment-categories button[aria-pressed=true] { background: var(--bg-surface); color: var(--brand-deep); box-shadow: 0 1px 4px #1631240a; }
.treatment-options { display: grid; gap: 7px; }.treatment-options button { display: grid; grid-template-columns: 40px minmax(0, 1fr) 16px; align-items: center; gap: 11px; min-height: 48px; padding: 6px 10px 6px 6px; border: 1px solid var(--border-strong); border-radius: 9px; text-align: left; color: var(--text-secondary); background: var(--bg-surface); }.treatment-options button:hover:not(:disabled) { border-color: var(--brand-accent); }.treatment-options button[aria-pressed=true] { border-color: var(--brand-accent); background: var(--mint-soft); color: var(--brand-deep); }.treatment-options strong { font-size: 11px; font-weight: 550; }.treatment-swatch { display: grid; place-items: center; width: 40px; height: 34px; border-radius: 5px; overflow: hidden; }.treatment-swatch i { display: block; width: 22px; height: 24px; border: 1px solid #ffffff66; border-radius: 1px; transform: rotate(-8deg); box-shadow: 4px 3px 9px #14272222; }.treatment-check { font-size: 13px; color: var(--brand-deep); }.treatment-description { margin-top: 13px; padding: 10px 11px; background: #f5f7f3; border-radius: 8px; }.static-note { margin-top: 10px; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
