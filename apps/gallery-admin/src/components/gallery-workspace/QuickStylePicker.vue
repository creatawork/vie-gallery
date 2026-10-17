<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { CURATED_STYLES, applyCuratedStyle, resolveCuratedStyle, serializeViewerConfig, type CuratedStyle } from '@vie/gallery-contracts'
import { useViewerConfigEditor } from '../../composables/useViewerConfigEditor'
import Icon from '../Icon.vue'
const props = defineProps<{ galleryId: string; canWrite: boolean; photos: { thumbnailUrl?: string | null }[] }>()
const emit = defineEmits<{ busy: [value: boolean]; saved: []; ready: [value: boolean] }>()
const editor = useViewerConfigEditor(props.galleryId, { canWrite: () => props.canWrite })
const loaded = ref(false), message = ref('')
const selected = computed(() => resolveCuratedStyle(editor.config.value))
const hasCuratedStyle = computed(() => selected.value !== undefined)
async function load() {
  emit('busy', true); message.value = ''
  try { await editor.load(); loaded.value = true; emit('ready', true) }
  catch { loaded.value = false; emit('ready', false); message.value = '风格没有载入，请重试。' }
  finally { emit('busy', false) }
}
async function choose(mode: CuratedStyle) {
  if (!loaded.value || editor.saving.value || !props.canWrite || selected.value === mode) return
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
    <div class="style-heading"><h2>观看编排</h2><span class="style-autosave"><Icon name="check" :size="13" /> 选好即保存</span></div>
    <p class="style-intro">先选择观看编排，再到展示设计中搭配照片质感与空间氛围。切换编排会保留已保存的氛围设置。</p>
    <div class="style-choices">
      <button v-for="style in CURATED_STYLES" :key="style.id" type="button" :class="style.id" :aria-pressed="loaded && selected === style.id" :disabled="!loaded || editor.saving.value || !canWrite" @click="choose(style.id)">
        <span class="style-miniature" :style="{ '--tone': style.color }" aria-hidden="true">
          <span v-for="i in 5" :key="i" class="mini-photo" :style="{ '--i': i }"><img v-if="photos[(i - 1) % Math.max(1, photos.length)]?.thumbnailUrl" :src="photos[(i - 1) % photos.length]?.thumbnailUrl || ''" alt="" /></span>
        </span>
        <span class="style-name">{{ style.label }} <span v-if="loaded && selected === style.id" class="style-check"><Icon name="check" :size="12" /></span></span>
        <small>{{ style.caption }}</small>
      </button>
    </div>
    <p class="style-feedback" :class="{ 'is-error': !loaded && message }" role="status">{{ editor.saving.value ? '正在保存风格…' : message || (!loaded ? '正在载入展示风格…' : hasCuratedStyle ? '发布后，访客会以此风格浏览作品。' : '当前为自定义布局。选择一种风格即可替换，或在更多设置中继续调整。') }}</p>
    <button v-if="!loaded && message" class="retry-style" type="button" @click="load">重试载入</button>
  </section>
</template>

<style scoped>
.quick-styles {
  padding:24px;
  border:1px solid var(--border-strong);
  border-radius:12px;
  background:var(--bg-surface)
}

.style-heading {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px
}

.style-heading>div>span {
  font-size:10px;
  letter-spacing:.12em;
  color:var(--brand-deep)
}

.style-heading h2 {
  margin:7px 0 0;
  font-size:21px;
  font-weight:650;
  letter-spacing:-.03em;
  color:var(--text-primary)
}

.style-autosave {
  display:inline-flex;
  align-items:center;
  gap:5px;
  color:var(--text-secondary);
  font-size:11px;
  white-space:nowrap
}

.style-intro {
  margin:9px 0 20px;
  color:var(--text-secondary);
  font-size:12px;
  line-height:1.6
}

.style-choices {
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:12px
}

.style-choices button {
  min-width:0;
  padding:5px 5px 16px;
  text-align:left;
  border:1px solid var(--border-strong);
  background:var(--bg-surface);
  border-radius:9px;
  transition:border-color .18s,background .18s
}

.style-choices button[aria-pressed=true] {
  border-color:var(--brand-accent);
  background:var(--mint-soft)
}

.style-choices button:hover:not(:disabled) {
  border-color:var(--brand-accent)
}

.style-choices button:disabled {
  cursor:not-allowed;
  opacity:.65
}

.style-choices button:focus-visible {
  outline:2px solid var(--brand-accent);
  outline-offset:3px
}

.style-miniature {
  display:block;
  position:relative;
  height:146px;
  border-radius:5px;
  background:radial-gradient(ellipse at 60% 100%,var(--tone),#18251f 85%);
  overflow:hidden;
  perspective:500px
}

.mini-photo {
  position:absolute;
  top:38%;
  left:44%;
  width:42px;
  height:50px;
  border:1px solid #c8d2c8;
  background:linear-gradient(150deg,#d8d7c5,#80948b 60%,#344b41);
  box-shadow:4px 5px 13px #0005
}

.mini-photo img {
  width:100%;
  height:100%;
  object-fit:cover
}

.helix .mini-photo {
  transform:translate(calc((var(--i) - 3)*26px),calc((var(--i) - 3)*-17px)) rotateY(calc((var(--i) - 3)*16deg)) rotate(-12deg)
}

.carousel .mini-photo {
  transform:translateX(calc((var(--i) - 3)*39px)) translateZ(calc((3 - var(--i))*8px)) rotateY(calc((var(--i) - 3)*-23deg))
}

.grid .mini-photo {
  transform:translate(calc((var(--i) - 3)*38px),calc((var(--i) - 3)*8px)) rotateY(-25deg)
}

.book .mini-photo {
  width:58px;
  height:70px;
  top:27%;
  left:36%;
  border:3px solid #e8e2d2;
  transform-origin:left center;
  transform:translateX(calc((var(--i) - 3)*4px)) rotateY(calc((var(--i) - 3)*-22deg));
}

.tunnel .mini-photo {
  top:25%;
  left:35%;
  width:62px;
  height:78px;
  transform:translateX(calc((var(--i) - 3)*18px)) translateZ(calc((var(--i) - 3)*-80px)) rotateY(-15deg);
}

.style-name {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:5px;
  margin:14px 10px 6px;
  font-size:14px;
  font-weight:600;
  color:var(--text-primary)
}

.style-check {
  display:grid;
  place-items:center;
  width:18px;
  height:18px;
  border-radius:50%;
  background:var(--brand-accent);
  color:white
}

.style-choices small {
  display:block;
  margin:0 10px;
  color:var(--text-secondary);
  font-size:11px;
  line-height:1.6
}

.style-feedback {
  margin:16px 0 0;
  font-size:12px;
  color:var(--text-secondary)
}

.style-feedback.is-error {
  color:#a43730
}

.retry-style {
  border:1px solid var(--border-strong);
  background:var(--bg-surface);
  padding:10px 18px;
  margin-top:12px;
  border-radius:8px;
  font-size:12px;
  color:var(--brand-deep)
}

@media(max-width:1050px) {
  .style-choices { grid-template-columns:repeat(3,minmax(0,1fr)) }
}

@media(max-width:640px) {
  .quick-styles {
    padding:20px 14px
  }
  .style-heading h2 {
    font-size:19px
  }
  .style-autosave {
    font-size:10px
  }
  .style-choices {
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:10px
  }
  .style-miniature {
    height:108px
  }
  .mini-photo {
    width:29px;
    height:36px
  }
  .style-name {
    font-size:12px;
    margin:12px 6px 5px
  }
  .style-choices small {
    margin:0 6px;
    font-size:11px
  }
  .style-check {
    width:15px;
    height:15px
  }
}

@media(prefers-reduced-motion:reduce) {
  .style-choices button {
    transition:none
  }
}
</style>
