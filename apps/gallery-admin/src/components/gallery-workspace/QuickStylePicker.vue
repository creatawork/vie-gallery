<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { CURATED_STYLES, applyCuratedStyle, serializeViewerConfig, type CuratedStyle } from '@vie/gallery-contracts'
import { useViewerConfigEditor } from '../../composables/useViewerConfigEditor'
const props = defineProps<{ galleryId: string; canWrite: boolean; photos: { thumbnailUrl?: string | null }[] }>()
const emit = defineEmits<{ busy: [value: boolean]; saved: [] }>()
const editor = useViewerConfigEditor(props.galleryId, { canWrite: () => props.canWrite })
const loaded = ref(false), message = ref('')
const selected = computed(() => editor.config.value.layout.mode)
async function load() {
  emit('busy', true); message.value = ''
  try { await editor.load(); loaded.value = true }
  catch { message.value = '风格没有载入，请重试。' }
  finally { emit('busy', !loaded.value) }
}
async function choose(mode: CuratedStyle) {
  if (!loaded.value || editor.saving.value || !props.canWrite) return
  emit('busy', true); message.value = ''
  const previous = serializeViewerConfig(editor.config.value)
  editor.replace(serializeViewerConfig(applyCuratedStyle(editor.config.value, mode)))
  try {
    if (await editor.save()) { message.value = '风格已保存'; emit('saved') }
    else { editor.replace(previous, true); message.value = '风格没有保存，请重新选择。' }
  } finally { emit('busy', false) }
}
onMounted(load)
</script>

<template>
  <section class="quick-styles" aria-label="选择展示风格">
    <div class="style-heading"><span>02 / 展示风格</span><p>给照片一个空间。</p></div>
    <div class="style-choices">
      <button v-for="style in CURATED_STYLES" :key="style.id" :class="style.id" :aria-pressed="selected === style.id" :disabled="!loaded || editor.saving.value || !canWrite" @click="choose(style.id)">
        <span class="style-miniature" :style="{ '--tone': style.color }" aria-hidden="true">
          <span v-for="i in 5" :key="i" class="mini-photo" :style="{ '--i': i }"><img v-if="photos[(i - 1) % Math.max(1, photos.length)]?.thumbnailUrl" :src="photos[(i - 1) % photos.length]?.thumbnailUrl || ''" alt="" /></span>
        </span>
        <span class="style-name">{{ style.label }} <span v-if="selected === style.id">✓</span></span>
        <small>{{ style.caption }}</small>
      </button>
    </div>
    <p class="style-feedback" role="status">{{ editor.saving.value ? '正在保存…' : message || '选好即保存，发布后朋友会看到同样的风格。' }}</p>
    <button v-if="!loaded && message" class="retry-style" @click="load">重试载入</button>
  </section>
</template>

<style scoped>
.quick-styles { padding:25px; border:1px solid #dce3ec; border-radius:18px; background:#fff; margin:22px 0; }
.style-heading { display:flex; align-items:baseline; gap:22px; margin-bottom:20px; }.style-heading>span { font:11px system-ui; letter-spacing:.1em; color:#60738c; }.style-heading p { margin:0; font:24px 'Songti SC','SimSun',serif; color:#24364a; }
.style-choices { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.style-choices button { min-width:0; padding:6px 6px 16px; text-align:left; border:1px solid #dce3ec; background:#fff; border-radius:13px; cursor:pointer; }
.style-choices button[aria-pressed=true] { border-color:#5578a0; box-shadow:0 0 0 2px #5578a01c; background:#f3f6fa; }
.style-choices button:disabled { cursor:default; opacity:.65; }.style-choices button:focus-visible { outline:2px solid #5578a0; outline-offset:4px; }
.style-miniature { display:block; position:relative; height:138px; border-radius:8px; background:radial-gradient(ellipse at 70% 90%,var(--tone),#101827 80%); overflow:hidden; perspective:500px; }
.mini-photo { position:absolute; top:38%; left:44%; width:44px; height:48px; border:1px solid #c2d1e0; background:linear-gradient(150deg,#adc4d1,#4e6c82 60%,#223244); box-shadow:4px 5px 13px #0005; }.mini-photo img { width:100%; height:100%; object-fit:cover; }
.helix .mini-photo { transform:translate(calc((var(--i) - 3)*26px),calc((var(--i) - 3)*-17px)) rotateY(calc((var(--i) - 3)*16deg)) rotate(-12deg); }
.carousel .mini-photo { transform:translateX(calc((var(--i) - 3)*39px)) translateZ(calc((3 - var(--i))*8px)) rotateY(calc((var(--i) - 3)*-23deg)); }
.grid .mini-photo { transform:translate(calc((var(--i) - 3)*38px),calc((var(--i) - 3)*8px)) rotateY(-25deg); }
.style-name { display:flex; justify-content:space-between; margin:14px 12px 6px; font-size:15px; color:#24364a; }.style-name>span { color:#5578a0; }.style-choices small { display:block; margin:0 12px; color:#687b92; font-size:11px; }.style-feedback { margin:14px 0 0; font-size:12px; color:#687b92; }.retry-style { border:0; background:#e7edf4; padding:10px 20px; margin-top:12px; border-radius:8px; }
@media(max-width:600px) { .quick-styles { padding:16px 10px; }.style-heading { padding:0 6px; gap:14px; }.style-heading p { font-size:20px; }.style-choices { gap:7px; }.style-miniature { height:96px; }.mini-photo { width:29px; height:35px; }.style-name { margin:12px 6px 4px; }.style-choices small { margin:0 6px; line-height:1.5; font-size:10px; } }
</style>
