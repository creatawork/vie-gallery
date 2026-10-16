<script setup lang="ts">
import { computed } from 'vue'
import { PHOTO_ARRANGEMENTS, applyPhotoArrangement, resolvePhotoArrangement, type PhotoArrangement, type LayoutMode, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
const props = defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const curated = computed(() => props.config.layout.params?.composition === 'curated')
const arrangement = computed(() => resolvePhotoArrangement(props.config))
const isBook = computed(() => curated.value && arrangement.value === 'book')
const selectedArrangement = computed(() => PHOTO_ARRANGEMENTS.find(item => item.id === arrangement.value))
function hasIssue(path: string) { return props.issues.some(issue => issue.path === path) }
const spatialLayouts: { id: LayoutMode; label: string; caption: string }[] = [
  { id: 'sphere', label: '环形展厅', caption: '照片环绕四周' }, { id: 'carousel', label: '线性长廊', caption: '沿展线徐徐展开' },
  { id: 'helix', label: '螺旋长廊', caption: '盘旋上升的空间' }, { id: 'grid', label: '矩阵展墙', caption: '整齐排布，集中浏览' },
  { id: 'spiral', label: '旋臂漫游', caption: '由内向外舒展' }, { id: 'random', label: '自由探索', caption: '散落在立体空间' }
]
const geometryFields = computed(() => {
  const fields: { path: string; label: string; fallback: number }[] = []
  if (curated.value) {
    if (['ribbon', 'tunnel', 'orbit', 'fan', 'arc'].includes(arrangement.value)) fields.push({ path: 'layout.params.radius', label: '展开范围', fallback: 340 })
    if (arrangement.value === 'ribbon') fields.push({ path: 'layout.params.height', label: '纵向起伏', fallback: 430 }, { path: 'layout.params.turns', label: '扭转圈数', fallback: 1.15 })
  } else {
    const mode = props.config.layout.mode
    if (mode !== 'grid') fields.push({ path: 'layout.params.radius', label: mode === 'random' ? '分布范围' : '布局半径', fallback: 500 })
    if (mode === 'grid') fields.push({ path: 'layout.params.columns', label: '每行列数', fallback: 4 })
    if (mode === 'helix') fields.push({ path: 'layout.params.height', label: '螺旋高度', fallback: 600 })
    if (['helix', 'spiral'].includes(mode)) fields.push({ path: 'layout.params.turns', label: '螺旋圈数', fallback: 3 })
  }
  const recoverable = [
    { path: 'layout.params.radius', label: '展开范围', fallback: curated.value ? 340 : 500 },
    { path: 'layout.params.columns', label: '每行列数', fallback: 4 },
    { path: 'layout.params.height', label: '纵向起伏', fallback: curated.value ? 430 : 600 },
    { path: 'layout.params.turns', label: '扭转圈数', fallback: curated.value ? 1.15 : 3 }
  ]
  for (const field of recoverable) if (hasIssue(field.path) && !fields.some(item => item.path === field.path)) fields.push(field)
  return fields
})
function chooseArrangement(id: PhotoArrangement) {
  const next = applyPhotoArrangement(props.config, id)
  emit('patch', { layout: next.layout })
}
function chooseComposition(composition: 'curated' | 'spatial') {
  if (composition === 'curated') chooseArrangement(arrangement.value)
  else emit('patch', { layout: { params: { composition }, transition: { style: 'smooth' } } })
}
function chooseMode(mode: LayoutMode) { emit('patch', { layout: { mode } }) }
// Small diagrams describe the path rather than simulating a photograph treatment.
function frames(kind: string) {
  const shapes: Record<string, number[][]> = {
    book: [[34, 11, -10], [59, 11, 10]], tunnel: [[12, 10, -9], [31, 14, -5], [50, 18, 0], [69, 14, 5], [88, 10, 9]],
    ribbon: [[8, 25, -18], [29, 12, -8], [50, 17, 0], [71, 26, 8], [92, 13, 18]], orbit: [[9, 13, -20], [30, 25, -10], [50, 28, 0], [70, 25, 10], [91, 13, 20]],
    filmstrip: [[8, 19, 0], [29, 19, 0], [50, 19, 0], [71, 19, 0], [92, 19, 0]], fan: [[20, 24, -30], [35, 17, -15], [50, 14, 0], [65, 17, 15], [80, 24, 30]],
    wave: [[8, 25, -8], [29, 13, 0], [50, 19, 8], [71, 28, 0], [92, 19, -8]], arc: [[8, 12, -15], [29, 23, -7], [50, 27, 0], [71, 23, 7], [92, 12, 15]],
    cascade: [[10, 7, 0], [30, 13, 0], [50, 19, 0], [70, 25, 0], [90, 31, 0]], stack: [[36, 5, -12], [43, 11, -6], [50, 17, 0], [57, 23, 6], [64, 29, 12]],
    sphere: [[10, 13, -18], [30, 26, -8], [50, 29, 0], [70, 26, 8], [90, 13, 18]], carousel: [[8, 18, -5], [29, 18, -3], [50, 18, 0], [71, 18, 3], [92, 18, 5]],
    helix: [[8, 29, -14], [29, 24, -7], [50, 18, 0], [71, 12, 7], [92, 7, 14]], grid: [[20, 7, 0], [50, 7, 0], [80, 7, 0], [20, 30, 0], [50, 30, 0], [80, 30, 0]],
    spiral: [[12, 28, -20], [32, 16, -10], [52, 12, 0], [72, 21, 10], [90, 32, 20]], random: [[7, 9, -15], [30, 28, 8], [51, 13, -3], [77, 31, -14], [93, 7, 20]]
  }
  return (shapes[kind] ?? shapes.ribbon!).map(([x, y, angle]) => ({ x: x!, y: y!, angle: angle! }))
}
</script>
<template>
  <section class="side-block layout-controls">
    <div class="section-heading"><span class="section-index">01</span><div><h2>观看方式</h2><p>决定访客如何进入你的照片故事。</p></div></div>
    <div class="composition-options" role="group" aria-label="观看方式">
      <button type="button" :disabled="disabled" :aria-pressed="curated" @click="chooseComposition('curated')"><span class="composition-symbol" aria-hidden="true">▣</span><strong>逐张策展</strong><small>聚焦作品，逐张切换</small></button>
      <button type="button" :disabled="disabled" :aria-pressed="!curated" @click="chooseComposition('spatial')"><span class="composition-symbol" aria-hidden="true">◉</span><strong>自由漫游</strong><small>拖动视角，探索空间</small></button>
    </div>
    <p v-for="issue in issues.filter(item => item.path === 'layout.params.composition')" :key="issue.path" class="choice-error" role="alert">{{ issue.message }}</p>
    <div class="layout-heading"><h3>{{ curated ? '照片编排' : '空间布局' }}</h3><span>{{ curated ? selectedArrangement?.label : spatialLayouts.find(item => item.id === config.layout.mode)?.label }}</span></div>
    <div class="layout-options" role="group" :aria-label="curated ? '照片编排' : '空间布局'">
      <template v-if="curated"><button v-for="item in PHOTO_ARRANGEMENTS" :key="item.id" type="button" :disabled="disabled" :aria-pressed="arrangement === item.id" :aria-label="`${item.label} · ${item.caption}`" @click="chooseArrangement(item.id)">
        <svg viewBox="0 0 120 56" aria-hidden="true"><rect v-for="(frame, index) in frames(item.id)" :key="index" :x="frame.x" :y="frame.y" width="18" height="19" rx="2" :transform="`rotate(${frame.angle}, ${frame.x + 9}, ${frame.y + 9.5})`" :opacity=".4 + (index % 3) * .2" /></svg><strong>{{ item.label }}</strong>
      </button></template>
      <template v-else><button v-for="item in spatialLayouts" :key="item.id" type="button" :disabled="disabled" :aria-pressed="config.layout.mode === item.id" :aria-label="`${item.label} · ${item.caption}`" @click="chooseMode(item.id)">
        <svg viewBox="0 0 120 56" aria-hidden="true"><rect v-for="(frame, index) in frames(item.id)" :key="index" :x="frame.x" :y="frame.y" width="18" height="19" rx="2" :transform="`rotate(${frame.angle}, ${frame.x + 9}, ${frame.y + 9.5})`" :opacity=".4 + (index % 3) * .2" /></svg><strong>{{ item.label }}</strong>
      </button></template>
    </div>
    <p v-for="issue in issues.filter(item => ['layout.mode', 'layout.params.arrangement'].includes(item.path))" :key="issue.path" class="choice-error" role="alert">{{ issue.message }}</p>
    <p class="selection-caption">{{ curated ? selectedArrangement?.caption : spatialLayouts.find(item => item.id === config.layout.mode)?.caption }}</p>
    <ConfigField path="layout.params.scale" label="照片大小" presentation="range" format="percent" :fallback="1" hint="100% 为当前编排的标准尺寸。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <ConfigField v-if="!isBook || hasIssue('layout.params.spacing')" path="layout.params.spacing" label="照片间距" presentation="range" format="percent" :fallback="1" hint="拉开留白，让每张作品有呼吸空间。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <details v-if="geometryFields.length" class="geometry-details"><summary>空间细调 <span>范围与结构</span></summary><ConfigField v-for="field in geometryFields" :key="field.path" :path="field.path" :label="field.label" :fallback="field.fallback" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" /></details>
    <div class="download-option"><ConfigField path="visitorAllowDownload" label="允许访客下载照片" hint="访客可以下载原始照片文件。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" /></div>
  </section>
</template>
<style scoped>
.section-heading { display: flex; gap: 11px; align-items: flex-start; margin-bottom: 17px; }
.section-index { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; border: 1px solid var(--border-strong); border-radius: 9px; color: var(--brand-deep); font-size: 10px; letter-spacing: .04em; }
.section-heading h2 { margin: 0 0 4px; }.section-heading p, .selection-caption { margin: 0; color: var(--text-tertiary); font-size: 11px; line-height: 1.7; }
.composition-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
button { font: inherit; cursor: pointer; color: var(--text-secondary); border: 1px solid var(--border-strong); background: var(--bg-surface); transition: border-color .18s, background .18s; }
button:hover:not(:disabled) { border-color: var(--brand-accent); }button:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 3px; }button:disabled { opacity: .5; cursor: not-allowed; }
button[aria-pressed=true] { border-color: var(--brand-accent); background: var(--mint-soft); color: var(--brand-deep); }
.composition-options button { display: grid; gap: 4px; padding: 13px 10px; border-radius: 11px; text-align: left; }
.composition-symbol { margin-bottom: 4px; font-size: 21px; line-height: 1; color: var(--brand-deep); }.composition-options strong { font-size: 12px; }.composition-options small { font-size: 10px; font-weight: 400; color: var(--text-tertiary); }
.layout-heading { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin: 22px 0 10px; }.layout-heading h3 { font-size: 12px; margin: 0; color: var(--text-primary); }.layout-heading span { font-size: 10px; color: var(--brand-deep); }
.layout-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }.layout-options button { padding: 6px 7px 10px; border-radius: 10px; min-width: 0; }.layout-options svg { display: block; width: 100%; height: 53px; fill: currentColor; color: #78988a; }.layout-options button[aria-pressed=true] svg { color: var(--brand-deep); }.layout-options strong { display: block; font-size: 11px; font-weight: 550; }.selection-caption { margin-top: 10px; min-height: 18px; }
.geometry-details { margin-top: 22px; padding-top: 15px; border-top: 1px solid var(--border-subtle); }.geometry-details summary { cursor: pointer; color: var(--text-primary); font-size: 12px; font-weight: 600; }.geometry-details summary span { margin-left: 7px; color: var(--text-tertiary); font-size: 10px; font-weight: 400; }.geometry-details summary:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 4px; }
.download-option { margin-top: 20px; padding-top: 1px; border-top: 1px solid var(--border-subtle); }
.choice-error { margin: 9px 0 0; color: #b91c1c; font-size: 11px; line-height: 1.5; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
