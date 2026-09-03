<script setup lang="ts">
import { ref } from 'vue'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

const galleries = ref<Gallery[]>([])
const loading = ref(false)
const selectedGallery = ref<string | null>(null)
const photos = ref<any[]>([])
const uploading = ref(false)
async function loadPhotos(id: string) { selectedGallery.value=id; const r=await apiFetch(`/api/galleries/${id}/photos`); if(r.ok) photos.value=await r.json() }
async function uploadFiles(event: Event) { const input=event.target as HTMLInputElement; if(!input.files?.length || !selectedGallery.value)return; uploading.value=true; try { const form=new FormData(); Array.from(input.files).forEach(f=>form.append("files",f)); const response=await apiFetch(`/api/galleries/${selectedGallery.value}/photos`,{method:"POST",body:form}); const result=await response.json() as {items?:{taskId:string}[]}; if(response.ok && result.items){ for(const item of result.items){ for(let i=0;i<30;i++){ await new Promise(r=>setTimeout(r,1000)); const task=await apiFetch(`/api/photos/tasks/${item.taskId}`); if(!task.ok) break; const state=await task.json() as {status:string}; if(["SUCCEEDED","FAILED"].includes(state.status)) break } } } await loadPhotos(selectedGallery.value) } finally { uploading.value=false; input.value="" } }
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
    <article v-for="gallery in galleries" :key="gallery.id" class="gallery-card" @click="loadPhotos(gallery.id)"><div class="card-image"></div><div class="card-body"><h2>{{ gallery.name }}</h2><span>{{ gallery.visibility }}</span></div></article>
    <div v-if="!loading && galleries.length === 0" class="empty-state"><strong>还没有照片空间</strong><p>创建一个空间，开始整理和分享照片。</p></div>
  </section>
  <section v-if="selectedGallery" class="photo-panel"><label class="primary">{{ uploading ? "上传中…" : "上传照片" }}<input type="file" multiple accept="image/jpeg,image/png,image/webp" @change="uploadFiles" hidden /></label><div class="photo-grid"><article v-for="photo in photos" :key="photo.id" class="photo-card"><img v-if="photo.thumbnailUrl" :src="photo.thumbnailUrl" :alt="photo.title" /><div v-else class="card-image"></div><span>{{ photo.status }}</span><small>{{ Math.round((photo.byteSize || 0)/1024) }} KB</small></article></div></section>
</template>
