<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import Icon from '../components/Icon.vue'
import { openCreatorPreview } from '../lib/preview'
import { useModalFocus } from '../composables/useModalFocus'

const FALLBACK_COVERS = [
  '/covers/forest.png',
  '/covers/lake.png',
  '/covers/coast.png',
  '/covers/courtyard.png',
  '/covers/stream.png',
  '/covers/gallery.png',
  '/covers/bamboo.png'
]

const router = useRouter()
const toast = useToast()
const { currentUser, setUser, logout, can, userDisplayName, userInitial, isOwner } = useAuth()
const canCreateGallery = can('GALLERY_CREATE')

const authMode = ref<'login' | 'register'>('login')
const authForm = ref({
  email: '',
  password: '',
  displayName: ''
})
const authLoading = ref(false)
const authError = ref('')

const galleries = ref<Gallery[]>([])
const loading = ref(false)
const loadError = ref('')

const searchQuery = ref('')
const viewMode = ref<'grid' | 'list'>('grid')
const menuId = ref<string | null>(null)
const userMenuOpen = ref(false)

const showCreateModal = ref(false)
const createForm = ref({ name: '', slug: '', visibility: 'PUBLIC' })
const creating = ref(false)
const createError = ref('')
const slugSeed = ref(makeSlugSeed())
const { root: createModalRoot } = useModalFocus(showCreateModal, {
  onEscape: () => { if (!creating.value) showCreateModal.value = false },
  disabled: creating
})

function makeSlugSeed() {
  return `space-${Date.now().toString(36)}`
}

function openCreateModal() {
  slugSeed.value = makeSlugSeed()
  showCreateModal.value = true
}

const filteredGalleries = computed(() => {
  return galleries.value.filter(g => {
    if (!searchQuery.value.trim()) return true
    const query = searchQuery.value.trim().toLowerCase()
    return g.name.toLowerCase().includes(query) || g.slug.toLowerCase().includes(query)
  })
})

function coverFor(gallery: Gallery) {
  if (gallery.coverThumbnailUrl) return gallery.coverThumbnailUrl
  let hash = 0
  for (const ch of gallery.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_COVERS[hash % FALLBACK_COVERS.length]
}

function formatCreatedAt(value?: string | null) {
  if (!value) return '刚刚创建'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚创建'
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `创建于 ${y}-${m}-${d}`
}

function visibilityLabel(gallery: Gallery) {
  return gallery.visibility === 'PUBLIC' ? '公开' : '私密'
}

function statusLabel(gallery: Gallery) {
  return gallery.status === 'PUBLISHED' ? '已发布' : '草稿'
}

function toggleCardMenu(id: string, event: Event) {
  event.stopPropagation()
  menuId.value = menuId.value === id ? null : id
  userMenuOpen.value = false
}

function closeMenus() {
  menuId.value = null
  userMenuOpen.value = false
}

async function handleLogout() {
  await logout()
  toast.info('已安全退出登录')
}

onMounted(() => document.addEventListener('click', closeMenus))
onUnmounted(() => document.removeEventListener('click', closeMenus))

function navigateToWorkspace(id: string) {
  router.push({ name: 'gallery-workspace', params: { id } })
}

function navigateToConfig(id: string) {
  router.push({ name: 'gallery-config', params: { id } })
}

async function openViewer(gallery: Gallery) {
  try {
    await openCreatorPreview(gallery.id, gallery.slug)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '暂时无法打开内部预览，请稍后重试。')
  }
}

async function loadGalleries() {
  if (!currentUser.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await apiFetch('/api/galleries')
    if (!response.ok) throw new Error(response.status === 401 ? '登录已失效，请重新登录。' : response.status === 403 ? '你没有权限查看这些空间。' : '空间列表加载失败，请稍后重试。')
    galleries.value = await response.json() as Gallery[]
  } catch (error) {
    galleries.value = []
    loadError.value = error instanceof Error ? error.message : '空间列表加载失败，请稍后重试。'
    if (loadError.value.includes('登录已失效')) {
      logout()
    }
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

watch(currentUser, user => {
  if (user) {
    loadGalleries()
  } else {
    galleries.value = []
    loadError.value = ''
  }
}, { immediate: true })

async function handleAuthSubmit() {
  authLoading.value = true
  authError.value = ''
  try {
    const url = authMode.value === 'register' ? '/api/auth/register' : '/api/auth/login'
    const body: Record<string, string> = {
      email: authForm.value.email.trim(),
      password: authForm.value.password
    }
    if (authMode.value === 'register') body.displayName = authForm.value.displayName.trim()

    const response = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string }
      const raw = body.message || ''
      if (raw.toLowerCase().includes('invalid credentials')) {
        authError.value = '邮箱或密码不正确。'
      } else {
        authError.value = raw || (authMode.value === 'register' ? '注册失败，请检查填写内容。' : '登录失败，请检查邮箱和密码。')
      }
      toast.error(authError.value)
      return
    }
    setUser(await response.json())
    toast.success(authMode.value === 'register' ? '注册成功，欢迎进入！' : '登录成功')
  } catch (error) {
    authError.value = error instanceof Error ? error.message : '网络连接异常，请稍后重试。'
    toast.error(authError.value)
  } finally {
    authLoading.value = false
  }
}

function handleNameInput() {
  const previous = slugify(createForm.value.name.slice(0, -1))
  if (!createForm.value.slug || createForm.value.slug === previous) {
    createForm.value.slug = slugify(createForm.value.name)
  }
}

function slugify(text: string) {
  const ascii = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return ascii || slugSeed.value
}

async function handleCreateGallery() {
  if (!canCreateGallery.value) {
    toast.error('当前角色没有创建空间的权限。')
    return
  }
  if (!createForm.value.name.trim()) {
    createError.value = '请填写空间名称。'
    return
  }
  if (!createForm.value.slug.trim()) {
    createForm.value.slug = slugify(createForm.value.name)
  }
  if (!createForm.value.slug.trim()) {
    createError.value = '请填写访问地址，可用字母、数字和连字符。'
    return
  }
  creating.value = true
  createError.value = ''
  try {
    const response = await apiFetch('/api/galleries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createForm.value.name.trim(),
        slug: createForm.value.slug.trim(),
        visibility: createForm.value.visibility
      })
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string }
      createError.value = body.message || '创建空间失败，请稍后重试。'
      toast.error(createError.value)
      return
    }
    const newGallery = await response.json() as Gallery
    showCreateModal.value = false
    createForm.value = { name: '', slug: '', visibility: 'PUBLIC' }
    toast.success(`空间“${newGallery.name}”创建成功！`)
    navigateToWorkspace(newGallery.id)
  } catch (error) {
    createError.value = error instanceof Error ? error.message : '网络请求失败，请稍后重试。'
    toast.error(createError.value)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <!-- Fullscreen Immersive Login / Register (Guest Mode) -->
  <div v-if="!currentUser" class="auth-immersive">
    <div class="auth-scene" aria-hidden="true">
      <div class="auth-brand-mark">VIE GALLERY</div>
    </div>
    <div class="auth-card">
      <div class="auth-header">
        <div class="brand-badge"><Icon name="gallery" :size="22" /></div>
        <h2>VIE GALLERY</h2>
        <p>{{ authMode === 'register' ? '注册新创作者工作区，开启沉浸式相册' : '登录你的创作者管理后台' }}</p>
      </div>
      <div class="auth-tabs">
        <button :class="{ active: authMode === 'login' }" type="button" @click="authMode = 'login'; authError = ''">账号登录</button>
        <button :class="{ active: authMode === 'register' }" type="button" @click="authMode = 'register'; authError = ''">注册账户</button>
      </div>
      <div v-if="authError" class="form-error"><Icon name="alert-circle" :size="16" /><span>{{ authError }}</span></div>
      <form @submit.prevent="handleAuthSubmit">
        <div v-if="authMode === 'register'" class="form-group auth-field">
          <label class="form-label" for="auth-display-name">用户名称</label>
          <div class="auth-input-wrap">
            <Icon name="user" :size="16" class="auth-input-icon" />
            <input id="auth-display-name" v-model="authForm.displayName" placeholder="例如：Alex Chen" class="form-input" required />
          </div>
        </div>
        <div class="form-group auth-field">
          <label class="form-label" for="auth-email">电子邮箱</label>
          <div class="auth-input-wrap">
            <Icon name="users" :size="16" class="auth-input-icon" />
            <input id="auth-email" v-model="authForm.email" type="email" placeholder="name@example.com" class="form-input" required />
          </div>
        </div>
        <div class="form-group auth-field">
          <label class="form-label" for="auth-password">密码（至少 12 位）</label>
          <div class="auth-input-wrap">
            <Icon name="lock" :size="16" class="auth-input-icon" />
            <input id="auth-password" v-model="authForm.password" type="password" placeholder="至少 12 位密码" class="form-input" minlength="12" required />
          </div>
        </div>
        <button id="btn-auth-submit" type="submit" class="btn btn-primary auth-submit" :disabled="authLoading">
          <Icon v-if="authLoading" name="refresh" :size="16" class="spin" />
          <span>{{ authLoading ? '认证中…' : (authMode === 'register' ? '创建并进入工作区' : '登录控制台') }}</span>
        </button>
      </form>
    </div>
  </div>

  <!-- 我的空间 — full reproduction of gui-test-screenshots/image1.png -->
  <div v-else class="space-page">
    <div class="space-scene" aria-hidden="true"></div>

    <header class="space-nav">
      <RouterLink to="/" class="space-brand">
        <span class="fold-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M6 9.2 16 4l10 5.2v6.1L16 21.6 6 15.3V9.2Z" fill="#12B981" />
            <path d="M16 4v17.6l10-6.3V9.2L16 4Z" fill="#059669" />
            <path d="M6 15.3 16 21.6 26 15.3 16 28 6 15.3Z" fill="#047857" />
          </svg>
        </span>
        <span class="space-brand-name">VIE Gallery</span>
      </RouterLink>

      <nav class="space-tabs" aria-label="主导航">
        <RouterLink to="/" class="space-tab is-active">
          <Icon name="home" :size="16" />
          <span>我的空间</span>
        </RouterLink>
        <RouterLink v-if="isOwner" to="/members" class="space-tab">
          <Icon name="users" :size="16" />
          <span>成员管理</span>
        </RouterLink>
      </nav>

      <div class="space-user" @click.stop="userMenuOpen = !userMenuOpen">
        <div class="space-avatar">{{ userInitial }}</div>
        <span class="space-user-name">{{ userDisplayName }}</span>
        <Icon name="chevron-down" :size="14" />
        <div v-if="userMenuOpen" class="space-user-menu" @click.stop>
          <button type="button" @click="handleLogout">退出登录</button>
        </div>
      </div>
    </header>

    <div class="space-body">
      <div class="space-heading">
        <h1>我的空间</h1>
        <p>在这里创建、管理和编辑您的 3D 沉浸式画廊空间</p>
      </div>

      <div class="space-toolbar">
        <button
          v-if="canCreateGallery"
          id="btn-open-create-modal"
          class="space-create-btn"
          type="button"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="16" />
          <span>新建空间</span>
        </button>
        <div class="space-toolbar-right">
          <div class="view-toggle" role="group" aria-label="展示方式">
            <button
              class="view-btn"
              :class="{ active: viewMode === 'grid' }"
              type="button"
              title="网格视图"
              @click="viewMode = 'grid'"
            >
              <Icon name="grid" :size="15" />
            </button>
            <button
              class="view-btn"
              :class="{ active: viewMode === 'list' }"
              type="button"
              title="列表视图"
              @click="viewMode = 'list'"
            >
              <Icon name="list" :size="15" />
            </button>
          </div>
          <div class="search-box">
            <Icon name="search" :size="16" class="search-icon" />
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="搜索空间名称"
            />
          </div>
        </div>
      </div>

      <div v-if="loadError" class="space-error" role="alert">
        <Icon name="alert-circle" :size="16" />
        <span>{{ loadError }}</span>
        <button class="btn btn-secondary btn-sm" type="button" @click="loadGalleries">重试</button>
      </div>

      <div v-if="!loading && !loadError && viewMode === 'grid' && filteredGalleries.length" class="space-grid">
        <article
          v-for="gallery in filteredGalleries"
          :key="gallery.id"
          class="space-card"
          tabindex="0"
          @click="navigateToWorkspace(gallery.id)"
          @keydown.enter="navigateToWorkspace(gallery.id)"
        >
          <div class="card-cover">
            <img :src="coverFor(gallery)" class="cover-image" :alt="gallery.name" loading="lazy" />
            <span class="vis-tag" :class="gallery.visibility === 'PUBLIC' ? 'is-public' : 'is-private'">
              {{ visibilityLabel(gallery) }}
            </span>
          </div>
          <div class="card-body">
            <h2>{{ gallery.name }}</h2>
            <p class="card-date">{{ formatCreatedAt(gallery.createdAt) }}</p>
            <div class="card-foot">
              <span class="status-meta">
                <span class="status-dot" :class="gallery.status === 'PUBLISHED' ? 'is-live' : 'is-draft'"></span>
                <span>{{ statusLabel(gallery) }}</span>
              </span>
              <div class="more-wrap">
                <button
                  class="more-btn"
                  type="button"
                  aria-label="更多操作"
                  @click="toggleCardMenu(gallery.id, $event)"
                >
                  <Icon name="more" :size="16" />
                </button>
                <div v-if="menuId === gallery.id" class="card-menu" @click.stop>
                  <button type="button" @click="navigateToWorkspace(gallery.id)">进入工作区</button>
                  <button type="button" @click="navigateToConfig(gallery.id)">展厅配置</button>
                  <button type="button" @click="openViewer(gallery)">预览展厅</button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <button
          v-if="canCreateGallery"
          class="create-card"
          type="button"
          @click="openCreateModal"
        >
          <span class="create-plus">
            <Icon name="plus" :size="22" />
          </span>
          <strong>新建空间</strong>
          <span>创建一个新的 3D 画廊空间</span>
        </button>
      </div>

      <div v-else-if="filteredGalleries.length" class="space-list">
        <button
          v-for="gallery in filteredGalleries"
          :key="gallery.id"
          class="list-row"
          type="button"
          @click="navigateToWorkspace(gallery.id)"
        >
          <img :src="coverFor(gallery)" class="list-thumb" :alt="gallery.name" />
          <div class="list-copy">
            <strong>{{ gallery.name }}</strong>
            <span>{{ formatCreatedAt(gallery.createdAt) }}</span>
          </div>
          <span class="vis-tag" :class="gallery.visibility === 'PUBLIC' ? 'is-public' : 'is-private'">
            {{ visibilityLabel(gallery) }}
          </span>
        </button>
      </div>

      <div v-else-if="galleries.length && !filteredGalleries.length" class="space-empty">
        <h3>未找到匹配的空间</h3>
        <p>没有找到与 “{{ searchQuery }}” 相关的空间。</p>
        <button class="btn btn-secondary" type="button" @click="searchQuery = ''">清除搜索</button>
      </div>

      <div v-else-if="loading" class="space-empty">
        <h2>正在加载空间…</h2>
      </div>

      <div v-else-if="!galleries.length && !loadError" class="space-empty">
        <h2>还没有画廊空间</h2>
        <p>创建第一个 3D 展厅，上传照片后即可配置氛围并分享给访客。</p>
        <button v-if="canCreateGallery" class="space-create-btn" type="button" @click="openCreateModal">
          <Icon name="plus" :size="16" />
          <span>新建空间</span>
        </button>
      </div>
    </div>

    <Transition name="modal-fade">
      <div v-if="showCreateModal" class="modal-backdrop" @click.self="!creating && (showCreateModal = false)">
        <div
          ref="createModalRoot"
          class="modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-title"
          tabindex="-1"
        >
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble">
                <Icon name="plus" :size="20" />
              </div>
              <div>
                <h2 id="create-title">新建空间</h2>
                <p>创建一个新的 3D 画廊空间</p>
              </div>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" :disabled="creating" @click="showCreateModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>

          <div v-if="createError" class="form-error">
            <Icon name="alert-circle" :size="16" />
            <span>{{ createError }}</span>
          </div>

          <form @submit.prevent="handleCreateGallery">
            <div class="form-group">
              <label class="form-label" for="input-gallery-name">空间名称</label>
              <input
                id="input-gallery-name"
                v-model="createForm.name"
                placeholder="例如：晨雾森林"
                class="form-input"
                required
                @input="handleNameInput"
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="input-gallery-slug">访问地址</label>
              <input
                id="input-gallery-slug"
                v-model="createForm.slug"
                placeholder="例如：morning-forest"
                class="form-input"
                required
              />
              <p class="form-hint">用于访客链接，可用字母、数字和连字符。中文名称会自动生成可用地址。</p>
            </div>
            <div class="form-group">
              <label class="form-label" for="select-gallery-visibility">访问权限</label>
              <select id="select-gallery-visibility" v-model="createForm.visibility" class="select-input">
                <option value="PUBLIC">公开</option>
                <option value="PRIVATE">私密</option>
              </select>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" :disabled="creating" @click="showCreateModal = false">取消</button>
              <button id="btn-create-submit" type="submit" class="btn btn-primary" :disabled="creating">
                <Icon v-if="creating" name="refresh" :size="16" class="spin" />
                <span>{{ creating ? '创建中…' : '立即创建' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ==========================================================================
   1. Guest Auth Immersive Layout (Preserved from polished Login spec)
   ========================================================================== */
.auth-immersive {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  min-height: 100dvh;
  overflow: hidden;
  background-color: #c8e6d8;
  background-image: url('/login-bg-c.jpg');
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
}

.auth-scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.auth-brand-mark {
  position: absolute;
  left: 8%;
  bottom: 9%;
  font-size: clamp(26px, 4.2vw, 48px);
  font-weight: 800;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.42);
  text-transform: uppercase;
  user-select: none;
  text-shadow: 0 8px 28px rgba(6, 40, 28, 0.35);
}

.auth-card {
  position: relative;
  z-index: 1;
  align-self: center;
  margin: 24px 56px 24px 16px;
  width: min(440px, calc(100vw - 48px));
  padding: 38px 36px 34px;
  border-radius: 22px;
  color: #e8f5ef;
  background: linear-gradient(155deg, rgba(14, 28, 24, 0.88), rgba(8, 20, 16, 0.92) 48%, rgba(6, 24, 18, 0.9));
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  border: 1px solid rgba(167, 243, 208, 0.2);
  box-shadow:
    0 28px 64px rgba(4, 20, 14, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 1px 0 rgba(255, 255, 255, 0.1) inset;
}

.auth-header {
  text-align: center;
  margin-bottom: 22px;
}

.auth-card .brand-badge {
  display: inline-grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 14px;
  border-radius: 14px;
  color: #042f1e;
  background: linear-gradient(135deg, #a7f3d0, #34d399 55%, #10b981);
  box-shadow: 0 10px 24px rgba(16, 185, 129, 0.35);
}

.auth-header h2 {
  margin-bottom: 6px;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: 0.06em;
  color: #f0fdf4;
}

.auth-header p {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(209, 250, 229, 0.72);
}

.auth-tabs {
  display: flex;
  gap: 28px;
  margin-bottom: 22px;
  padding: 0 2px;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.auth-tabs button {
  position: relative;
  flex: 0 0 auto;
  padding: 10px 2px 12px;
  border-radius: 0;
  font-size: 14px;
  font-weight: 650;
  color: rgba(226, 245, 234, 0.48);
  background: transparent;
  transition: color 0.18s ease;
}

.auth-tabs button::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.18s ease;
}

.auth-tabs button.active {
  color: #6ee7b7;
  background: transparent;
  box-shadow: none;
}

.auth-tabs button.active::after {
  background: linear-gradient(90deg, #a7f3d0, #34d399);
}

.auth-card .form-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.35);
}

.auth-card .form-label {
  color: rgba(220, 252, 231, 0.82);
}

.auth-input-wrap {
  position: relative;
}

.auth-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(167, 243, 208, 0.7);
  pointer-events: none;
  z-index: 1;
}

.auth-card .form-input {
  padding-left: 38px;
  color: #f0fdf4;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(167, 243, 208, 0.18);
  box-shadow: none;
}

.auth-card .form-input::placeholder {
  color: rgba(167, 243, 208, 0.35);
}

.auth-card .form-input:focus {
  border-color: rgba(52, 211, 153, 0.65);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.22);
  background: rgba(255, 255, 255, 0.09);
}

.auth-submit {
  width: 100%;
  margin-top: 8px;
  padding: 13px 16px;
  font-size: 15px;
  font-weight: 700;
  border: none;
  border-radius: 12px;
  color: #042f1e !important;
  background: linear-gradient(135deg, #d9f99d, #6ee7b7 42%, #34d399) !important;
  box-shadow: 0 10px 28px rgba(52, 211, 153, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.25) inset !important;
}

.auth-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  background: linear-gradient(135deg, #ecfccb, #86efac 45%, #10b981) !important;
  box-shadow: 0 14px 32px rgba(52, 211, 153, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.3) inset !important;
}

/* ==========================================================================
   2. 我的空间 — image1.png full-bleed reproduction
   ========================================================================== */
.space-page {
  position: relative;
  min-height: 100dvh;
  color: #111827;
  overflow-x: hidden;
}

.space-scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-color: #dce8e2;
  background-image: url('/overview-bg.png');
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
}

.space-scene::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.04);
}

.space-nav,
.space-body {
  position: relative;
  z-index: 1;
}

.space-nav {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  width: min(1240px, calc(100% - 48px));
  margin: 18px auto 0;
  padding: 10px 22px;
  height: 64px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  box-shadow: 0 10px 32px rgba(15, 40, 28, 0.08);
}

.space-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-self: start;
}

.fold-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
}

.fold-mark svg {
  width: 30px;
  height: 30px;
}

.space-brand-name {
  font-size: 16px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: #111827;
}

.space-tabs {
  display: flex;
  align-items: stretch;
  gap: 8px;
  height: 100%;
}

.space-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  color: #9ca3af;
  font-size: 14px;
  font-weight: 650;
  height: 100%;
}

.space-tab.is-active,
.space-tab.router-link-active {
  color: #00b88f;
}

.space-tab.is-active::after,
.space-tab.router-link-exact-active::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 8px;
  height: 3px;
  border-radius: 999px;
  background: #00b88f;
}

.space-user {
  position: relative;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-self: end;
  padding: 4px 4px 4px 4px;
  cursor: pointer;
  color: #374151;
}

.space-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #12b981;
  color: #fff;
  font-size: 13px;
  font-weight: 750;
}

.space-user-name {
  font-size: 14px;
  font-weight: 650;
}

.space-user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  min-width: 140px;
  padding: 6px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.space-user-menu button {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #374151;
}

.space-user-menu button:hover {
  background: #f3f4f6;
}

.space-body {
  width: min(1240px, calc(100% - 48px));
  margin: 0 auto;
  padding: 28px 0 72px;
}

.space-heading h1 {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #111827;
  line-height: 1.2;
}

.space-heading p {
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}

.space-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 22px 0 22px;
  flex-wrap: wrap;
}

.space-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border-radius: 12px;
  background: #00b88f;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(0, 184, 143, 0.28);
}

.space-create-btn:hover {
  background: #00a67f;
}

.space-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.view-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.05);
}

.view-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: #9ca3af;
}

.view-btn.active {
  background: #00b88f;
  color: #fff;
}

.search-box {
  position: relative;
  width: 280px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 42px;
  padding: 0 16px 0 40px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #111827;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.05);
}

.search-input:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(0, 184, 143, 0.18);
}

.space-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fef2f2;
  color: #dc2626;
}

.space-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 22px;
}

.space-card {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 40, 28, 0.07);
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}

.space-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 32px rgba(15, 40, 28, 0.12);
}

.card-cover {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: #e8f5ef;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vis-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.04em;
}

.vis-tag.is-public {
  background: rgba(255, 255, 255, 0.92);
  color: #00b88f;
}

.vis-tag.is-private {
  background: rgba(255, 255, 255, 0.92);
  color: #4b5563;
}

.card-body {
  padding: 14px 16px 12px;
}

.card-body h2 {
  font-size: 16px;
  font-weight: 750;
  color: #111827;
}

.card-date {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.status-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
  font-weight: 650;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d1d5db;
}

.status-dot.is-live {
  background: #00b88f;
}

.status-dot.is-draft {
  background: #f59e0b;
}

.more-wrap {
  position: relative;
}

.more-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #9ca3af;
}

.more-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.card-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  min-width: 132px;
  padding: 6px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  z-index: 3;
}

.card-menu button {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #374151;
}

.card-menu button:hover {
  background: #ecfdf5;
  color: #047857;
}

.create-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 268px;
  border-radius: 16px;
  border: 1.5px dashed #7dd3b5;
  background: rgba(236, 253, 245, 0.62);
  color: #00b88f;
  cursor: pointer;
}

.create-card strong {
  font-size: 16px;
  font-weight: 750;
}

.create-card span:last-child {
  font-size: 12px;
  font-weight: 500;
  color: #9ca3af;
}

.create-plus {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 184, 143, 0.14);
  color: #047857;
  margin-bottom: 4px;
}

.create-card:hover {
  background: rgba(220, 252, 231, 0.78);
}

.space-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 10px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 14px;
  text-align: left;
  box-shadow: 0 4px 16px rgba(15, 40, 28, 0.06);
}

.list-thumb {
  width: 72px;
  height: 48px;
  object-fit: cover;
  border-radius: 8px;
}

.list-copy {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.list-copy strong {
  font-size: 14px;
  color: #111827;
}

.list-copy span {
  font-size: 12px;
  color: #9ca3af;
}

.list-row .vis-tag {
  position: static;
}

.space-empty {
  text-align: center;
  padding: 64px 20px;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 16px;
}

.space-empty h2,
.space-empty h3 {
  font-size: 20px;
  color: #111827;
}

.space-empty p {
  margin: 8px 0 16px;
  color: #6b7280;
}

.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-card {
  background: #fff;
  border-radius: 22px;
  padding: 32px;
  width: min(480px, 100%);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.22);
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 22px;
}

.modal-title-box {
  display: flex;
  align-items: center;
  gap: 14px;
}

.modal-icon-bubble {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #ecfdf5;
  color: #059669;
  display: grid;
  place-items: center;
}

.modal-title-box h2 {
  font-size: 18px;
  font-weight: 750;
  color: #111827;
}

.modal-title-box p {
  font-size: 13px;
  color: #6b7280;
}

.modal-close {
  color: #9ca3af;
  padding: 6px;
  border-radius: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.space-page .form-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: #fef2f2;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 1180px) {
  .space-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .space-nav {
    grid-template-columns: auto 1fr auto;
    width: calc(100% - 24px);
    padding: 8px 12px;
  }

  .space-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .space-body {
    width: calc(100% - 24px);
  }
}

@media (max-width: 640px) {
  .space-grid {
    grid-template-columns: 1fr;
  }

  .space-tabs span {
    display: none;
  }

  .search-box {
    width: 160px;
  }
}
</style>
