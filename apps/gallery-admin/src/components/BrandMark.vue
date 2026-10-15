<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <span class="fold-mark" aria-hidden="true">
    <svg :width="size" :height="size" viewBox="0 0 32 32" fill="none">
      <path d="M6 9.2 16 4l10 5.2v6.1L16 21.6 6 15.3V9.2Z" fill="var(--mint-400, #52977e)" />
      <path d="M16 4v17.6l10-6.3V9.2L16 4Z" fill="var(--brand-accent, #26735d)" />
      <path d="M6 15.3 16 21.6 26 15.3 16 28 6 15.3Z" fill="var(--brand-deep, #1c5948)" />
    </svg>
  </span>
</template>
