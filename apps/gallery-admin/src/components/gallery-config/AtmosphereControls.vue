<script setup lang="ts">
import { computed } from 'vue'
import type { ViewerConfig, ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
const props = defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const backgroundMode = computed(() => props.config.background?.mode ?? 'solid')
function hasIssue(...paths: string[]) { return props.issues.some(issue => paths.some(path => issue.path === path || issue.path.startsWith(`${path}.`))) }
const lightGroups = computed(() => [
  { key: 'bloom', path: 'effects.bloom.enabled', label: '柔光晕染', hint: '让明亮区域散发柔和光晕。', enabled: !!props.config.effects.bloom?.enabled, fields: [
    { path: 'effects.bloom.strength', label: '光晕强度', fallback: .7 }, { path: 'effects.bloom.radius', label: '扩散范围', fallback: .5 }, { path: 'effects.bloom.threshold', label: '亮部阈值', fallback: .2 }
  ] },
  { key: 'fog', path: 'effects.fog.enabled', label: '远景薄雾', hint: '柔化远处的照片，增加空间纵深。', enabled: !!props.config.effects.fog?.enabled, fields: [
    { path: 'effects.fog.color', label: '薄雾颜色', fallback: '#0f172a' }, { path: 'effects.fog.density', label: '薄雾浓度', fallback: .0008 }
  ] },
  { key: 'postGrade', path: 'effects.postGrade.enabled', label: '统一调色', hint: '为照片与场景调整整体明暗和色彩。', enabled: !!props.config.effects.postGrade?.enabled, fields: [
    { path: 'effects.postGrade.saturation', label: '饱和度', fallback: 1 }, { path: 'effects.postGrade.brightness', label: '亮度', fallback: 1 }, { path: 'effects.postGrade.contrast', label: '对比度', fallback: 1 }
  ] },
  { key: 'vignette', path: 'effects.vignette.enabled', label: '聚焦暗角', hint: '压暗画面边缘，将视线留给作品。', enabled: !!props.config.effects.vignette?.enabled, fields: [
    { path: 'effects.vignette.strength', label: '暗角强度', fallback: .25 }
  ] }
])
</script>
<template>
  <section class="side-block atmosphere-controls">
    <div class="section-heading"><span class="section-mark" aria-hidden="true">◐</span><div><h2>场景底色</h2><p>用背景承托作品，建立展厅的第一印象。</p></div></div>
    <ConfigField path="background.mode" label="背景类型" fallback="solid" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <template v-if="['solid', 'gradient'].includes(backgroundMode) || hasIssue('background.color')"><ConfigField path="background.color" label="背景主色" fallback="#0f172a" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" /></template>
    <template v-if="backgroundMode === 'gradient' || hasIssue('background.secondaryColor', 'background.angle', 'background.motion')">
      <ConfigField path="background.secondaryColor" label="背景副色" fallback="#163124" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField path="background.motion" label="流动光影" hint="缓慢移动背景色彩，关闭后保留静态渐变。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <details class="control-details"><summary>渐变细调</summary><ConfigField path="background.angle" label="渐变角度" presentation="range" unit="°" :fallback="135" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" /></details>
    </template>
    <template v-if="backgroundMode === 'image' || hasIssue('background.image')">
      <ConfigField path="background.image.url" label="背景图片地址" hint="填写已上传图片的访问地址。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField path="background.image.projection" label="图片投影" fallback="flat" hint="普通照片选平面图片；2:1 全景图可选 360° 全景。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    </template>
    <p v-if="backgroundMode === 'none'" class="quiet-note">使用展厅默认底色，让照片成为画面重心。</p>
  </section>
  <section class="side-block atmosphere-controls">
    <div class="section-heading"><span class="section-mark" aria-hidden="true">✧</span><div><h2>环境点缀</h2><p>用少量飘落或闪烁的元素，补充场景情绪。</p></div></div>
    <ConfigField path="particles.enabled" label="飘浮粒子" hint="关闭后停止绘制粒子，照片与背景保持原样。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <template v-if="config.particles.enabled || hasIssue('particles.types', 'particles.density', 'particles.speed', 'particles.size', 'particles.color')">
      <ConfigField path="particles.types" label="点缀元素" hint="可以组合多种元素，建议选择 1–2 种。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField path="particles.density" label="点缀密度" presentation="range" format="percent" :fallback="1" hint="少量点缀更容易突出照片。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <details class="control-details"><summary>粒子细调 <span>运动与外观</span></summary>
        <ConfigField path="particles.speed" label="飘动速度" presentation="range" format="speed" :fallback="1" hint="调至 0，保留静止的点缀。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
        <ConfigField path="particles.size" label="粒子大小" presentation="range" format="percent" :fallback="1" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
        <ConfigField path="particles.color" label="粒子颜色" fallback="#ffffff" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      </details>
    </template>
  </section>
  <section class="side-block atmosphere-controls">
    <div class="section-heading"><span class="section-mark" aria-hidden="true">◌</span><div><h2>光影与层次</h2><p>微调光感、纵深和色彩的整体关系。</p></div></div>
    <div v-for="group in lightGroups" :key="group.key" class="light-group">
      <ConfigField :path="group.path" :label="group.label" :hint="group.hint" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <details v-if="group.enabled || hasIssue(...group.fields.map(field => field.path))" class="control-details light-details"><summary>{{ group.label }}细调</summary>
        <ConfigField v-for="field in group.fields" :key="field.path" :path="field.path" :label="field.label" :fallback="field.fallback" :presentation="field.path.includes('color') || field.path.includes('density') ? undefined : 'range'" :format="field.path.includes('color') || field.path.includes('density') ? undefined : 'percent'" :hint="field.path === 'effects.fog.density' ? '建议 0.0002–0.001，较高浓度会遮蔽远景。' : field.path === 'effects.bloom.threshold' ? '数值越高，只有更明亮的区域才会发光。' : undefined" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      </details>
    </div>
    <details class="control-details lighting-details"><summary>光照细调 <span>时刻与色彩适应</span></summary>
      <ConfigField path="lighting.timeOfDay" label="光照时刻" fallback="auto" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField path="lighting.autoColorAdapt" label="照片色彩适应" hint="根据场景光线微调照片的呈现。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField path="lighting.transitionDuration" label="光照过渡时间" unit="秒" :fallback="2" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    </details>
  </section>
</template>
<style scoped>
.section-heading { display: flex; gap: 11px; align-items: flex-start; margin-bottom: 17px; }.section-mark { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; border: 1px solid var(--border-strong); border-radius: 9px; color: var(--brand-deep); font-size: 16px; }.section-heading h2 { margin: 0 0 4px; }.section-heading p, .quiet-note { margin: 0; color: var(--text-tertiary); font-size: 11px; line-height: 1.7; }
.control-details { padding-top: 13px; margin-top: 17px; border-top: 1px solid var(--border-subtle); }.control-details summary { cursor: pointer; color: var(--text-primary); font-size: 11px; font-weight: 600; line-height: 1.5; }.control-details summary span { margin-left: 7px; font-size: 10px; font-weight: 400; color: var(--text-tertiary); }.control-details summary:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 4px; }.light-group { padding-bottom: 1px; border-bottom: 1px solid var(--border-subtle); }.light-group:last-of-type { border-bottom: 0; }.light-details { padding: 0 0 15px 12px; margin: -5px 0 0; border-top: 0; }.light-details summary { color: var(--brand-deep); font-size: 10px; }.lighting-details { margin-top: 5px; }
</style>
