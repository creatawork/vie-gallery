<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { THEATRE_MODES, SHOW_DURATION, type TheatreCommand, type TheatreMode, type TheatreState } from '../lib/photoTheatre'

const props = defineProps<{ state: TheatreState; total: number; busy: boolean }>()
const emit = defineEmits<{ command: [command: TheatreCommand] }>()
const playLabel = computed(() => props.state.status === 'playing' ? '暂停编排' : props.state.status === 'paused' ? '继续编排' : props.state.status === 'finished' ? '重播编排' : '播放编排')
const selection = computed(() => props.state.active ? props.state.mode : '')
const mainIndex = computed(() => props.state.mode === 'stack' ? props.state.indices.at(-1) : props.state.indices[0])
function changeMode(event: Event) {
  const mode = (event.target as HTMLSelectElement).value
  emit('command', mode ? { type: 'mode', mode: mode as TheatreMode } : { type: 'exit' })
}
</script>

<template>
  <section class="theatre-dock" aria-label="照片编排" :data-active="state.active" :data-mode="state.mode" :data-status="state.status">
    <div class="theatre-row">
      <label class="theatre-select">
        <Icon name="grid" :size="17" />
        <select aria-label="照片排列与组合" :value="selection" :disabled="busy" @change="changeMode">
          <option value="">照片编排</option>
          <optgroup v-for="group in ['叙事', '排列', '组合']" :key="group" :label="group">
            <option v-for="mode in THEATRE_MODES.filter(m => m.group === group)" :key="mode.id" :value="mode.id">{{ mode.label }}</option>
          </optgroup>
          <option v-if="state.mode === 'focus'" value="focus">单张聚焦</option>
        </select>
      </label>
      <button type="button" class="theatre-play" :disabled="busy || state.reducedMotion" :aria-label="playLabel"
        @click="emit('command', { type: state.status === 'playing' ? 'pause' : 'play' })">
        <Icon :name="state.status === 'playing' ? 'pause' : 'play'" :size="16" />
        <span>{{ playLabel }}</span>
      </button>
      <template v-if="state.active">
        <div class="theatre-navigation" aria-label="编排照片导航">
          <button type="button" :aria-label="state.mode === 'book' ? '向前翻页' : '上一组照片'" :disabled="busy || (state.mode === 'book' ? total < 2 : total <= state.indices.length)" @click="emit('command', { type: 'step', direction: -1 })"><Icon name="arrow-left" :size="17" /></button>
          <button type="button" aria-label="查看当前主图" :disabled="busy || mainIndex === undefined" @click="emit('command', { type: 'focus', index: mainIndex! })"><Icon name="photo" :size="17" /></button>
          <button type="button" :aria-label="state.mode === 'book' ? '向后翻页' : '下一组照片'" :disabled="busy || (state.mode === 'book' ? total < 2 : total <= state.indices.length)" @click="emit('command', { type: 'step', direction: 1 })"><Icon name="arrow-right" :size="17" /></button>
        </div>
        <button type="button" class="theatre-exit" aria-label="退出编排" :disabled="busy" @click="emit('command', { type: 'exit' })"><Icon name="x" :size="17" /></button>
      </template>
    </div>
    <div v-if="state.active" class="theatre-caption" role="status" aria-live="polite" aria-atomic="true">
      <span v-if="state.status === 'playing' || state.status === 'paused'">{{ state.status === 'paused' ? '已暂停' : '正在编排' }}<span aria-hidden="true"> · {{ Math.floor(state.elapsed) }} / {{ SHOW_DURATION }} 秒</span></span>
      <span v-else-if="state.status === 'finished'">演出结束 · 可继续自由浏览</span>
      <span v-else>本组 {{ state.indices.length }} 张 · 从第 {{ state.offset + 1 }} 张开始</span>
      <span>{{ state.reducedMotion ? '已减少动态效果' : state.mode === 'book' ? '滑动翻页 · 方向键翻页 · 点击照片聚焦' : '左右拖动换组 · 点击照片聚焦' }}</span>
    </div>
    <progress v-if="state.status !== 'idle'" class="theatre-progress" aria-label="编排播放进度" :value="state.elapsed" :max="SHOW_DURATION" />
  </section>
</template>

<style scoped>
.theatre-dock { min-width: 0; color: #f3f3ec; background: #25372c; overflow: hidden; }
.theatre-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px; }
.theatre-select { display: flex; align-items: center; gap: 8px; padding-left: 10px; }
select { max-width: 180px; min-height: 44px; color: inherit; background: transparent; border: 0; font: inherit; font-size: 13px; cursor: pointer; }
option, optgroup { color: #f3f3ec; background: #222a25; }
button { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: inherit; border-radius: 8px; }
button:hover:not(:disabled) { background: #ffffff14; }
button:focus-visible, select:focus-visible { outline: 2px solid #a0c5b2; outline-offset: -2px; }
button:disabled, select:disabled { opacity: .5; cursor: default; }
.theatre-play { padding: 0 12px; background: #a0c5b2; color: #171d1a; font-size: 13px; font-weight: 600; white-space: nowrap; }
.theatre-play:hover:not(:disabled) { background: #b9d6c6; }
.theatre-navigation { display: flex; }
.theatre-caption { display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; padding: 0 16px 12px; color: #d2ded4; font-size: 13px; line-height: 1.5; }
.theatre-progress { display: block; width: 100%; height: 3px; border: 0; accent-color: #a0c5b2; }
.theatre-progress::-webkit-progress-bar { background: #ffffff15; }
.theatre-progress::-webkit-progress-value { background: #a0c5b2; }
@media (max-width: 650px) {
  .theatre-dock { width: 100%; }
  .theatre-row { flex-wrap: wrap; gap: 4px; }
  .theatre-select { flex: 1 0 150px; min-width: 140px; }
  .theatre-select select { width: 100%; }
  .theatre-play { padding: 0 10px; }
  .theatre-navigation { flex: 1 0 calc(100% - 48px); justify-content: center; border-top: 1px solid #ffffff15; }
  .theatre-exit { border-top: 1px solid #ffffff15; }
  .theatre-caption { flex-direction: column; gap: 2px; padding-bottom: 10px; }
}
</style>
