<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSite } from '../siteContext'

/**
 * T4 流光 hero（§5 T4 / §5.7 降级策略）：
 *  - 桌面端默认挂载只读 Viewer（复用既有页面，isEmbed 下 HUD 自动隐藏）
 *  - 移动端 / 省流 / 低内存 / reduced-motion → 自动降级为封面静帧 + 「进入 3D 展厅」按钮
 *  - Viewer 侧自身仍有 quality:'auto' + autoAdjustForDevice 二次兜底，不重复造检测
 */
const site = useSite()
const hero = computed(() => site.config.content.hero)

const embedTarget = computed(() => {
  for (const p of site.config.content.projects) {
    if (p.archived) continue
    const href = site.galleryHref(p.galleryId)
    if (href) return href
  }
  return null
})

const stillCover = computed(() => {
  return (
    site.resolvePhoto(hero.value.coverPhotoId) ??
    site.resolvePhoto(site.config.content.projects.find((p) => !p.archived)?.coverPhotoId)
  )
})

const mode = ref<'pending' | 'live' | 'still'>('pending')

function shouldDegrade(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
  if (window.matchMedia('(pointer: coarse)').matches) return true
  if (window.innerWidth < 860) return true
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return true
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (typeof memory === 'number' && memory > 0 && memory < 4) return true
  return false
}

onMounted(() => {
  mode.value = shouldDegrade() || !embedTarget.value ? 'still' : 'live'
})

const heroHref = computed(() => embedTarget.value)
const tagText = computed(() => (mode.value === 'live' ? '实时 3D 展厅' : '3D 展厅'))
</script>

<template>
  <header class="hero hero-live3d" id="top">
    <div class="hero-scene">
      <iframe
        v-if="mode === 'live' && heroHref"
        class="hero-iframe"
        :src="heroHref"
        title="实时 3D 展厅预览"
        loading="lazy"
      ></iframe>
      <img v-else-if="stillCover" class="hero-still" :src="stillCover" :alt="hero.headline" />
      <div v-else class="hero-still hero-still-blank" aria-hidden="true"></div>
    </div>
    <div class="hero-overlay">
      <span class="hero-tag" v-if="mode !== 'pending'"><i aria-hidden="true"></i>{{ tagText }}</span>
      <h1>{{ hero.headline }}</h1>
      <p v-if="hero.subHeadline">{{ hero.subHeadline }}</p>
      <div class="hero-cta">
        <a v-if="heroHref" class="btn btn-primary" :href="heroHref">进入 3D 展厅</a>
        <a class="btn btn-ghost" href="#projects">{{ hero.cta?.label || '浏览作品集' }}</a>
      </div>
    </div>
  </header>
</template>
