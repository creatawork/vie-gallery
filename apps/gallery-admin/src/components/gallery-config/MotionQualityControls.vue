<script setup lang="ts">
import type { ViewerConfig, ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
const groups = [
  { title: '运动', fields: [['effects.photoFloat', '照片浮动'], ['effects.floatAmplitude', '浮动幅度'], ['effects.floatSpeed', '浮动速度'], ['effects.photoEntrance', '照片入场'], ['effects.entranceDuration', '入场时间'], ['layout.transition.style', '布局过渡'], ['layout.transition.duration', '布局过渡时间']] },
  { title: '相机与交互', fields: [['camera.autoRotate', '自动巡航'], ['camera.rotateSpeed', '巡航速度'], ['camera.introFlight', '开场飞行'], ['camera.introDuration', '开场时间'], ['interaction.clickRipple', '点击涟漪'], ['interaction.cursorTrail', '鼠标尾迹']] }
]
</script>
<template>
  <section class="side-block"><h2>画质</h2><ConfigField path="quality" label="画质上限" hint="自动按设备选择起点；性能不足时会降低显示开销，持续卡顿时切换经典画廊。" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
    <p class="quality-note">系统的减少动态效果偏好会暂停浮动、巡航和粒子运动。</p>
  </section>
  <section v-for="group in groups" :key="group.title" class="side-block"><h2>{{ group.title }}</h2>
    <ConfigField v-for="field in group.fields" :key="field[0]" :path="field[0]!" :label="field[1]!" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
  </section>
</template>
<style scoped>.quality-note { color: #475569; font-size: .8125rem; line-height: 1.6; }</style>
