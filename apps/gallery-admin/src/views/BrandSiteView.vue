<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  BS_CONFIG_UPDATE,
  BS_CONTENT_CHANGE,
  BS_PREVIEW_READY,
  BS_TEMPLATE_CHANGE,
  SITE_TEMPLATES,
  defaultBrandSiteConfig,
  deriveBrand,
  getSiteTemplate,
  isLowContrastPrimary,
  type BrandSiteConfig,
  type ProjectCardVariant
} from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { siteOrigin, sitePreviewUrl } from '../lib/sitePreview'
import { useAuth } from '../composables/useAuth'
import { useBrandSite } from '../composables/useBrandSite'
import ConfirmModal from '../components/ConfirmModal.vue'
import Icon from '../components/Icon.vue'
import BrandMark from '../components/BrandMark.vue'

const auth = useAuth()
const brandSite = useBrandSite()
const canConfigWrite = auth.can('CONFIG_WRITE')

const SITE_TABS = [
  { id: 'template', label: '模板' },
  { id: 'content', label: '内容' },
  { id: 'brand', label: '品牌' },
  { id: 'publish', label: '发布' }
] as const

type SiteTabId = (typeof SITE_TABS)[number]['id']

const activeTab = ref<SiteTabId>('template')
const previewUrl = sitePreviewUrl()

/* ---------------------------- 草稿状态 ---------------------------- */

const draft = ref<BrandSiteConfig>(defaultBrandSiteConfig())
let draftInitialized = false

watch(
  () => brandSite.site.value,
  (site) => {
    if (site && !draftInitialized && site.config) {
      draft.value = JSON.parse(JSON.stringify(site.config)) as BrandSiteConfig
      draftInitialized = true
      lastSentSnapshot = JSON.stringify(draft.value)
    }
  },
  { immediate: true }
)

const activeTemplate = computed(() => getSiteTemplate(draft.value.templateId))
const derived = computed(() => deriveBrand(draft.value.content.brand.primaryColor, activeTemplate.value.tokens['color-bg']))
const lowContrast = computed(() => isLowContrastPrimary(derived.value))
const subdomainDraft = ref('')
const subdomainDirty = ref(false)

watch(
  () => brandSite.site.value?.subdomain,
  (value) => {
    if (!subdomainDirty.value) subdomainDraft.value = value ?? ''
  },
  { immediate: true }
)

let saveTimer: number | null = null

function scheduleAutoSave(): void {
  if (!canConfigWrite.value) return
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void brandSite.saveDraft(JSON.parse(JSON.stringify(draft.value)))
  }, 800)
}

function touch(): void {
  scheduleAutoSave()
  schedulePreviewSync()
}

watch(draft, () => schedulePreviewSync(), { deep: true })

/* ---------------------------- 模板画廊 ---------------------------- */

const templateSwitch = reactive<{ show: boolean; targetId: string; notes: string[] }>({
  show: false,
  targetId: '',
  notes: []
})

function requestTemplate(templateId: string): void {
  if (!canConfigWrite.value || templateId === draft.value.templateId) return
  const target = getSiteTemplate(templateId)
  const current = activeTemplate.value
  const notes: string[] = []
  const hidden = current.sections.filter((s) => !target.sections.includes(s))
  if (hidden.length) notes.push(`新模板缺少区块：${hidden.join('、')}，对应内容将暂时隐藏`)
  const narrowed = Object.keys(draft.value.overrides ?? {}).filter((k) => !target.allowedOverrides.includes(k))
  if (narrowed.length) notes.push(`自定义项将重置：${narrowed.join('、')}`)
  notes.push('所有内容原文都会保留，随时可以切回。')
  templateSwitch.targetId = templateId
  templateSwitch.notes = notes
  templateSwitch.show = true
}

function confirmTemplateSwitch(): void {
  const target = getSiteTemplate(templateSwitch.targetId)
  const nextOverrides: Record<string, string> = {}
  for (const [key, value] of Object.entries(draft.value.overrides ?? {})) {
    if (target.allowedOverrides.includes(key)) nextOverrides[key] = value
  }
  draft.value = {
    ...draft.value,
    templateId: target.id,
    overrides: nextOverrides
  }
  templateSwitch.show = false
  touch()
}

const VARIANT_OPTIONS: Array<{ id: ProjectCardVariant; label: string; hint: string }> = [
  { id: 'feature', label: '通栏大图', hint: '项目数 ≤ 4，逐个全宽排列' },
  { id: 'mosaic', label: '双列卡片', hint: '项目数 3–8，默认密度' },
  { id: 'index', label: '编号索引', hint: '项目数 6–10，编辑感强' }
]

function templateThumb(t: { id: string; thumbnail: string }): string {
  return `${import.meta.env.BASE_URL}${t.thumbnail}`
}

/* ---------------------------- 内容编辑 ---------------------------- */

interface GalleryItem {
  id: string
  slug: string
  name: string
  coverPhotoId?: string | null
  coverThumbnailUrl?: string | null
  photoCount?: number
}

const galleries = ref<GalleryItem[]>([])
const galleriesLoading = ref(false)

async function loadGalleries(): Promise<void> {
  galleriesLoading.value = true
  try {
    const res = await apiFetch('/api/galleries')
    if (res.ok) {
      const body = (await res.json()) as GalleryItem[] | { items: GalleryItem[] }
      galleries.value = Array.isArray(body) ? body : body.items ?? []
    }
  } catch {
    /* 相册列表加载失败不阻塞编辑 */
  } finally {
    galleriesLoading.value = false
  }
}

function addProject(galleryId: string): void {
  const gallery = galleries.value.find((g) => g.id === galleryId)
  if (!gallery) return
  if (draft.value.content.projects.some((p) => p.galleryId === galleryId && !p.archived)) return
  draft.value.content.projects = [
    ...draft.value.content.projects,
    {
      galleryId,
      title: gallery.name,
      summary: '',
      coverPhotoId: gallery.coverPhotoId ?? undefined,
      sortOrder: draft.value.content.projects.length + 1,
      archived: false
    }
  ]
  touch()
}

function removeProject(index: number): void {
  const next = [...draft.value.content.projects]
  next.splice(index, 1)
  draft.value.content.projects = next.map((p, i) => ({ ...p, sortOrder: i + 1 }))
  touch()
}

function moveProject(index: number, delta: number): void {
  const next = [...draft.value.content.projects]
  const target = index + delta
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  draft.value.content.projects = next.map((p, i) => ({ ...p, sortOrder: i + 1 }))
  touch()
}

const firstGalleryWithPhotos = computed(() => galleries.value[0] ?? null)

function galleriesCoverUrl(photoId: string): string | undefined {
  const gallery = galleries.value.find((g) => g.coverPhotoId === photoId)
  return gallery?.coverThumbnailUrl ?? undefined
}

/* ---------------------------- 图片选择器 ---------------------------- */

const picker = reactive<{
  show: boolean
  galleryId: string
  title: string
  target: { type: 'hero-cover' | 'portrait' | 'project-cover'; projectIndex: number } | null
}>({ show: false, galleryId: '', title: '', target: null })

interface PhotoItem {
  id: string
  title?: string | null
  thumbnailUrl?: string | null
}

const pickerPhotos = ref<PhotoItem[]>([])
const pickerLoading = ref(false)

function openPicker(
  galleryId: string,
  target: { type: 'hero-cover' | 'portrait' | 'project-cover'; projectIndex: number }
): void {
  const gallery = galleries.value.find((g) => g.id === galleryId)
  picker.galleryId = galleryId
  picker.title = `选择图片 · ${gallery?.name ?? '相册'}`
  picker.target = target
  picker.show = true
  pickerPhotos.value = []
  void loadPickerPhotos(galleryId)
}

async function loadPickerPhotos(galleryId: string): Promise<void> {
  pickerLoading.value = true
  try {
    const res = await apiFetch(`/api/galleries/${encodeURIComponent(galleryId)}/photos`)
    if (res.ok) {
      pickerPhotos.value = ((await res.json()) as PhotoItem[]) ?? []
    }
  } catch {
    /* 保持空列表 */
  } finally {
    pickerLoading.value = false
  }
}

function confirmPick(photo: PhotoItem): void {
  if (!picker.target) return
  if (picker.target.type === 'hero-cover') {
    draft.value.content.hero.coverPhotoId = photo.id
  } else if (picker.target.type === 'portrait') {
    if (draft.value.content.about) draft.value.content.about.portraitPhotoId = photo.id
  } else if (picker.target.type === 'project-cover') {
    const project = draft.value.content.projects[picker.target.projectIndex]
    if (project) project.coverPhotoId = photo.id
  }
  picker.show = false
  touch()
}

/* ---------------------------- 品牌定制 ---------------------------- */

const logoInput = ref<HTMLInputElement | null>(null)
const logoPreviewUrl = ref<string | null>(null)
const logoUploading = ref(false)

async function onLogoChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  logoUploading.value = true
  const result = await brandSite.uploadLogo(file)
  logoUploading.value = false
  input.value = ''
  if (result) {
    logoPreviewUrl.value = result.logoUrl
    draft.value.content.brand.logoStorageObjectId = result.logoStorageObjectId
    touch()
  }
}

const statusOptions = [
  { value: 'TRIAL', label: '试用中（footer 显示「试用中」标识）' },
  { value: 'ACTIVE', label: '已订阅（正常公开访问）' },
  { value: 'EXPIRED', label: '已过期（公开访问整体下线）' }
]

async function saveSubdomain(): Promise<void> {
  const ok = await brandSite.updateSettings({ subdomain: subdomainDraft.value })
  if (ok) {
    subdomainDirty.value = false
  }
}

/* ---------------------------- 发布中心 ---------------------------- */

const showPublishConfirm = ref(false)
const rollbackTarget = ref<string | null>(null)

async function doPublish(): Promise<void> {
  await brandSite.saveDraft(JSON.parse(JSON.stringify(draft.value)))
  const ok = await brandSite.publish()
  if (ok) showPublishConfirm.value = false
}

function openPublishTab(): void {
  activeTab.value = 'publish'
  void brandSite.loadVersions()
}

watch(activeTab, (tab) => {
  if (tab === 'publish' && brandSite.versions.value.length === 0) {
    void brandSite.loadVersions()
  }
})

/* ---------------------------- 实时预览（BS_* 握手） ---------------------------- */

const previewFrame = ref<HTMLIFrameElement | null>(null)
const previewLive = ref(false)
const previewTimedOut = ref(false)
const HANDSHAKE_MS = 8000
let handshakeTimer: number | null = null
let lastSentSnapshot = ''
let previewSyncTimer: number | null = null

function startHandshakeTimer(): void {
  if (handshakeTimer) window.clearTimeout(handshakeTimer)
  handshakeTimer = window.setTimeout(() => {
    if (!previewLive.value) previewTimedOut.value = true
  }, HANDSHAKE_MS)
}

function sendToPreview(payload: unknown): void {
  const frame = previewFrame.value
  if (!frame?.contentWindow) return
  frame.contentWindow.postMessage(payload, siteOrigin())
}

function sendFullConfig(): void {
  sendToPreview({
    type: BS_CONFIG_UPDATE,
    config: JSON.parse(JSON.stringify(draft.value)),
    status: brandSite.site.value?.status ?? 'TRIAL'
  })
  lastSentSnapshot = JSON.stringify(draft.value)
}

function schedulePreviewSync(): void {
  if (previewSyncTimer) return
  previewSyncTimer = window.setTimeout(() => {
    previewSyncTimer = null
    if (!previewLive.value) return
    const next = JSON.stringify(draft.value)
    if (next === lastSentSnapshot) return
    const prev = lastSentSnapshot
    lastSentSnapshot = next
    let prevTemplate: { templateId?: string; variant?: string; overrides?: string } = {}
    try {
      const parsed = JSON.parse(prev) as BrandSiteConfig
      prevTemplate = {
        templateId: parsed.templateId,
        variant: parsed.projectCardVariant,
        overrides: JSON.stringify(parsed.overrides ?? {})
      }
    } catch {
      /* 解析失败则全量下发 */
    }
    const nextConfig = draft.value
    const templateChanged =
      prevTemplate.templateId !== nextConfig.templateId ||
      prevTemplate.variant !== nextConfig.projectCardVariant ||
      prevTemplate.overrides !== JSON.stringify(nextConfig.overrides ?? {})
    if (templateChanged) {
      sendToPreview({
        type: BS_TEMPLATE_CHANGE,
        templateId: nextConfig.templateId,
        projectCardVariant: nextConfig.projectCardVariant,
        overrides: nextConfig.overrides
      })
    }
    sendToPreview({ type: BS_CONTENT_CHANGE, content: JSON.parse(JSON.stringify(nextConfig.content)) })
  }, 300)
}

function onPreviewMessage(event: MessageEvent): void {
  try {
    if (new URL(event.origin).hostname !== window.location.hostname) return
  } catch {
    return
  }
  const data = event.data as { type?: string } | null
  if (!data || data.type !== BS_PREVIEW_READY) return
  previewLive.value = true
  previewTimedOut.value = false
  if (handshakeTimer) window.clearTimeout(handshakeTimer)
  sendFullConfig()
}

function reloadPreview(): void {
  previewLive.value = false
  previewTimedOut.value = false
  const frame = previewFrame.value
  if (frame) frame.src = previewUrl
  startHandshakeTimer()
}

onMounted(() => {
  void brandSite.load().then(() => {
    void loadGalleries()
  })
  // 兜底：首次进入偶发请求未竟（如登录后即刻跳转的会话竞争），12s 后未见数据则重试一次
  window.setTimeout(() => {
    if (!brandSite.site.value && !brandSite.loadError.value) {
      void brandSite.load()
    }
  }, 12000)
  startHandshakeTimer()
  window.addEventListener('message', onPreviewMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onPreviewMessage)
  if (handshakeTimer) window.clearTimeout(handshakeTimer)
  if (saveTimer) window.clearTimeout(saveTimer)
  if (previewSyncTimer) window.clearTimeout(previewSyncTimer)
  if (canConfigWrite.value && !brandSite.demoMode.value) {
    void brandSite.saveDraft(JSON.parse(JSON.stringify(draft.value)))
  }
})
</script>

<template>
  <div class="site-view">
    <header class="hall-nav">
      <RouterLink to="/" class="brand">
        <BrandMark :size="28" />
        <span>VIE Gallery</span>
      </RouterLink>

      <nav class="hall-tabs">
        <RouterLink to="/" class="hall-tab">
          <Icon name="layout" :size="15" />
          <span>我的空间</span>
        </RouterLink>
        <span class="hall-tab is-active">
          <Icon name="globe" :size="15" />
          <span>品牌站</span>
        </span>
        <RouterLink v-if="auth.isOwner.value" to="/members" class="hall-tab">
          <Icon name="users" :size="15" />
          <span>成员管理</span>
        </RouterLink>
      </nav>

      <RouterLink to="/" class="btn ghost back-link">返回</RouterLink>
    </header>

    <div v-if="brandSite.loading.value" class="site-state">正在载入品牌站…</div>
    <div v-else-if="brandSite.loadError.value && !brandSite.demoMode.value" class="site-state">
      <h1>无法加载品牌站</h1>
      <p>{{ brandSite.loadError.value }}</p>
    </div>

    <div v-else class="site-split">
      <aside class="site-side">
        <div class="side-tabs" role="tablist" aria-label="品牌站分区">
          <button
            v-for="tab in SITE_TABS"
            :key="tab.id"
            class="side-tab"
            :class="{ active: activeTab === tab.id }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <p v-if="brandSite.demoMode.value" class="demo-banner">
          演示模式：品牌站服务未连接，修改只保留在本地，不会保存或发布。
        </p>

        <!-- ======================== 模板 ======================== -->
        <section v-show="activeTab === 'template'" class="side-block">
          <h2>选择模板</h2>
          <p class="block-hint">5 套模板全量开放（T2 原则：不设二次付费墙）。切换模板只换外壳，内容不丢。</p>
          <div class="template-grid">
            <button
              v-for="t in SITE_TEMPLATES"
              :key="t.id"
              class="template-card"
              :class="{ active: draft.templateId === t.id }"
              type="button"
              :disabled="!canConfigWrite"
              @click="requestTemplate(t.id)"
            >
              <img :src="templateThumb(t)" :alt="`${t.name} 模板缩略图`" loading="lazy" />
              <span class="template-name">
                {{ t.name }}
                <em v-if="t.id === 'plain'">默认</em>
              </span>
              <span class="template-tagline">{{ t.tagline }}</span>
              <span class="template-pairing">推荐氛围：{{ t.pairing.recommended }}</span>
              <span v-if="draft.templateId === t.id" class="template-badge">使用中</span>
            </button>
          </div>
        </section>

        <section v-show="activeTab === 'template'" class="side-block">
          <h2>项目卡密度</h2>
          <div class="variant-list">
            <label
              v-for="option in VARIANT_OPTIONS"
              :key="option.id"
              class="variant-option"
              :class="{ active: draft.projectCardVariant === option.id }"
            >
              <input
                v-model="draft.projectCardVariant"
                type="radio"
                name="project-variant"
                :value="option.id"
                :disabled="!canConfigWrite"
                @change="touch()"
              />
              <span class="variant-meta">
                <strong>{{ option.label }}</strong>
                <small>{{ option.hint }}</small>
              </span>
            </label>
          </div>
        </section>

        <!-- ======================== 内容 ======================== -->
        <section v-show="activeTab === 'content'" class="side-block">
          <h2>主视觉</h2>
          <label class="field">
            <span>标题</span>
            <input v-model="draft.content.hero.headline" type="text" :disabled="!canConfigWrite" @input="touch()" />
          </label>
          <label class="field">
            <span>一句话介绍</span>
            <input v-model="draft.content.hero.subHeadline" type="text" :disabled="!canConfigWrite" @input="touch()" />
          </label>
          <div class="field-row">
            <label class="field">
              <span>主按钮文案</span>
              <input v-model="draft.content.hero.cta.label" type="text" :disabled="!canConfigWrite" @input="touch()" />
            </label>
            <label class="field">
              <span>按钮行为</span>
              <select v-model="draft.content.hero.cta.action" :disabled="!canConfigWrite" @change="touch()">
                <option value="scroll-projects">查看作品</option>
                <option value="contact">联系我</option>
              </select>
            </label>
          </div>
          <div v-if="galleries.length" class="cover-pick">
            <span class="field-label">Hero 封面</span>
            <div class="cover-row">
              <div class="cover-thumb">
                <img
                  v-if="draft.content.hero.coverPhotoId && galleriesCoverUrl(draft.content.hero.coverPhotoId)"
                  :src="galleriesCoverUrl(draft.content.hero.coverPhotoId!)"
                  alt="Hero 封面"
                />
                <span v-else class="cover-empty">未设置</span>
              </div>
              <button
                class="btn ghost"
                type="button"
                :disabled="!canConfigWrite"
                @click="openPicker(firstGalleryWithPhotos?.id ?? galleries[0]!.id, { type: 'hero-cover', projectIndex: -1 })"
              >
                从相册选择
              </button>
            </div>
          </div>
        </section>

        <section v-show="activeTab === 'content'" class="side-block">
          <h2>精选项目 <small>{{ draft.content.projects.length }}/10</small></h2>
          <p class="block-hint">引用已有相册，不在品牌站重复存储。</p>

          <div v-if="!galleries.length" class="empty-hint">
            {{ galleriesLoading ? '正在载入相册…' : '还没有相册，先去「我的空间」创建并上传作品。' }}
          </div>

          <ul class="project-list">
            <li v-for="(p, index) in draft.content.projects" :key="p.galleryId" class="project-item">
              <div class="project-order">
                <button type="button" :disabled="index === 0 || !canConfigWrite" @click="moveProject(index, -1)">↑</button>
                <button
                  type="button"
                  :disabled="index === draft.content.projects.length - 1 || !canConfigWrite"
                  @click="moveProject(index, 1)"
                >
                  ↓
                </button>
              </div>
              <div class="project-main">
                <label class="field">
                  <span>标题</span>
                  <input v-model="p.title" type="text" :disabled="!canConfigWrite" @input="touch()" />
                </label>
                <label class="field">
                  <span>副标题 / 说明</span>
                  <input v-model="p.summary" type="text" :disabled="!canConfigWrite" @input="touch()" />
                </label>
                <div class="field-row">
                  <label class="field">
                    <span>年份标注</span>
                    <input v-model="p.year" type="text" placeholder="如 2025" :disabled="!canConfigWrite" @input="touch()" />
                  </label>
                  <div class="field">
                    <span class="field-label">封面</span>
                    <button
                      class="btn ghost"
                      type="button"
                      :disabled="!canConfigWrite"
                      @click="openPicker(p.galleryId, { type: 'project-cover', projectIndex: index })"
                    >
                      {{ p.coverPhotoId ? '更换封面' : '选择封面' }}
                    </button>
                  </div>
                </div>
              </div>
              <button class="icon-danger" type="button" :disabled="!canConfigWrite" @click="removeProject(index)">
                移除
              </button>
            </li>
          </ul>

          <div v-if="galleries.length" class="add-project">
            <span class="field-label">添加相册为项目</span>
            <select
              :value="''"
              :disabled="!canConfigWrite"
              @change="(($event.target as HTMLSelectElement).value) && addProject(($event.target as HTMLSelectElement).value)"
            >
              <option value="">选择相册…</option>
              <option v-for="g in galleries" :key="g.id" :value="g.id" :disabled="draft.content.projects.some((p) => p.galleryId === g.id && !p.archived)">
                {{ g.name }}
              </option>
            </select>
          </div>
        </section>

        <section v-show="activeTab === 'content'" class="side-block">
          <h2>关于我</h2>
          <template v-if="draft.content.about">
            <label class="field">
              <span>介绍（空行分段）</span>
              <textarea v-model="draft.content.about.body" rows="5" :disabled="!canConfigWrite" @input="touch()"></textarea>
            </label>
            <button class="btn ghost" type="button" :disabled="!canConfigWrite" @click="draft.content.about = undefined; touch()">
              关闭「关于我」区块
            </button>
          </template>
          <button
            v-else
            class="btn ghost"
            type="button"
            @click="
              () => {
                draft.content.about = { body: '' }
                touch()
              }
            "
          >
            启用「关于我」区块
          </button>
        </section>

        <section v-show="activeTab === 'content'" class="side-block">
          <h2>联系与转化</h2>
          <label class="field">
            <span>微信号</span>
            <input v-model="draft.content.contact.wechatId" type="text" placeholder="如 chenyu-photo" :disabled="!canConfigWrite" @input="touch()" />
          </label>
          <label class="field">
            <span>联系区标题</span>
            <input v-model="draft.content.contact.formIntro" type="text" placeholder="如：想拍点什么？" :disabled="!canConfigWrite" @input="touch()" />
          </label>
          <label class="toggle-row">
            <input
              v-model="draft.content.contact.formEnabled"
              type="checkbox"
              :disabled="!canConfigWrite"
              @change="touch()"
            />
            <span>启用站内留言表单（转化必备区块，建议开启）</span>
          </label>
        </section>

        <section v-show="activeTab === 'content'" class="side-block">
          <h2>SEO</h2>
          <label class="field">
            <span>页面标题</span>
            <input v-model="draft.content.seo.title" type="text" :disabled="!canConfigWrite" @input="touch()" />
          </label>
          <label class="field">
            <span>页面描述</span>
            <textarea v-model="draft.content.seo.description" rows="2" :disabled="!canConfigWrite" @input="touch()"></textarea>
          </label>
        </section>

        <!-- ======================== 品牌 ======================== -->
        <section v-show="activeTab === 'brand'" class="side-block">
          <h2>品牌信息</h2>
          <label class="field">
            <span>品牌名称</span>
            <input v-model="draft.content.brand.name" type="text" :disabled="!canConfigWrite" @input="touch()" />
          </label>

          <div class="field">
            <span class="field-label">Logo（≤256KB，PNG/JPG/WebP/SVG）</span>
            <div class="logo-row">
              <span class="logo-preview">
                <img v-if="logoPreviewUrl" :src="logoPreviewUrl" alt="Logo 预览" />
                <span v-else class="logo-initial" :style="{ background: derived.primarySoft, color: derived.primary }">
                  {{ [...draft.content.brand.name.trim()][0] ?? '影' }}
                </span>
              </span>
              <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="onLogoChange" />
            </div>
            <p class="block-hint">未上传 Logo 时，模板会自动以品牌名首字生成单字 Logo。</p>
          </div>
        </section>

        <section v-show="activeTab === 'brand'" class="side-block">
          <h2>品牌主色</h2>
          <div class="color-row">
            <input v-model="draft.content.brand.primaryColor" type="color" :disabled="!canConfigWrite" @input="touch()" />
            <input
              class="color-hex"
              v-model="draft.content.brand.primaryColor"
              type="text"
              :disabled="!canConfigWrite"
              @input="touch()"
            />
          </div>
          <div class="swatch-row">
            <span class="swatch" :style="{ background: derived.primary }" title="主色"></span>
            <span class="swatch" :style="{ background: derived.primaryHover }" title="hover（明度−10%）"></span>
            <span class="swatch" :style="{ background: derived.primarySoft }" title="点缀底（12%）"></span>
            <span class="swatch" :style="{ background: derived.primary, color: derived.onPrimary }" title="主色上的文字">
              Aa
            </span>
          </div>
          <p class="block-hint">
            当前模板「{{ activeTemplate.name }}」中主色出场方式：
            {{ activeTemplate.primaryRole === 'cta' ? '按钮色块' : activeTemplate.primaryRole === 'accent' ? '点缀描边与分隔线' : 'hover 细线' }}
          </p>
          <p v-if="lowContrast" class="warn-hint">⚠ 该主色对比度偏低（{{ derived.contrastOnPrimary.toFixed(2) }}:1），可能影响可读性，建议调整。</p>
        </section>

        <!-- ======================== 发布 ======================== -->
        <section v-show="activeTab === 'publish'" class="side-block">
          <h2>站点地址</h2>
          <div class="field-row">
            <label class="field">
              <span>子域名</span>
              <input v-model="subdomainDraft" type="text" placeholder="your-name" :disabled="!canConfigWrite" @input="subdomainDirty = true" />
            </label>
            <button class="btn ghost" type="button" :disabled="!canConfigWrite || !subdomainDirty" @click="saveSubdomain">
              保存
            </button>
          </div>
          <p class="block-hint">
            正式地址：<code>{{ subdomainDraft || 'your-name' }}.你的域名</code>
            （泛子域名基建上线后生效，当前可经站点服务访问）
          </p>
        </section>

        <section v-show="activeTab === 'publish'" class="side-block">
          <h2>发布状态</h2>
          <label class="field">
            <span>站点状态</span>
            <select
              :value="brandSite.site.value?.status"
              :disabled="!canConfigWrite"
              @change="brandSite.updateSettings({ status: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>

          <div class="publish-card">
            <p>
              <strong>{{ brandSite.site.value?.hasUnpublishedChanges ? '有未发布的修改' : '已与线上版本一致' }}</strong>
            </p>
            <p class="block-hint">
              上次发布：{{ brandSite.site.value?.lastPublishedAt ? new Date(brandSite.site.value.lastPublishedAt).toLocaleString() : '从未发布' }}
            </p>
            <button
              class="btn solid"
              type="button"
              :disabled="!canConfigWrite || brandSite.publishing.value"
              @click="showPublishConfirm = true"
            >
              <Icon name="send" :size="14" />
              <span>{{ brandSite.publishing.value ? '发布中…' : '发布品牌站' }}</span>
            </button>
          </div>
        </section>

        <section v-show="activeTab === 'publish'" class="side-block">
          <h2>版本历史</h2>
          <p v-if="!brandSite.versions.value.length" class="empty-hint">还没有发布版本。</p>
          <ul class="version-list">
            <li v-for="v in brandSite.versions.value" :key="v.id" class="version-item">
              <div>
                <strong>{{ new Date(v.createdAt).toLocaleString() }}</strong>
                <small>schema v{{ v.schemaVersion }}{{ v.templateId ? ` · ${v.templateId}` : '' }}</small>
              </div>
              <button class="btn ghost" type="button" :disabled="!canConfigWrite" @click="rollbackTarget = v.id">
                回滚到此版
              </button>
            </li>
          </ul>
        </section>
      </aside>

      <!-- ======================== 实时预览 ======================== -->
      <section class="site-preview">
        <div class="preview-bar">
          <span class="preview-dot" :class="{ live: previewLive }"></span>
          <span>{{ previewLive ? '实时预览' : previewTimedOut ? '预览连接超时' : '正在连接预览…' }}</span>
          <span class="preview-template">{{ activeTemplate.name }} · {{ draft.projectCardVariant }}</span>
          <button class="btn ghost" type="button" @click="reloadPreview">重新连接</button>
        </div>
        <iframe
          ref="previewFrame"
          class="preview-frame"
          :src="previewUrl"
          title="品牌站实时预览"
          @load="startHandshakeTimer"
        ></iframe>
      </section>
    </div>

    <!-- 模板切换确认 -->
    <ConfirmModal
      :show="templateSwitch.show"
      title="切换模板"
      :message="`切换到「${getSiteTemplate(templateSwitch.targetId).name}」模板。${templateSwitch.notes.join('；')}`"
      confirm-text="切换模板"
      @confirm="confirmTemplateSwitch"
      @cancel="templateSwitch.show = false"
    />

    <!-- 发布确认 -->
    <ConfirmModal
      :show="showPublishConfirm"
      title="发布品牌站"
      message="发布后访客将立即看到最新内容与外观。确定发布？"
      confirm-text="发布"
      @confirm="doPublish"
      @cancel="showPublishConfirm = false"
    />

    <!-- 回滚确认 -->
    <ConfirmModal
      :show="!!rollbackTarget"
      title="回滚版本"
      message="将把该版本内容发布为最新版本，当前草稿会被覆盖。确定回滚？"
      confirm-text="回滚"
      danger
      @confirm="
        () => {
          if (rollbackTarget) void brandSite.rollback(rollbackTarget)
          rollbackTarget = null
        }
      "
      @cancel="rollbackTarget = null"
    />

    <!-- 图片选择器 -->
    <div v-if="picker.show" class="picker-backdrop" @click.self="picker.show = false">
      <div class="picker-card" role="dialog" aria-modal="true" :aria-label="picker.title">
        <header class="picker-head">
          <h3>{{ picker.title }}</h3>
          <button class="btn ghost" type="button" @click="picker.show = false">关闭</button>
        </header>
        <p v-if="pickerLoading" class="empty-hint">正在载入照片…</p>
        <p v-else-if="!pickerPhotos.length" class="empty-hint">这个相册还没有可用的照片。</p>
        <div v-else class="picker-grid">
          <button
            v-for="photo in pickerPhotos"
            :key="photo.id"
            class="picker-cell"
            type="button"
            @click="confirmPick(photo)"
          >
            <img v-if="photo.thumbnailUrl" :src="photo.thumbnailUrl" :alt="photo.title || '照片'" loading="lazy" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.site-view {
  min-height: 100dvh;
}

.hall-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 22px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(15, 40, 28, 0.08);
}

.hall-nav .brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  color: #064e3b;
}

.hall-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hall-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 650;
  color: #6b7280;
  position: relative;
}

.hall-tab.is-active {
  color: #047857;
  background: #ecfdf5;
}

.back-link {
  text-decoration: none;
}

.site-state {
  width: min(720px, calc(100% - 40px));
  margin: 80px auto;
  padding: 40px;
  text-align: center;
  background: #fff;
  border-radius: 18px;
}

.site-split {
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr);
  gap: 16px;
  margin: 16px 18px 18px;
  height: calc(100dvh - 110px);
}

.site-side {
  overflow: auto;
  padding: 18px 16px 22px;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
}

.side-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 16px;
}

.side-tab {
  padding: 8px 6px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 12.5px;
  font-weight: 650;
  color: #6b7280;
}

.side-tab.active {
  color: #047857;
  border-color: #00b88f;
  background: #ecfdf5;
}

.side-block + .side-block {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #f3f4f6;
}

.side-block h2 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
  color: #111827;
  font-size: 14px;
  font-weight: 750;
}

.side-block h2 small {
  color: #9ca3af;
  font-size: 12px;
  font-weight: 600;
}

.block-hint {
  margin: 4px 0 10px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.warn-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 10px;
}

.demo-banner {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  font-size: 12.5px;
  color: #92400e;
}

.empty-hint {
  font-size: 12.5px;
  color: #6b7280;
}

/* 模板画廊 */
.template-grid {
  display: grid;
  gap: 10px;
}

.template-card {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid #eef0f2;
  border-radius: 14px;
  background: #f8fafc;
  padding: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.template-card:hover:not(:disabled) {
  border-color: #00b88f;
}

.template-card.active {
  border-color: #00b88f;
  box-shadow: 0 0 0 1px #00b88f;
  background: #ecfdf5;
}

.template-card:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.template-card img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 8px;
  background: #e5e7eb;
}

.template-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 13.5px;
  font-weight: 750;
  color: #111827;
}

.template-name em {
  font-style: normal;
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #d1fae5;
  color: #047857;
}

.template-tagline {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  color: #6b7280;
  line-height: 1.45;
}

.template-pairing {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: #9ca3af;
}

.template-badge {
  position: absolute;
  top: 18px;
  right: 18px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #059669;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.variant-list {
  display: grid;
  gap: 8px;
}

.variant-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #eef0f2;
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
}

.variant-option.active {
  border-color: #00b88f;
  background: #ecfdf5;
}

.variant-meta strong {
  display: block;
  font-size: 12.5px;
  color: #111827;
}

.variant-meta small {
  color: #6b7280;
  font-size: 11.5px;
}

/* 字段 */
.field {
  display: block;
  margin-bottom: 10px;
}

.field > span,
.field-label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 650;
  color: #374151;
}

.field input,
.field select,
.field textarea,
.add-project select {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 13px;
  font-family: inherit;
  color: #111827;
  background: #fff;
}

.field textarea {
  resize: vertical;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: end;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: #374151;
  margin: 6px 0 10px;
}

.toggle-row input {
  width: 17px;
  height: 17px;
  accent-color: #10b981;
}

/* 项目列表 */
.project-list {
  list-style: none;
  display: grid;
  gap: 12px;
}

.project-item {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  gap: 10px;
  padding: 12px;
  border: 1px solid #eef0f2;
  border-radius: 14px;
  background: #f8fafc;
}

.project-order {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-order button {
  width: 26px;
  height: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  background: #fff;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}

.project-order button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-danger {
  align-self: start;
  border: none;
  background: none;
  color: #dc2626;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
}

.add-project {
  margin-top: 12px;
}

/* 封面 / Logo */
.cover-row,
.logo-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cover-thumb {
  width: 96px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  background: #eef0f2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-empty {
  font-size: 11px;
  color: #9ca3af;
}

.logo-preview {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-initial {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  font-weight: 750;
}

.logo-row input[type='file'] {
  font-size: 12px;
}

/* 主色 */
.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.color-row input[type='color'] {
  width: 46px;
  height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  padding: 2px;
  background: #fff;
}

.color-hex {
  flex: 1;
  padding: 9px 11px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 13px;
  font-family: ui-monospace, monospace;
}

.swatch-row {
  display: flex;
  gap: 8px;
}

.swatch {
  width: 44px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid rgba(15, 40, 28, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

/* 发布 */
.publish-card {
  margin-top: 10px;
  padding: 14px;
  border: 1px solid #eef0f2;
  border-radius: 14px;
  background: #f8fafc;
}

.publish-card strong {
  font-size: 13px;
  color: #111827;
}

.publish-card .btn {
  margin-top: 10px;
}

.version-list {
  list-style: none;
  display: grid;
  gap: 8px;
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #eef0f2;
  border-radius: 12px;
  background: #f8fafc;
}

.version-item strong {
  display: block;
  font-size: 12.5px;
  color: #111827;
}

.version-item small {
  color: #9ca3af;
  font-size: 11.5px;
}

/* 预览 */
.site-preview {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
}

.preview-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 12.5px;
  color: #6b7280;
}

.preview-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #d1d5db;
}

.preview-dot.live {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18);
}

.preview-template {
  margin-left: auto;
  color: #111827;
  font-weight: 650;
}

.preview-frame {
  flex: 1;
  width: 100%;
  border: none;
  background: #f3f4f6;
}

/* 图片选择器 */
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.picker-card {
  width: min(760px, 100%);
  max-height: 82vh;
  overflow: auto;
  background: #fff;
  border-radius: 18px;
  padding: 18px;
}

.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.picker-head h3 {
  font-size: 15px;
  color: #111827;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.picker-cell {
  aspect-ratio: 4 / 3;
  border: 1px solid #eef0f2;
  border-radius: 12px;
  overflow: hidden;
  padding: 0;
  background: #f3f4f6;
  cursor: pointer;
  transition: all 0.15s ease;
}

.picker-cell:hover {
  border-color: #00b88f;
  box-shadow: 0 0 0 1px #00b88f;
}

.picker-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 1100px) {
  .site-split {
    grid-template-columns: 1fr;
    height: auto;
  }
  .site-preview {
    height: 70vh;
  }
}
</style>
