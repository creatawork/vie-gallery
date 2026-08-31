<script setup lang="ts">
import { ref } from 'vue'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

const galleries = ref<Gallery[]>([])
const loading = ref(false)
async function loadGalleries() {
  loading.value = true
  try {
    const response = await apiFetch('/api/galleries')
    if (response.ok) galleries.value = await response.json() as Gallery[]
  } finally { loading.value = false }
}
loadGalleries()
</script>

<template>
  <header class="page-header"><div><p class="eyebrow">Workspace</p><h1>照片空间</h1></div><button class="primary">新建空间</button></header>
  <section class="toolbar"><span>{{ galleries.length }} 个空间</span><button class="quiet" @click="loadGalleries">{{ loading ? '加载中' : '刷新' }}</button></section>
  <section class="gallery-grid" aria-live="polite">
    <article v-for="gallery in galleries" :key="gallery.id" class="gallery-card"><div class="card-image"></div><div class="card-body"><h2>{{ gallery.name }}</h2><span>{{ gallery.visibility }}</span></div></article>
    <div v-if="!loading && galleries.length === 0" class="empty-state"><strong>还没有照片空间</strong><p>创建一个空间，开始整理和分享照片。</p></div>
  </section>
</template>
