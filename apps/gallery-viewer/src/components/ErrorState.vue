<script setup lang="ts">
import Icon from './Icon.vue'
import VisitorStateShell from './VisitorStateShell.vue'
defineProps<{ title: string; message: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <VisitorStateShell>
    <span class="state-icon"><Icon name="warning" :size="28" :stroke-width="1.5" /></span>
    <h1>{{ title }}</h1>
    <p class="state-description" role="status">{{ message }}</p>
    <button type="button" class="state-action" @click="emit('retry')"><Icon name="refresh" :size="16" /><span>重新加载</span></button>
  </VisitorStateShell>
</template>
