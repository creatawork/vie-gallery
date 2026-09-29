<script setup lang="ts">
import { computed } from 'vue'
import { useSite } from '../siteContext'

const site = useSite()
const brand = computed(() => site.config.content.brand)
const logoUrl = computed(() => (brand.value.logoStorageObjectId ? site.resolvePhoto(brand.value.logoStorageObjectId) : null))
const initial = computed(() => [...brand.value.name.trim()][0] ?? '影')
const showMark = computed(() => site.template.id !== 'white-box' && !logoUrl.value)

/** 锚点文案是模板性格的一部分（§5 各套定义） */
const NAV_LABELS: Record<string, { projects: string; about: string; contact: string }> = {
  plain: { projects: '项目', about: '关于', contact: '联系' },
  'white-box': { projects: '作品', about: '关于', contact: '联络' },
  darkroom: { projects: '作品', about: '关于', contact: '联络' },
  'field-notes': { projects: '篇目', about: '作者', contact: '来信' },
  lumen: { projects: '作品', about: '关于', contact: '联络' }
}

const labels = computed(() => NAV_LABELS[site.template.id] ?? NAV_LABELS.plain!)
const links = computed(() => {
  const sections = new Set(site.template.sections)
  const items: Array<{ href: string; label: string }> = []
  if (sections.has('projects')) items.push({ href: '#projects', label: labels.value.projects })
  if (sections.has('about')) items.push({ href: '#about', label: labels.value.about })
  if (sections.has('contact')) items.push({ href: '#contact', label: labels.value.contact })
  return items
})
</script>

<template>
  <nav class="nav">
    <div class="nav-in">
      <a class="brand" href="#top">
        <img v-if="logoUrl" class="brand-logo" :src="logoUrl" :alt="brand.name" />
        <span v-else-if="showMark" class="brand-mark" aria-hidden="true">{{ initial }}</span>
        <span class="brand-name">{{ brand.name }}</span>
      </a>
      <div class="nav-links">
        <a v-for="link in links" :key="link.href" :href="link.href">{{ link.label }}</a>
      </div>
    </div>
  </nav>
</template>
