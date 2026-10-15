<script setup lang="ts">
import Icon from './Icon.vue'
import VisitorStateShell from './VisitorStateShell.vue'
defineProps<{ message?: string }>()
</script>

<template>
  <VisitorStateShell>
    <span class="state-icon"><Icon name="photo" :size="28" :stroke-width="1.5" /></span>
    <h1>影展正在筹备中</h1>
    <p class="state-description">{{ message || '这里还没有作品。创作者正在准备照片，请稍后再来欣赏。' }}</p>
  </VisitorStateShell>
</template>
