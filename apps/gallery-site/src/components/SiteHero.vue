<script setup lang="ts">
import { computed } from 'vue'
import { useSite } from '../siteContext'
import Live3dHero from './Live3dHero.vue'

const site = useSite()
const hero = computed(() => site.config.content.hero)
const cover = computed(() => site.resolvePhoto(hero.value.coverPhotoId))
const templateId = computed(() => site.template.id)

/** 主 CTA（§4.2 hero 必备）：封面型模板叠加在图上；无封面时作为排版 hero 的落款 */
const showCta = computed(
  () => (templateId.value === 'plain' || templateId.value === 'lumen' || !cover.value) && !!hero.value.cta?.label
)

function ctaHref(): string {
  return hero.value.cta.action === 'contact' ? '#contact' : '#projects'
}
</script>

<template>
  <!-- T1：纯排版 hero（无大图） -->
  <header v-if="templateId === 'white-box'" class="hero wrap" id="top">
    <h1>
      {{ hero.headline }}
      <em v-if="hero.subHeadline">{{ hero.subHeadline }}</em>
    </h1>
    <div class="hero-meta">
      <span v-for="p in site.config.content.projects.filter((x) => !x.archived).slice(0, 2)" :key="p.galleryId">
        <b>{{ p.title }}</b>
      </span>
      <span v-if="hero.cta?.label"><a :href="ctaHref()">{{ hero.cta.label }}</a></span>
    </div>
  </header>

  <!-- T4：实时 3D 展厅 hero（含降级策略 §5.7） -->
  <Live3dHero v-else-if="site.template.heroMode === 'live3d'" />

  <!-- T3：左文右图不对称章节 -->
  <header v-else-if="templateId === 'field-notes'" class="hero wrap" id="top">
    <div class="hero-grid">
      <div class="hero-copy">
        <p class="chapter">作品集 · PORTFOLIO</p>
        <h1>{{ hero.headline }}</h1>
        <p v-if="hero.subHeadline" class="hero-desc">{{ hero.subHeadline }}</p>
      </div>
      <div class="vertical" aria-hidden="true">{{ site.config.content.brand.name }}</div>
      <figure class="hero-media">
        <img v-if="cover" :src="cover" :alt="hero.headline" />
      </figure>
    </div>
  </header>

  <!-- T0 / T2：大图叠加标题 -->
  <header v-else class="hero" id="top" :class="{ 'no-cover': !cover }">
    <img v-if="cover" class="hero-img" :src="cover" :alt="hero.headline" />
    <div class="hero-copy">
      <h1>{{ hero.headline }}</h1>
      <p v-if="hero.subHeadline">{{ hero.subHeadline }}</p>
      <div v-if="templateId === 'darkroom'" class="rule" aria-hidden="true"></div>
      <a v-if="showCta && hero.cta?.label" class="btn btn-primary hero-cta" :href="ctaHref()">{{ hero.cta.label }}</a>
    </div>
  </header>
</template>
