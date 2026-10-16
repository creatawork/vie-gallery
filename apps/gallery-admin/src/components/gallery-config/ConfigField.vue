<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { VIEWER_CONFIG_RULES, PHOTO_EFFECTS, PHOTO_ARRANGEMENTS, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
const props = defineProps<{ config: ViewerConfig; path: string; label: string; disabled?: boolean; issues: ConfigIssue[]; fallback?: string | number; hint?: string; options?: readonly string[]; presentation?: 'range'; format?: 'percent' | 'speed'; unit?: string }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const rule = computed(() => VIEWER_CONFIG_RULES[props.path]!)
const value = computed(() => props.path.split('.').reduce<unknown>((target, key) => target && typeof target === 'object' ? (target as Record<string, unknown>)[key] : undefined, props.config) ?? props.fallback)
const draft = ref<unknown>(value.value)
const legacyOption = computed(() => props.options && rule.value.values?.includes(String(draft.value)) && !props.options.includes(String(draft.value)) ? String(draft.value) : undefined)
const id = computed(() => `viewer-${props.path.replaceAll('.', '-')}`)
const issue = computed(() => props.issues.find(issue => issue.path === props.path))
const fieldElement = ref<HTMLElement | null>(null)
const hintText = computed(() => props.hint ?? (rule.value.kind === 'color' ? '可点选颜色，或输入六位色值。' : ''))
const describedBy = computed(() => [hintText.value ? `${id.value}-hint` : '', issue.value ? `${id.value}-error` : ''].filter(Boolean).join(' ') || undefined)
const step = computed(() => rule.value.kind === 'integer' || props.unit === '°' ? 1 : props.path.includes('fog') && props.path.includes('density') ? .0001 : props.path.endsWith('radius') || props.path.endsWith('height') ? 10 : .01)
const displayValue = computed(() => {
  const number = Number(draft.value)
  if (props.format === 'percent') return `${Math.round(number * 100)}%`
  if (props.format === 'speed' && number === 0) return '静止'
  return `${Number(number.toFixed(2))}${props.format === 'speed' ? '×' : props.unit ?? ''}`
})
const colorValue = computed(() => typeof draft.value === 'string' && /^#[0-9a-f]{6}$/i.test(draft.value) ? draft.value : '#ffffff')
const particleTypes = ['stars', 'sakura', 'hearts', 'snow', 'fireflies', 'meteors']
const selectedParticles = computed(() => Array.isArray(value.value) ? value.value as string[] : [])
watch([value, issue], ([next, nextIssue], [previous, previousIssue]) => {
  if (next !== previous || (previousIssue && !nextIssue)) draft.value = next
})
watch([issue, () => props.config], async ([next]) => {
  if (!next) return
  await nextTick()
  for (let parent = fieldElement.value?.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true
  }
}, { immediate: true, flush: 'post' })
const names: Record<string, string> = { auto: '自动适配', low: '流畅', mid: '均衡', high: '精细', sphere: '环形展厅', carousel: '线性长廊', helix: '螺旋长廊', grid: '矩阵展墙', spiral: '旋臂漫游', random: '自由探索', solid: '纯色', gradient: '渐变', image: '全景图片', smooth: '柔和切换', burst: '展开切换', none: '关闭', fade: '渐显', rise: '上浮', sunrise: '清晨', noon: '正午', sunset: '黄昏', night: '夜晚', stars: '星尘', sakura: '樱花', hearts: '心形', snow: '雪花', fireflies: '萤火虫', meteors: '流星' }
function optionLabel(option: string) {
  if (props.path === 'effects.photo.style') return PHOTO_EFFECTS.find(item => item.id === option)?.label ?? option
  if (props.path === 'layout.params.arrangement') return PHOTO_ARRANGEMENTS.find(item => item.id === option)?.label ?? option
  if (props.path === 'lighting.timeOfDay' && option === 'auto') return '跟随场景'
  if (props.path === 'background.mode' && option === 'image') return '图片背景'
  if (option === 'curated') return '逐张策展'
  if (option === 'spatial') return '自由漫游'
  if (option === 'flat') return '平面图片'
  if (option === 'equirectangular') return '360° 全景'
  return names[option] ?? option
}
function update(next: unknown) {
  draft.value = next
  const keys = props.path.split('.')
  let patch: unknown = next
  for (const key of keys.reverse()) patch = { [key]: patch }
  emit('patch', patch)
}
function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  update(rule.value.kind === 'boolean' ? input.checked : ['number', 'integer'].includes(rule.value.kind) ? input.value === '' ? null : Number(input.value) : input.value)
}
function toggle(type: string, event: Event) {
  update((event.target as HTMLInputElement).checked ? [...selectedParticles.value, type] : selectedParticles.value.filter(item => item !== type))
}
</script>
<template>
  <fieldset v-if="rule.kind === 'particles'" ref="fieldElement" class="config-field particle-field" :disabled="disabled" :aria-describedby="describedBy" :aria-invalid="!!issue">
    <legend>{{ label }}</legend>
    <div class="particle-options"><label v-for="type in particleTypes" :key="type" :class="{ selected: selectedParticles.includes(type) }">
      <input class="no-enhance" type="checkbox" :checked="selectedParticles.includes(type)" @change="toggle(type, $event)"><span>{{ names[type] }}</span>
    </label></div>
    <small v-if="hintText" :id="`${id}-hint`">{{ hintText }}</small>
    <p v-if="issue" :id="`${id}-error`" role="alert">{{ issue.message }}</p>
  </fieldset>
  <div v-else ref="fieldElement" class="config-field" :class="{ 'is-toggle': rule.kind === 'boolean', 'is-range': presentation === 'range' }">
    <div class="field-heading"><label :for="id">{{ label }}<span v-if="unit && presentation !== 'range'" class="field-unit">（{{ unit }}）</span></label><output v-if="presentation === 'range'" :for="id">{{ displayValue }}</output></div>
    <select v-if="rule.kind === 'enum'" :id="id" class="no-enhance" :value="draft" :disabled="disabled" :aria-invalid="!!issue" :aria-describedby="describedBy" @change="onInput">
      <option v-if="legacyOption" :value="legacyOption" disabled>{{ path === 'layout.transition.style' && legacyOption === 'burst' ? '柔和切换（旧版兼容）' : `${optionLabel(legacyOption)}（当前设置）` }}</option>
      <option v-for="option in options ?? rule.values" :key="option" :value="option">{{ optionLabel(option) }}</option>
    </select>
    <div v-else-if="rule.kind === 'color'" class="color-input">
      <input :id="`${id}-picker`" class="no-enhance color-picker" type="color" :value="colorValue" :disabled="disabled" :aria-label="`${label}选择器`" @input="onInput">
      <input :id="id" class="no-enhance" type="text" :value="draft" maxlength="7" spellcheck="false" :disabled="disabled" :aria-invalid="!!issue" :aria-describedby="describedBy" @input="onInput">
    </div>
    <input v-else :id="id" class="no-enhance" :type="rule.kind === 'boolean' ? 'checkbox' : presentation === 'range' ? 'range' : ['number', 'integer'].includes(rule.kind) ? 'number' : 'text'"
      :value="draft" :checked="!!draft" :min="rule.min" :max="rule.max" :step="step" :role="rule.kind === 'boolean' ? 'switch' : undefined"
      :disabled="disabled" :aria-invalid="!!issue" :aria-describedby="describedBy" :aria-valuetext="presentation === 'range' ? displayValue : undefined" @input="onInput" />
    <small v-if="hintText" :id="`${id}-hint`">{{ hintText }}</small>
    <p v-if="issue" :id="`${id}-error`" role="alert">{{ issue.message }}</p>
  </div>
</template>
<style scoped>
.config-field { display: grid; gap: 8px; margin-block: 18px; min-width: 0; }
.field-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
label, legend { font-size: 12px; line-height: 1.5; font-weight: 650; color: var(--text-primary); }
output { color: var(--brand-deep); font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
.field-unit { font-weight: 400; color: var(--text-tertiary); }
input:not([type=checkbox]):not([type=range]):not([type=color]), select { width: 100%; min-width: 0; min-height: 40px; padding: 9px 11px; border: 1px solid var(--border-strong); border-radius: 9px; background: var(--bg-surface); color: var(--text-primary); font: inherit; font-size: 12px; box-shadow: none; }
select { padding-right: 30px; }
input:focus-visible, select:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 3px; }
input[aria-invalid=true], select[aria-invalid=true] { border-color: #b91c1c; }
input:disabled, select:disabled { opacity: .5; cursor: not-allowed; }
small { color: var(--text-tertiary); font-size: 11px; line-height: 1.65; }
p { color: #b91c1c; font-size: 11px; line-height: 1.5; margin: 0; }
.is-toggle { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px 12px; }
.is-toggle small, .is-toggle p { grid-column: 1 / -1; }
.is-toggle input { appearance: none; width: 34px; height: 20px; border: 1px solid var(--border-strong); border-radius: 99px; background: #dce5df; cursor: pointer; position: relative; margin: 0; transition: background .18s; }
.is-toggle input::before { content: ''; position: absolute; width: 14px; height: 14px; top: 2px; left: 2px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #16312426; transition: transform .18s; }
.is-toggle input:checked { background: var(--brand-deep); border-color: var(--brand-deep); }
.is-toggle input:checked::before { transform: translateX(14px); }
.is-range input { width: 100%; min-height: 22px; margin: 0; padding: 0; accent-color: var(--brand-deep); cursor: pointer; }
.color-input { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 8px; }
.color-input input[type=text] { font-variant-numeric: tabular-nums; }
.color-picker { appearance: none; width: 40px; height: 40px; padding: 4px; border: 1px solid var(--border-strong); border-radius: 9px; background: var(--bg-surface); cursor: pointer; }
.color-picker::-webkit-color-swatch-wrapper { padding: 0; }.color-picker::-webkit-color-swatch { border: 0; border-radius: 5px; }
.particle-field { border: 0; padding: 0; min-inline-size: 0; }
.particle-field legend { margin-bottom: 9px; padding: 0; }
.particle-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
.particle-options label { display: flex; gap: 5px; align-items: center; justify-content: center; min-height: 34px; border: 1px solid var(--border-strong); border-radius: 8px; font-size: 11px; font-weight: 450; cursor: pointer; }
.particle-options input { width: 12px; height: 12px; margin: 0; accent-color: var(--brand-deep); }
.particle-options .selected { border-color: var(--brand-accent); background: var(--mint-soft); color: var(--brand-deep); }
@media (prefers-reduced-motion: reduce) { .is-toggle input, .is-toggle input::before { transition: none; } }
</style>
