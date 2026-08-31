<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Gallery } from '@vie/gallery-contracts'
const gallery = ref<Gallery | null>(null)
const slug = location.pathname.split('/').filter(Boolean).pop() || 'demo'
onMounted(async () => { const response = await fetch(`/api/public/g/${slug}`); if (response.ok) gallery.value = await response.json() as Gallery })
</script>

<template>
  <main class="viewer"><header><span class="wordmark">VIE / GALLERY</span><button class="share" aria-label="分享">↗</button></header><section class="intro"><p class="kicker">Public gallery</p><h1>{{ gallery?.name || 'Moments in light' }}</h1><p class="meta">{{ gallery ? 'A curated collection of photographs' : 'Loading collection...' }}</p></section><section class="photo-wall" aria-label="照片墙"><div v-for="index in 12" :key="index" class="photo-tile" :style="{ '--i': index }"></div></section></main>
</template>
