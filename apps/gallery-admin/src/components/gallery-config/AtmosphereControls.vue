<script setup lang="ts">
import { computed } from 'vue'
import type { ViewerConfig, ConfigIssue } from '@vie/gallery-contracts'
import ConfigField from './ConfigField.vue'
const props = defineProps<{ config: ViewerConfig; issues: ConfigIssue[]; disabled: boolean }>()
const emit = defineEmits<{ patch: [input: unknown] }>()
// 渐变副色与角度只对渐变背景有意义；全景图片/纯色/关闭时隐藏。
const groups = computed(() => {
  const backgroundFields: [string, string][] = [['background.mode', '背景类型'], ['background.color', '背景主色']]
  if (props.config.background?.mode === 'gradient') backgroundFields.push(['background.secondaryColor', '背景副色'], ['background.angle', '渐变角度'])
  return [
    { title: '背景', fields: backgroundFields },
    { title: '粒子', fields: [['particles.enabled', '启用粒子'], ['particles.types', '粒子类型'], ['particles.density', '粒子密度'], ['particles.speed', '粒子速度'], ['particles.size', '粒子大小'], ['particles.color', '粒子颜色']] },
    { title: '辉光', fields: [['effects.bloom.enabled', '启用辉光'], ['effects.bloom.strength', '辉光强度'], ['effects.bloom.radius', '辉光半径'], ['effects.bloom.threshold', '辉光阈值']] },
    { title: '雾', fields: [['effects.fog.enabled', '启用雾'], ['effects.fog.color', '雾颜色'], ['effects.fog.density', '雾密度']] },
    { title: '调色与暗角', fields: [['effects.postGrade.enabled', '启用调色'], ['effects.postGrade.saturation', '饱和度'], ['effects.postGrade.brightness', '亮度'], ['effects.postGrade.contrast', '对比度'], ['effects.vignette.enabled', '启用暗角'], ['effects.vignette.strength', '暗角强度']] },
    { title: '光照', fields: [['lighting.timeOfDay', '光照时刻'], ['lighting.autoColorAdapt', '照片色彩适应'], ['lighting.transitionDuration', '光照过渡时间']] }
  ]
})
</script>
<template><section v-for="group in groups" :key="group.title" class="side-block"><h2>{{ group.title }}</h2>
  <ConfigField v-for="field in group.fields" :key="field[0]" :path="field[0]!" :label="field[1]!" :fallback="field[0] === 'particles.color' ? '#ffffff' : undefined" :config="config" :issues="issues" :disabled="disabled" @patch="emit('patch', $event)" />
</section></template>
