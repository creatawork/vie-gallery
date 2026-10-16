<script setup lang="ts">
import { computed } from 'vue'
import { resolvePhotoArrangement, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
const props = defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const curated = computed(() => props.config.layout.params?.composition === 'curated')
const isBook = computed(() => curated.value && resolvePhotoArrangement(props.config) === 'book')
function hasIssue(...paths: string[]) { return props.issues.some(issue => paths.some(path => issue.path === path || issue.path.startsWith(`${path}.`))) }
</script>
<template>
  <details class="side-block motion-controls">
    <summary><span class="summary-copy"><strong>运动与画质</strong><small>播放节奏、交互和设备适配</small></span><span class="summary-plus" aria-hidden="true">+</span></summary>
    <section v-if="!isBook || hasIssue('effects.photoFloat', 'effects.floatAmplitude', 'effects.floatSpeed', 'effects.photoEntrance', 'effects.entranceDuration')" class="motion-section">
      <h3>照片动态</h3>
      <ConfigField path="effects.photoFloat" label="轻微浮动" hint="让照片缓慢起伏，关闭后位置保持稳定。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <template v-if="config.effects.photoFloat || hasIssue('effects.floatAmplitude', 'effects.floatSpeed')">
        <ConfigField path="effects.floatAmplitude" label="浮动幅度" presentation="range" format="percent" :fallback="1" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
        <ConfigField path="effects.floatSpeed" label="浮动速度" presentation="range" format="speed" :fallback="1" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      </template>
      <ConfigField path="effects.photoEntrance" label="照片入场" fallback="fade" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField v-if="config.effects.photoEntrance !== 'none' || hasIssue('effects.entranceDuration')" path="effects.entranceDuration" label="入场时间" unit="秒" :fallback=".5" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    </section>
    <section class="motion-section">
      <h3>切换与播放</h3>
      <ConfigField path="layout.transition.style" label="布局过渡" :options="curated ? ['smooth', 'none'] : undefined" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField v-if="config.layout.transition?.style !== 'none' || hasIssue('layout.transition.duration')" path="layout.transition.duration" label="过渡时间" unit="秒" :fallback="1.2" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField path="camera.autoRotate" :label="curated ? '自动播放' : '自动巡航'" :hint="curated ? '按节奏切换作品，访客仍可手动浏览。' : '无人操作时，缓慢旋转展厅视角。'" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField v-if="config.camera?.autoRotate || hasIssue('camera.rotateSpeed')" path="camera.rotateSpeed" :label="curated ? '播放速度' : '巡航速度'" presentation="range" format="speed" :fallback=".5" hint="调至 0 可暂停自动运动。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <template v-if="!curated || hasIssue('camera.introFlight', 'camera.introDuration')">
        <ConfigField path="camera.introFlight" label="开场飞行" hint="打开展厅时，用一次短暂的镜头移动引入作品。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
        <ConfigField v-if="config.camera?.introFlight || hasIssue('camera.introDuration')" path="camera.introDuration" label="开场时间" unit="秒" :fallback="2" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      </template>
    </section>
    <section class="motion-section">
      <h3>互动反馈</h3>
      <ConfigField path="interaction.clickRipple" label="点击涟漪" hint="点击时，在画面上留下短暂的光波。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <ConfigField path="interaction.cursorTrail" label="鼠标光迹" hint="跟随鼠标移动的轻盈轨迹。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    </section>
    <section class="motion-section">
      <h3>设备适配</h3>
      <ConfigField path="quality" label="画质上限" hint="推荐自动适配：根据设备能力平衡细节和流畅度。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
      <p class="quality-note">系统开启「减少动态效果」时，展厅会减少运动；设备持续卡顿时，会自动切换为经典画廊。</p>
    </section>
  </details>
</template>
<style scoped>
.motion-controls { padding-top: 18px; padding-bottom: 18px; }
summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; list-style: none; }summary::-webkit-details-marker { display: none; }summary:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 5px; }.summary-copy { display: grid; gap: 5px; }.summary-copy strong { font-size: 13px; color: var(--text-primary); font-weight: 650; }.summary-copy small { font-size: 10px; color: var(--text-tertiary); }.summary-plus { color: var(--brand-deep); font-size: 22px; line-height: 1; transition: transform .18s; }details[open] .summary-plus { transform: rotate(45deg); }
.motion-section { padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--border-subtle); }.motion-section h3 { margin: 0 0 4px; color: var(--brand-deep); font-size: 11px; font-weight: 650; letter-spacing: .02em; }.motion-section :deep(.config-field:last-child) { margin-bottom: 0; }.quality-note { margin: 12px 0 0; padding: 10px 11px; border-radius: 8px; background: #f5f7f3; color: var(--text-tertiary); font-size: 10px; line-height: 1.8; }
@media (prefers-reduced-motion: reduce) { .summary-plus { transition: none; } }
</style>
