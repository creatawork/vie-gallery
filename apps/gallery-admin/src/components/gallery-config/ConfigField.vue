<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { VIEWER_CONFIG_RULES, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
const props = defineProps<{ config: ViewerConfig; path: string; label: string; disabled?: boolean; issues: ConfigIssue[]; fallback?: string | number; hint?: string }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const rule = computed(() => VIEWER_CONFIG_RULES[props.path]!)
const value = computed(() => props.path.split('.').reduce<unknown>((target, key) => target && typeof target === 'object' ? (target as Record<string, unknown>)[key] : undefined, props.config) ?? props.fallback)
const draft = ref<unknown>(value.value)
const id = computed(() => `viewer-${props.path.replaceAll('.', '-')}`)
const issue = computed(() => props.issues.find(issue => issue.path === props.path))
watch([value, issue], ([next, nextIssue], [previous, previousIssue]) => {
  if (next !== previous || (previousIssue && !nextIssue)) draft.value = next
})
const names: Record<string, string> = { auto: '自动', low: '低', mid: '中', high: '高', sphere: '环形展厅', carousel: '线性长廊', helix: '螺旋长廊', grid: '矩阵展墙', spiral: '旋臂漫游', random: '自由探索', solid: '纯色', gradient: '渐变', image: '全景图片', smooth: '平滑', burst: '展开', none: '无', fade: '渐显', rise: '上浮', sunrise: '清晨', noon: '正午', sunset: '黄昏', night: '夜晚', stars: '星尘', sakura: '樱花', hearts: '心形', snow: '雪花', fireflies: '萤火虫', meteors: '流星' }
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
  const current = (value.value as string[]) ?? []
  update((event.target as HTMLInputElement).checked ? [...current, type] : current.filter(item => item !== type))
}
</script>
<template>
  <fieldset v-if="rule.kind === 'particles'" class="config-field particle-field" :disabled="disabled">
    <legend>{{ label }}</legend>
    <label v-for="type in ['stars', 'sakura', 'hearts', 'snow', 'fireflies', 'meteors']" :key="type">
      <input type="checkbox" :checked="(value as string[]).includes(type)" @change="toggle(type, $event)">{{ names[type] }}
    </label>
  </fieldset>
  <div v-else class="config-field" :class="{ 'is-toggle': rule.kind === 'boolean' }">
    <label :for="id">{{ label }}</label>
    <select v-if="rule.kind === 'enum'" :id="id" :value="draft" :disabled="disabled" @change="onInput">
      <option v-for="option in rule.values" :key="option" :value="option">{{ names[option] ?? option }}</option>
    </select>
    <input v-else :id="id" :type="rule.kind === 'boolean' ? 'checkbox' : ['number', 'integer'].includes(rule.kind) ? 'number' : 'text'"
      :value="draft" :checked="!!draft" :min="rule.min" :max="rule.max" :step="rule.kind === 'integer' ? 1 : props.path.includes('density') && props.path.includes('fog') ? .0001 : .01"
      :disabled="disabled" :aria-invalid="!!issue" :aria-describedby="`${id}-hint${issue ? ` ${id}-error` : ''}`" @input="onInput" />
    <small :id="`${id}-hint`">{{ hint ?? (rule.kind === 'color' ? '六位十六进制颜色，例如 #112233' : rule.min !== undefined ? `${rule.min}–${rule.max}` : '') }}</small>
    <p v-if="issue" :id="`${id}-error`" role="alert">{{ issue.message }}</p>
  </div>
</template>
<style scoped>
.config-field { display: grid; gap: .5rem; margin-block: 1rem; }
label, legend { font-size: .8125rem; font-weight: 650; color: #334f42; }
input:not([type=checkbox]), select { width: 100%; min-width: 0; min-height: 2.5rem; padding: .5rem .75rem; border: 1px solid #d7e1e9; border-radius: .625rem; background: #fff; color: #17212b; font: inherit; }
input:focus-visible, select:focus-visible { outline: 2px solid #19815c; outline-offset: 3px; }
input[aria-invalid=true] { border-color: #b91c1c; }
input:disabled, select:disabled { opacity: .65; cursor: not-allowed; }
small { color: #6a7c71; font-size: .75rem; }
p { color: #b91c1c; font-size: .8125rem; margin: 0; }
.is-toggle { grid-template-columns: 1fr auto; align-items: center; }.is-toggle small, .is-toggle p { grid-column: 1/-1; }
.particle-field { border: 1px solid #cbd5e1; border-radius: .5rem; padding: .75rem; grid-template-columns: 1fr 1fr; }
.particle-field label { display: flex; gap: .5rem; align-items: center; }
</style>
