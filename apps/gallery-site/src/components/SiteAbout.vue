<script setup lang="ts">
import { computed } from 'vue'
import { useSite } from '../siteContext'

const site = useSite()
const about = computed(() => site.config.content.about)
const portrait = computed(() => site.resolvePhoto(about.value?.portraitPhotoId))
const paragraphs = computed(() => (about.value?.body ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean))
const lead = computed(() => paragraphs.value[0] ?? '')
const rest = computed(() => paragraphs.value.slice(1))
const showPortrait = computed(() => !!portrait.value && site.template.id !== 'darkroom')
const kicker = computed(() => (site.template.id === 'field-notes' ? '关于作者 · ABOUT' : ''))
</script>

<template>
  <section id="about" class="about-sec" v-reveal>
    <div class="wrap">
      <div class="sec-label" v-if="site.template.id === 'plain'"><h2>关于我</h2></div>
      <h2 class="about-heading" v-else-if="site.template.id === 'white-box'">关于</h2>
      <div class="about">
        <figure v-if="showPortrait && portrait" class="about-portrait">
          <div class="ph"><img :src="portrait" alt="摄影师形象照" loading="lazy" /></div>
        </figure>
        <div class="about-text" :class="{ 'about-in': site.template.id === 'darkroom' }">
          <p class="kicker" v-if="kicker">{{ kicker }}</p>
          <p class="about-lead" v-if="lead">
            {{ lead }}
            <svg
              v-if="site.template.id === 'field-notes'"
              class="u-doodle"
              viewBox="0 0 200 10"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M2 6 C 40 2, 80 9, 120 5 S 190 4, 198 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          </p>
          <p v-for="(p, i) in rest" :key="i">{{ p }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
