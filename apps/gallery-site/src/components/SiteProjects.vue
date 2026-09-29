<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BrandSiteProjectRef } from '@vie/gallery-contracts'
import { useSite } from '../siteContext'
import { showToast } from '../toast'
import { trackEvent } from '../brand/track'

const site = useSite()
const projects = computed(() =>
  site.config.content.projects.filter((p) => !p.archived).sort((a, b) => a.sortOrder - b.sortOrder)
)
const variant = computed(() => site.config.projectCardVariant)
const templateId = computed(() => site.template.id)

/** 区块标题是模板性格的一部分（§5 各套定义） */
const HEADINGS: Record<string, { title: string; eyebrow?: string; note?: string }> = {
  plain: { title: '精选项目' },
  'white-box': { title: '作品索引', note: '按完工时间倒序' },
  darkroom: { title: '近期的日子', eyebrow: 'SELECTED WORKS' },
  'field-notes': { title: '篇目目录' },
  lumen: { title: '精选项目 ·', note: 'SCROLL' }
}
const heading = computed(() => HEADINGS[templateId.value] ?? HEADINGS.plain!)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function coverOf(p: BrandSiteProjectRef): string | null {
  return site.resolvePhoto(p.coverPhotoId)
}

function hrefOf(p: BrandSiteProjectRef): string | null {
  return site.galleryHref(p.galleryId)
}

function openProject(p: BrandSiteProjectRef, event: MouseEvent): void {
  trackEvent('site_project_open', { galleryId: p.galleryId, title: p.title })
  if (!hrefOf(p)) {
    event.preventDefault()
    showToast(site.isEmbed ? '正式站点将进入该组的 3D 展厅' : '演示模式：正式站点将进入 3D 展厅')
  }
}

/* T1 白盒：索引行 hover 跟随缩略图（pointer:fine 才启用） */
const thumbSrc = ref('')
const thumbOn = ref(false)
const thumbStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })
const enableThumbFollow = computed(() => site.template.motion.indexThumbFollow === true)

function onItemEnter(p: BrandSiteProjectRef): void {
  if (!enableThumbFollow.value || !window.matchMedia('(pointer: fine)').matches) return
  thumbSrc.value = coverOf(p) ?? ''
  thumbOn.value = true
}

function onItemLeave(): void {
  thumbOn.value = false
}

function onItemMove(event: MouseEvent): void {
  if (!thumbOn.value) return
  thumbStyle.value = {
    left: `${Math.min(event.clientX + 28, window.innerWidth - 300)}px`,
    top: `${Math.max(event.clientY - 100, 16)}px`
  }
}
</script>

<template>
  <section id="projects" class="projects-sec" v-reveal>
    <div class="wrap">
      <div class="sec-head" :class="{ 'sec-label': templateId === 'plain' }">
        <p class="eyebrow" v-if="heading.eyebrow">{{ heading.eyebrow }}</p>
        <h2>{{ heading.title }}</h2>
        <span v-if="heading.note" class="sec-note">{{ heading.note }}</span>
      </div>

      <p class="projects-empty" v-if="projects.length === 0">
        还没有精选项目——在管理端「品牌站 → 内容编辑」中添加相册，就会出现在这里。
      </p>

      <!-- index：编号列表（T1 白盒默认） -->
      <ul v-else-if="variant === 'index'" class="index-list">
        <li
          v-for="(p, i) in projects"
          :key="p.galleryId"
          class="index-item"
          @mouseenter="onItemEnter(p)"
          @mouseleave="onItemLeave"
          @mousemove="onItemMove"
        >
          <a :href="hrefOf(p) ?? '#'" @click="openProject(p, $event)">
            <span class="no">{{ pad(i + 1) }}</span>
            <span class="ti">{{ p.title }}<small v-if="p.summary">{{ p.summary }}</small></span>
            <span class="yr" v-if="p.year">{{ p.year }}</span>
          </a>
        </li>
      </ul>

      <!-- feature：通栏大图逐个排列（T4 流光默认） -->
      <div v-else-if="variant === 'feature'" class="feature-list">
        <article v-for="(p, i) in projects" :key="p.galleryId" class="work">
          <a class="work-media" :href="hrefOf(p) ?? '#'" @click="openProject(p, $event)">
            <img v-if="coverOf(p)" :src="coverOf(p)!" :alt="p.title" loading="lazy" />
          </a>
          <div class="work-bar">
            <div class="work-card">
              <h3>{{ p.title }}<em v-if="p.year">{{ p.year }}</em></h3>
              <p v-if="p.summary">{{ p.summary }}</p>
            </div>
            <a
              v-if="templateId === 'lumen' && hrefOf(p)"
              class="btn-view3d"
              :href="hrefOf(p)!"
              @click="openProject(p, $event)"
              >在 3D 展厅看这一组 →</a
            >
            <span v-else-if="templateId === 'lumen'" class="btn-view3d is-dim">{{ pad(i + 1) }}</span>
          </div>
        </article>
      </div>

      <!-- mosaic：双列卡片（默认） -->
      <div v-else class="mosaic">
        <a
          v-for="p in projects"
          :key="p.galleryId"
          class="card"
          :href="hrefOf(p) ?? '#'"
          @click="openProject(p, $event)"
        >
          <div class="ph">
            <img v-if="coverOf(p)" :src="coverOf(p)!" :alt="p.title" loading="lazy" />
          </div>
          <h3>{{ p.title }}</h3>
          <p v-if="p.summary">{{ p.summary }}</p>
        </a>
      </div>
    </div>

    <img
      v-if="enableThumbFollow"
      class="index-thumb"
      :class="{ on: thumbOn }"
      :style="thumbStyle"
      :src="thumbSrc"
      alt=""
      aria-hidden="true"
    />
  </section>
</template>
