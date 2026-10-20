<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../../api'
import { useToast } from '../../composables/useToast'
import Icon from '../Icon.vue'

const props = defineProps<{ gallery: Gallery; active: boolean; canCreate: boolean }>()
const emit = defineEmits<{ (e: 'downloaded'): void }>()
const toast = useToast()
const templates = [
  { id: 'MINIMAL', name: '留白画册', detail: '干净留白，让作品呼吸' },
  { id: 'ELEGANT', name: '全幅影像', detail: '沉浸大图，记录此刻' },
  { id: 'CLASSIC', name: '深色典藏', detail: '深青底色，珍藏光影' },
  { id: 'VIBRANT', name: '蓝色光影', detail: '鲜明色彩，自由表达' },
  { id: 'MODERN', name: '双栏展签', detail: '图文并置，像一场展览' }
] as const
const formats = [
  { id: 'PORTRAIT', name: '竖版', ratio: '3:4', height: 1440 },
  { id: 'STORY', name: '长图', ratio: '9:16', height: 1920 },
  { id: 'SQUARE', name: '方形', ratio: '1:1', height: 1080 }
] as const
const template = ref<string>('ELEGANT')
const format = ref<string>('PORTRAIT')
const title = ref('')
const description = ref('')
const focalPoint = ref(50)
const previewUrl = ref('')
const previewKey = ref('')
const previewPending = ref(false)
const previewError = ref('')
const downloadError = ref('')
const downloading = ref(false)
const downloaded = ref(false)
const retry = ref(0)
const selectedTemplate = computed(() => templates.find(item => item.id === template.value)!)
const selectedFormat = computed(() => formats.find(item => item.id === format.value)!)
const defaultTitle = computed(() => Array.from(props.gallery.name).slice(0, 80).join(''))
const options = computed(() => ({ template: template.value, format: format.value,
  title: title.value.trim() || defaultTitle.value, description: description.value.trim(), focalPoint: focalPoint.value }))
const optionsKey = computed(() => JSON.stringify(options.value))
const ready = computed(() => props.canCreate && props.gallery.status === 'PUBLISHED' && props.gallery.photoCount !== 0)
const disabledReason = computed(() => !props.canCreate ? '海报由展厅所有者创建。'
  : props.gallery.status !== 'PUBLISHED' ? '先发布展厅，再制作一张可以扫码访问的海报。'
  : '展厅还没有照片。上传照片并设置封面后，即可制作海报。')

watch(() => props.gallery.id, () => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  previewKey.value = ''
  title.value = defaultTitle.value
  description.value = ''
  focalPoint.value = 50
  downloaded.value = false
}, { immediate: true })

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { code?: string; message?: string } | null
  if (data?.code === 'NO_COVER_PHOTO') return '没有可用的封面照片，请先上传照片或更换展厅封面。'
  if (response.status === 401) return '登录已过期，请重新登录后制作海报。'
  if (response.status === 403) return '当前账号没有制作海报的权限，请切换到展厅所有者账号。'
  return data?.message || fallback
}

watch([() => props.active, () => props.gallery.id, ready, optionsKey, retry],
  ([active], _previous, onCleanup) => {
    downloaded.value = false
    downloadError.value = ''
    if (!active || !ready.value) { previewPending.value = false; return }
    if (previewKey.value === optionsKey.value && previewUrl.value && !previewError.value) { previewPending.value = false; return }
    const controller = new AbortController()
    const key = optionsKey.value
    const id = props.gallery.id
    previewPending.value = true
    previewError.value = ''
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/galleries/${id}/share-poster/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: controller.signal
        })
        if (!response.ok) throw new Error(await responseError(response, '预览生成失败，请重试。'))
        const blob = await response.blob()
        if (!blob.type.startsWith('image/')) throw new Error('预览图片未能加载，请重试。')
        if (controller.signal.aborted) return
        const previousUrl = previewUrl.value
        previewUrl.value = URL.createObjectURL(blob)
        previewKey.value = key
        if (previousUrl) URL.revokeObjectURL(previousUrl)
      } catch (error) {
        if (!controller.signal.aborted) previewError.value = error instanceof Error ? error.message : '预览生成失败，请重试。'
      } finally {
        if (!controller.signal.aborted) previewPending.value = false
      }
    }, 450)
    onCleanup(() => { window.clearTimeout(timer); controller.abort() })
  }, { immediate: true })

let downloadController: AbortController | undefined
async function download() {
  if (!ready.value || downloading.value || previewPending.value || previewKey.value !== optionsKey.value || previewError.value) return
  downloading.value = true
  downloadError.value = ''
  const controller = new AbortController()
  downloadController = controller
  const name = (title.value.trim() || props.gallery.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80)
  const filename = `${name}-${selectedTemplate.value.name}-${selectedFormat.value.ratio.replace(':', 'x')}.png`
  try {
    const response = await apiFetch(`/api/galleries/${props.gallery.id}/share-poster/download`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: optionsKey.value, signal: controller.signal
    })
    if (!response.ok) throw new Error(await responseError(response, '海报下载失败，请重试。'))
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) throw new Error('海报文件未能生成，请重试。')
    if (controller.signal.aborted) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = filename
    document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    downloaded.value = true
    emit('downloaded')
    toast.success('海报已下载，可以分享给朋友了。')
  } catch (error) {
    if (!controller.signal.aborted) downloadError.value = error instanceof Error ? error.message : '海报下载失败，请重试。'
  } finally {
    if (!controller.signal.aborted) downloading.value = false
  }
}

onBeforeUnmount(() => {
  downloadController?.abort()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <section class="poster-studio" aria-label="海报创作">
    <div class="studio-settings">
      <div class="studio-intro">
        <h4>为你的展览，做一张海报。</h4>
        <p>选一个喜欢的版式，把光影与心意一起分享。</p>
      </div>
      <fieldset :disabled="downloading" class="studio-fieldset">
        <legend>海报版式 <span>5 种风格</span></legend>
        <div class="template-picker" role="radiogroup" aria-label="海报版式">
          <label v-for="item in templates" :key="item.id" class="template-option" :class="{ selected: template === item.id }">
            <input v-model="template" type="radio" name="poster-template" :value="item.id" :aria-label="item.name" />
            <span class="template-art" :class="`art-${item.id.toLowerCase()}`" aria-hidden="true">
              <span class="art-brand">阳光明媚</span>
              <img v-if="gallery.coverThumbnailUrl" :src="gallery.coverThumbnailUrl" alt="" />
              <span class="art-title">光影之间</span><span class="art-rule"></span><span class="art-qr"></span>
            </span>
            <span class="template-name">{{ item.name }}</span>
            <span v-if="template === item.id" class="template-check"><Icon name="check" :size="11" /></span>
          </label>
        </div>
        <p class="selection-detail">{{ selectedTemplate.detail }}</p>
      </fieldset>
      <fieldset :disabled="downloading" class="studio-fieldset">
        <legend>画面比例</legend>
        <div class="format-picker" role="radiogroup" aria-label="画面比例">
          <label v-for="item in formats" :key="item.id" :class="{ selected: format === item.id }">
            <input v-model="format" type="radio" name="poster-format" :value="item.id" :aria-label="`${item.name} ${item.ratio}`" />
            <span class="format-icon" :style="{ aspectRatio: item.ratio.replace(':', '/') }"></span>
            {{ item.name }} <span>{{ item.ratio }}</span>
          </label>
        </div>
      </fieldset>
      <fieldset :disabled="downloading" class="studio-fieldset text-fields">
        <legend>写在海报上</legend>
        <label for="poster-title">展览标题 <span>{{ Array.from(title).length }}/80</span></label>
        <input id="poster-title" v-model="title" maxlength="80" :placeholder="gallery.name" />
        <label for="poster-description">一句寄语 <span>选填</span></label>
        <textarea id="poster-description" v-model="description" rows="2" maxlength="160" placeholder="例如：沿着光的方向，收藏生活里的小小瞬间。"></textarea>
        <p class="field-note">长文案会自动换行，超出画面时收起显示。</p>
        <label for="poster-focal-point">封面取景 <button type="button" :disabled="downloading" @click="focalPoint = 50">居中</button></label>
        <input id="poster-focal-point" v-model.number="focalPoint" type="range" min="0" max="100" step="1" />
        <div class="range-labels"><span>偏左 / 上</span><span>偏右 / 下</span></div>
        <p class="field-note">使用展厅封面，等比裁切。拖动滑杆调整画面位置。</p>
      </fieldset>
    </div>

    <div class="studio-output">
      <div class="preview-heading"><span>海报预览</span><span>{{ selectedFormat.ratio }} · 1080 × {{ selectedFormat.height }}</span></div>
      <div class="poster-stage" :aria-busy="previewPending">
        <div v-if="!ready" class="preview-message" role="status"><Icon name="image" :size="32" /><p>{{ disabledReason }}</p></div>
        <template v-else>
          <img v-if="previewUrl" class="studio-preview" :class="{ updating: previewPending || previewError }" :src="previewUrl"
            :alt="`${selectedTemplate.name}海报预览`" :style="{ aspectRatio: `1080/${selectedFormat.height}` }"
            @error="previewError = '预览图片未能加载，请重新生成。'" />
          <div v-if="previewPending" class="preview-message preview-overlay" role="status">
            <span class="studio-spinner"></span><p>{{ previewUrl ? '正在更新预览…' : '正在排版你的海报…' }}</p>
          </div>
          <div v-else-if="previewError" class="preview-message preview-overlay" role="alert">
            <Icon name="image" :size="28" /><p>{{ previewError }}</p><button type="button" @click="retry++">重新生成预览</button>
          </div>
        </template>
      </div>
      <p v-if="gallery.visibility === 'PRIVATE'" class="output-note">预览不创建分享链接。下载时生成 30 天有效的访问二维码，可在分享设置中撤销。</p>
      <p v-else-if="gallery.visibility === 'PASSWORD'" class="output-note">扫码后仍需输入展厅密码。请将密码另行告知访客。</p>
      <p v-else class="output-note">扫码直达展厅 · 高清 PNG 图片 · 可保存到手机相册</p>
      <button type="button" class="poster-download" :disabled="!ready || downloading || previewPending || !!previewError || !previewUrl || previewKey !== optionsKey" @click="download">
        <Icon :name="downloading ? 'loader' : downloaded ? 'check' : 'download'" :size="17" />
        {{ downloading ? '正在生成高清海报…' : downloaded ? '再次下载海报' : '下载高清海报' }}
      </button>
      <p v-if="downloadError" class="download-error" role="alert">{{ downloadError }}</p>
      <p v-else-if="downloaded" class="download-success" role="status">已开始下载，分享图片即可邀请朋友看展。</p>
    </div>
  </section>
</template>

<style scoped>
.poster-studio { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); gap:32px; color:var(--text-primary); }
.studio-settings { min-width:0; }
.studio-intro { margin-bottom:26px; }
.studio-intro h4 { margin:0 0 8px; font-size:21px; font-weight:650; letter-spacing:-.5px; }
.studio-intro p { margin:0; color:var(--text-secondary); font-size:12px; line-height:1.7; }
.studio-fieldset { border:0; padding:0; margin:0 0 22px; min-width:0; }
.studio-fieldset legend { display:flex; align-items:center; gap:10px; width:100%; box-sizing:border-box; padding:0; margin-bottom:12px; font-size:13px; font-weight:650; }
.studio-fieldset legend span { color:var(--text-muted, #76827e); font-size:11px; font-weight:400; }
.template-picker { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:8px; }
.template-option { display:block; position:relative; min-width:0; cursor:pointer; }
.template-picker input, .format-picker input { position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; z-index:2; cursor:pointer; }
.template-art { display:block; position:relative; aspect-ratio:3/4; overflow:hidden; background:#f8f9f6; color:#1f343b; border-radius:3px; border:2px solid transparent; box-shadow:0 0 0 1px var(--border-default, #dce3df); }
.template-art img { position:absolute; inset:11% 7% auto; width:86%; height:51%; object-fit:cover; background:#d6e2dc; }
.art-brand { position:absolute; top:4%; left:8%; font-size:4px; }
.art-title { position:absolute; top:67%; left:8%; font-size:7px; font-weight:700; }
.art-rule { position:absolute; bottom:18%; left:8%; width:84%; height:1px; background:currentColor; opacity:.3; }
.art-qr { position:absolute; bottom:4%; right:8%; width:12%; aspect-ratio:1; background:repeating-conic-gradient(#273b38 0 25%, #fff 0 50%) 0/4px 4px; border:2px solid white; }
.art-elegant { background:#456259; color:white; }
.art-elegant img { inset:0; width:100%; height:100%; }
.art-elegant::after { content:''; position:absolute; inset:30% 0 0; background:linear-gradient(transparent, #102626); }
.art-elegant .art-brand, .art-elegant .art-title, .art-elegant .art-rule, .art-elegant .art-qr { z-index:1; }
.art-classic { background:#1f343b; color:#f8f9f6; }
.art-vibrant { background:#2b48c9; color:#f7f4a0; }
.art-vibrant img { left:17%; width:76%; }
.art-modern { background:#dae7e2; }
.art-modern img { inset:0; width:60%; height:82%; }
.art-modern .art-title { left:65%; top:30%; width:25%; font-size:8px; }
.art-modern .art-brand { left:65%; font-size:3px; }
.template-name { display:block; text-align:center; font-size:10px; white-space:nowrap; margin-top:9px; color:var(--text-secondary); }
.template-check { position:absolute; top:5px; right:4px; display:grid; place-items:center; width:15px; height:15px; background:var(--brand-deep, #245b47); border-radius:50%; color:white; }
.selected .template-art { border-color:var(--brand-deep, #245b47); box-shadow:0 0 0 2px var(--mint-soft, #e7f2ec); }
.selected .template-name { color:var(--brand-deep); font-weight:650; }
.selection-detail { margin:10px 0 0; color:var(--text-muted, #76827e); font-size:11px; }
.format-picker { display:flex; gap:7px; }
.format-picker label { position:relative; flex:1; display:flex; justify-content:center; align-items:center; gap:6px; cursor:pointer; padding:11px 4px; border:1px solid var(--border-default, #dce3df); border-radius:7px; font-size:12px; }
.format-picker label > span:last-child { font-size:10px; color:var(--text-muted, #76827e); }
.format-picker label.selected { color:var(--brand-deep); border-color:var(--brand-deep); background:var(--mint-soft); }
.format-icon { height:15px; border:1px solid currentColor; border-radius:1px; opacity:.7; }
.text-fields { display:flex; flex-direction:column; gap:9px; margin-bottom:0; }
.text-fields label { display:flex; justify-content:space-between; align-items:center; font-size:12px; }
.text-fields label span { color:var(--text-muted, #76827e); font-size:10px; }
.text-fields input:not([type=range]), .text-fields textarea { box-sizing:border-box; width:100%; border:1px solid var(--border-default, #dce3df); background:var(--bg-surface); color:var(--text-primary); border-radius:7px; padding:10px 11px; font:inherit; font-size:12px; line-height:1.6; }
.text-fields textarea { resize:vertical; min-height:68px; max-height:140px; }
.text-fields input[type=range] { width:100%; margin:0; accent-color:var(--brand-deep, #245b47); }
.text-fields label[for=poster-focal-point] { margin-top:8px; }
.text-fields label button { padding:0; border:0; background:none; color:var(--brand-deep); font-size:11px; cursor:pointer; }
.field-note, .range-labels { margin:0; color:var(--text-muted, #76827e); font-size:10px; line-height:1.6; }
.range-labels { display:flex; justify-content:space-between; margin-top:-6px; }
.studio-output { padding:18px; background:var(--bg-app, #f2f5f3); border:1px solid var(--border-default, #dce3df); border-radius:10px; display:flex; flex-direction:column; align-self:start; min-width:0; }
.preview-heading { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:16px; font-size:12px; }
.preview-heading span:last-child { color:var(--text-muted, #76827e); font-size:10px; }
.poster-stage { position:relative; display:flex; align-items:center; justify-content:center; min-height:340px; padding:18px 14px; box-sizing:border-box; background:#e5eae7; border-radius:5px; overflow:hidden; }
.studio-preview { display:block; width:auto; max-width:100%; max-height:450px; object-fit:contain; box-shadow:0 10px 25px #1f343b24; }
.studio-preview.updating { opacity:.28; }
.preview-message { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; text-align:center; color:#4c6258; padding:20px; font-size:12px; }
.preview-message p { margin:0; line-height:1.8; }
.preview-overlay { position:absolute; inset:0; background:#e5eae766; }
.preview-message button { border:1px solid #93a79b; border-radius:6px; padding:8px 14px; background:#fff; color:#245b47; cursor:pointer; font:inherit; }
.studio-spinner { width:24px; height:24px; border:2px solid #b7c9bf; border-top-color:#245b47; border-radius:50%; animation:poster-spin .9s linear infinite; }
.output-note { color:var(--text-muted, #76827e); text-align:center; font-size:10px; line-height:1.8; margin:14px 0; }
.poster-download { width:100%; display:flex; align-items:center; justify-content:center; gap:9px; border:0; border-radius:7px; padding:13px 10px; color:white; background:var(--brand-deep, #245b47); font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
button:disabled { opacity:.5; cursor:not-allowed; }
.download-error, .download-success { margin:10px 0 0; line-height:1.7; font-size:11px; text-align:center; }
.download-error { color:#b34838; }.download-success { color:var(--brand-deep); }
input:focus-visible, textarea:focus-visible, button:focus-visible, .template-option:has(input:focus-visible) .template-art, .format-picker label:has(input:focus-visible) { outline:2px solid var(--brand-deep, #245b47); outline-offset:3px; }
@keyframes poster-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .studio-spinner { animation:none; } }
@media (max-width:720px) {
  .poster-studio { grid-template-columns:1fr; gap:24px; }
  .studio-intro h4 { font-size:19px; }
  .template-picker { gap:10px; }
  .template-name { font-size:11px; }
  .studio-preview { max-height:420px; }
  .poster-stage { min-height:280px; }
}
</style>
