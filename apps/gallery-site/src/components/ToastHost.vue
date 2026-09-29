<script setup lang="ts">
import { toasts } from '../toast'
</script>

<template>
  <div class="toast show" role="status" v-if="toasts.length">{{ toasts[toasts.length - 1].msg }}</div>
</template>
