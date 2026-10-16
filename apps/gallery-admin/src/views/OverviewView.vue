<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import Icon from '../components/Icon.vue'
import BrandMark from '../components/BrandMark.vue'
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
].map(path => `${import.meta.env.BASE_URL}${path.slice(1)}`)

type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type SortOption = 'updated' | 'created' | 'name'

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
const showPassword = ref(false)
const capsLock = ref(false)

async function changeAuthMode(mode: typeof authMode.value) {
  if (authLoading.value) return
  authMode.value = mode
  authError.value = ''
  showPassword.value = false
  capsLock.value = false
  await nextTick()
  document.getElementById(mode === 'register' ? 'auth-display-name' : 'auth-email')?.focus()
}

function updateCapsLock(event: KeyboardEvent) {
  capsLock.value = event.getModifierState('CapsLock')
}

watch([() => authForm.value.email, () => authForm.value.password, () => authForm.value.displayName], () => {
  authError.value = ''
})

const galleries = ref<Gallery[]>([])
const loading = ref(false)
const loadError = ref('')

const searchQuery = ref('')
const statusFilter = ref<StatusFilter>('ALL')
const sortBy = ref<SortOption>('updated')
const viewMode = ref<'grid' | 'list'>('grid')
const menuId = ref<string | null>(null)
const userMenuOpen = ref(false)

const showCreateModal = ref(false)
const createForm = ref({ name: '', slug: '', visibility: 'PUBLIC' })
const createPassword = ref('')
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
  createError.value = ''
  createPassword.value = ''
  showCreateModal.value = true
}

const statusCounts = computed(() => {
  const all = galleries.value.length
  const draft = galleries.value.filter(g => g.status === 'DRAFT').length
  const published = galleries.value.filter(g => g.status === 'PUBLISHED').length
  const archived = galleries.value.filter(g => g.status === 'ARCHIVED').length
  return { all, draft, published, archived }
})

const filteredGalleries = computed(() => {
  const list = galleries.value.filter(g => {
    if (statusFilter.value !== 'ALL' && g.status !== statusFilter.value) return false
    if (!searchQuery.value.trim()) return true
    const query = searchQuery.value.trim().toLowerCase()
    return g.name.toLowerCase().includes(query) || g.slug.toLowerCase().includes(query)
  })

  return list.slice().sort((a, b) => {
    if (sortBy.value === 'name') {
      return a.name.localeCompare(b.name, 'zh-CN')
    }
    if (sortBy.value === 'created') {
      const ta = new Date(a.createdAt).getTime() || 0
      const tb = new Date(b.createdAt).getTime() || 0
      return tb - ta
    }
    // Default: 'updated'
    const ta = new Date(a.updatedAt || a.createdAt).getTime() || 0
    const tb = new Date(b.updatedAt || b.createdAt).getTime() || 0
    return tb - ta
  })
})

function coverFor(gallery: Gallery) {
  if (gallery.coverThumbnailUrl) return gallery.coverThumbnailUrl
  let hash = 0
  for (const ch of gallery.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_COVERS[hash % FALLBACK_COVERS.length]
}

function formatTime(value?: string | null) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 86400_000 * 7) return `${Math.floor(diff / 86400_000)} 天前`
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function visibilityLabel(gallery: Gallery) {
  if (gallery.visibility === 'PUBLIC') return '公开'
  if (gallery.visibility === 'PASSWORD') return '密码保护'
  return '私密'
}

function statusLabel(gallery: Gallery) {
  return gallery.status === 'PUBLISHED' ? '已发布' : gallery.status === 'ARCHIVED' ? '已归档' : '草稿'
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

function closeMenuFromKeyboard(event: KeyboardEvent) {
  closeMenus()
  ;(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('button')?.focus()
}

async function navigateMenu(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const wrapper = event.currentTarget as HTMLElement
  const trigger = wrapper.querySelector<HTMLButtonElement>('button')
  if (!trigger) return
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    if (event.key === 'Home' || event.key === 'End') return
    trigger.click()
    await nextTick()
  }
  const items = Array.from(wrapper.querySelectorAll<HTMLButtonElement>('.card-menu button, .space-user-menu button')).filter(button => !button.disabled)
  if (!items.length) return
  const index = items.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : index < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0)
    : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
  items[next]?.focus()
}

function closeMenuOnBlur(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) closeMenus()
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
  if (authLoading.value) return
  if (authForm.value.password.length < 6 || authForm.value.password.length > 128) {
    authError.value = '密码长度需要为 6–128 个字符。'
    return
  }
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
    authForm.value.password = ''
    toast.success(authMode.value === 'register' ? '注册成功，欢迎进入！' : '登录成功')
  } catch (error) {
    authError.value = error instanceof TypeError ? '网络连接异常，请检查网络后重试。' : error instanceof Error ? error.message : '网络连接异常，请稍后重试。'
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
  if (creating.value) return
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
  const draft = { ...createForm.value, password: createPassword.value }
  if (draft.visibility === 'PASSWORD' && draft.password.length < 6) {
    createError.value = '请设置至少 6 个字符的展厅访问密码。'
    return
  }
  creating.value = true
  createError.value = ''
  try {
    const response = await apiFetch('/api/galleries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        visibility: draft.visibility
      })
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string }
      createError.value = body.message || '创建空间失败，请稍后重试。'
      toast.error(createError.value)
      return
    }
    const newGallery = await response.json() as Gallery
    let passwordSaved = true
    if (draft.visibility === 'PASSWORD') {
      try {
        const passwordResponse = await apiFetch(`/api/galleries/${newGallery.id}/password`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: draft.password })
        })
        passwordSaved = passwordResponse.ok
      } catch {
        passwordSaved = false
      }
    }
    showCreateModal.value = false
    createForm.value = { name: '', slug: '', visibility: 'PUBLIC' }
    createPassword.value = ''
    if (passwordSaved) toast.success(`空间“${newGallery.name}”创建成功！`)
    else toast.error('空间已创建，访问密码未保存。请在发布设置中重新设置密码后发布。')
    navigateToWorkspace(newGallery.id)
  } catch (error) {
    createError.value = error instanceof Error ? error.message : '网络请求失败，请稍后重试。'
    toast.error(createError.value)
  } finally {
    creating.value = false
  }
}

// ---- 重命名空间 ----
const showRenameModal = ref(false)
const renameForm = ref({ id: '', name: '' })
const renaming = ref(false)
const renameError = ref('')
const { root: renameModalRoot } = useModalFocus(showRenameModal, {
  onEscape: () => { if (!renaming.value) showRenameModal.value = false },
  disabled: renaming
})

function openRenameModal(gallery: Gallery) {
  document.querySelector<HTMLButtonElement>('.more-btn[aria-expanded="true"]')?.focus()
  closeMenus()
  renameForm.value = { id: gallery.id, name: gallery.name }
  renameError.value = ''
  showRenameModal.value = true
}

async function handleRenameGallery() {
  if (renaming.value) return
  const name = renameForm.value.name.trim()
  if (!name) {
    renameError.value = '请填写空间名称。'
    return
  }
  renaming.value = true
  renameError.value = ''
  try {
    const response = await apiFetch(`/api/galleries/${renameForm.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string }
      renameError.value = body.message || '重命名失败，请稍后重试。'
      return
    }
    const updated = await response.json() as Gallery
    const index = galleries.value.findIndex(g => g.id === updated.id)
    if (index !== -1) galleries.value[index] = updated
    showRenameModal.value = false
    toast.success('空间已重命名。')
  } catch (error) {
    renameError.value = error instanceof Error ? error.message : '网络请求失败，请稍后重试。'
  } finally {
    renaming.value = false
  }
}

// ---- 删除空间（软删除，需要输入名称确认） ----
const showDeleteModal = ref(false)
const galleryToDelete = ref<Gallery | null>(null)
const deleteConfirmName = ref('')
const deletingGallery = ref(false)
const deleteError = ref('')
const { root: deleteModalRoot } = useModalFocus(showDeleteModal, {
  onEscape: () => { if (!deletingGallery.value) showDeleteModal.value = false },
  disabled: deletingGallery
})

const deleteConfirmReady = computed(() =>
  !!galleryToDelete.value && deleteConfirmName.value.trim() === galleryToDelete.value.name
)

function openDeleteModal(gallery: Gallery) {
  document.querySelector<HTMLButtonElement>('.more-btn[aria-expanded="true"]')?.focus()
  closeMenus()
  galleryToDelete.value = gallery
  deleteConfirmName.value = ''
  deleteError.value = ''
  showDeleteModal.value = true
}

async function handleDeleteGallery() {
  const target = galleryToDelete.value
  if (!target || !deleteConfirmReady.value || deletingGallery.value) return
  deletingGallery.value = true
  deleteError.value = ''
  try {
    const response = await apiFetch(`/api/galleries/${target.id}`, { method: 'DELETE' })
    if (response.status === 409) {
      deleteError.value = '该展厅仍在发布状态，请先撤回发布，再删除空间。'
      return
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string }
      deleteError.value = body.message || '删除空间失败，请稍后重试。'
      return
    }
    galleries.value = galleries.value.filter(g => g.id !== target.id)
    showDeleteModal.value = false
    galleryToDelete.value = null
    toast.success(`空间“${target.name}”已删除。`)
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '网络请求失败，请稍后重试。'
  } finally {
    deletingGallery.value = false
  }
}
</script>

<template>
  <!-- Fullscreen Immersive Login / Register (Guest Mode) -->
  <div v-if="!currentUser" class="auth-immersive">
    <div class="auth-scene">
      <div class="auth-brand-mark"><BrandMark :size="30" /><span>阳光明媚</span></div>
      <div class="auth-story">
        <h2>让每一张照片，<br />拥有自己的空间。</h2>
        <p>整理作品，布置展厅，把值得记住的瞬间分享出去。</p>
        <div class="auth-story-path" aria-label="创作流程"><span>上传作品</span><Icon name="arrow-right" :size="15" /><span>布置展厅</span><Icon name="arrow-right" :size="15" /><span>发布分享</span></div>
      </div>
    </div>
    <div class="auth-card">
      <div class="auth-mobile-brand"><BrandMark :size="28" /><span>阳光明媚</span></div>
      <div class="auth-header">
        <h1>{{ authMode === 'register' ? '从这里，开始创作。' : '欢迎回到你的空间' }}</h1>
        <p>{{ authMode === 'register' ? '创建账户，让作品在新的空间里被看见。' : '登录后，继续整理作品与布置展厅。' }}</p>
      </div>
      <div class="auth-tabs">
        <button :class="{ active: authMode === 'login' }" :aria-pressed="authMode === 'login'" :disabled="authLoading" type="button" @click="changeAuthMode('login')">账号登录</button>
        <button :class="{ active: authMode === 'register' }" :aria-pressed="authMode === 'register'" :disabled="authLoading" type="button" @click="changeAuthMode('register')">注册账户</button>
      </div>
      <div v-if="authError" class="form-error" role="alert"><Icon name="alert-circle" :size="16" /><span>{{ authError }}</span></div>

      <!-- Login / Register Form -->
      <form @submit.prevent="handleAuthSubmit">
        <div v-if="authMode === 'register'" class="form-group auth-field">
          <label class="form-label" for="auth-display-name">用户名称</label>
          <div class="auth-input-wrap">
            <Icon name="user" :size="16" class="auth-input-icon" />
            <input id="auth-display-name" v-model="authForm.displayName" autocomplete="nickname" maxlength="80" :disabled="authLoading" placeholder="你的创作者名称" class="form-input" required />
          </div>
        </div>
        <div class="form-group auth-field">
          <label class="form-label" for="auth-email">电子邮箱</label>
          <div class="auth-input-wrap">
            <Icon name="users" :size="16" class="auth-input-icon" />
            <input id="auth-email" v-model="authForm.email" type="email" autocomplete="username" inputmode="email" :disabled="authLoading" placeholder="name@example.com" class="form-input" required />
          </div>
        </div>
        <div class="form-group auth-field">
          <div class="field-label-row">
            <label class="form-label" for="auth-password">{{ authMode === 'register' ? '设置密码' : '密码' }}</label>
          </div>
          <div class="auth-input-wrap">
            <Icon name="lock" :size="16" class="auth-input-icon" />
            <input id="auth-password" v-model="authForm.password" :type="showPassword ? 'text' : 'password'" :autocomplete="authMode === 'register' ? 'new-password' : 'current-password'" :placeholder="authMode === 'register' ? '至少 6 个字符' : '输入你的密码'" class="form-input password-input" minlength="6" maxlength="128" :disabled="authLoading" aria-describedby="auth-password-hint" @keydown="updateCapsLock" @keyup="updateCapsLock" @blur="capsLock = false" required />
            <button class="password-toggle" type="button" :disabled="authLoading" :aria-pressed="showPassword" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</button>
          </div>
          <p id="auth-password-hint" class="password-hint" :class="{ 'caps-lock-hint': capsLock }" aria-live="polite">{{ capsLock ? '大写锁定已开启，请注意密码大小写。' : '密码至少 6 个字符。' }}</p>
        </div>
        <button id="btn-auth-submit" type="submit" class="btn btn-primary auth-submit" :disabled="authLoading">
          <Icon v-if="authLoading" name="refresh" :size="16" class="spin" />
          <span>{{ authLoading ? '认证中…' : (authMode === 'register' ? '创建并进入工作区' : '登录控制台') }}</span>
        </button>
      </form>
      <p class="auth-footnote"><Icon name="lock" :size="14" />作品由你掌握，发布时再与世界分享。</p>
    </div>
  </div>

  <!-- 我的空间 -->
  <div v-else class="space-page">
    <div class="space-scene" aria-hidden="true"></div>

    <header class="space-nav">
      <RouterLink to="/" class="space-brand">
        <BrandMark :size="28" />
        <span class="space-brand-name">阳光明媚</span>
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

      <div class="space-user" @keydown.esc.stop="closeMenuFromKeyboard" @keydown="navigateMenu" @focusout="closeMenuOnBlur">
        <button class="space-user-trigger" type="button" :aria-expanded="userMenuOpen" aria-label="账户菜单" @click.stop="userMenuOpen = !userMenuOpen" @keydown.esc="userMenuOpen = false">
        <div class="space-avatar">{{ userInitial }}</div>
        <span class="space-user-name">{{ userDisplayName }}</span>
        <Icon name="chevron-down" :size="14" />
        </button>
        <div v-if="userMenuOpen" class="space-user-menu" @click.stop>
          <button type="button" @click="handleLogout">退出登录</button>
        </div>
      </div>
    </header>

    <div class="space-body">
      <div class="space-heading">
        <h1>我的空间</h1>
        <p>从一组照片，到一场属于你的展览。</p>
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

        <!-- 状态筛选 Chips -->
        <div class="status-filter-group">
          <button
            class="status-tab-btn"
            :class="{ active: statusFilter === 'ALL' }"
            :aria-pressed="statusFilter === 'ALL'"
            type="button"
            @click="statusFilter = 'ALL'"
          >
            全部 ({{ statusCounts.all }})
          </button>
          <button
            class="status-tab-btn"
            :class="{ active: statusFilter === 'DRAFT' }"
            :aria-pressed="statusFilter === 'DRAFT'"
            type="button"
            @click="statusFilter = 'DRAFT'"
          >
            草稿 ({{ statusCounts.draft }})
          </button>
          <button
            class="status-tab-btn"
            :class="{ active: statusFilter === 'PUBLISHED' }"
            :aria-pressed="statusFilter === 'PUBLISHED'"
            type="button"
            @click="statusFilter = 'PUBLISHED'"
          >
            已发布 ({{ statusCounts.published }})
          </button>
          <button
            v-if="statusCounts.archived > 0"
            class="status-tab-btn"
            :class="{ active: statusFilter === 'ARCHIVED' }"
            :aria-pressed="statusFilter === 'ARCHIVED'"
            type="button"
            @click="statusFilter = 'ARCHIVED'"
          >
            已归档 ({{ statusCounts.archived }})
          </button>
        </div>

        <div class="space-toolbar-right">
          <!-- 排序方式 -->
          <div class="sort-selector">
            <select v-model="sortBy" class="sort-select" aria-label="排序方式">
              <option value="updated">最近更新</option>
              <option value="created">最近创建</option>
              <option value="name">名称排序</option>
            </select>
          </div>

          <div class="view-toggle" role="group" aria-label="展示方式">
            <button
              class="view-btn"
              :class="{ active: viewMode === 'grid' }"
              type="button"
              title="网格视图"
              aria-label="网格视图"
              :aria-pressed="viewMode === 'grid'"
              @click="viewMode = 'grid'"
            >
              <Icon name="grid" :size="15" />
            </button>
            <button
              class="view-btn"
              :class="{ active: viewMode === 'list' }"
              type="button"
              title="列表视图"
              aria-label="列表视图"
              :aria-pressed="viewMode === 'list'"
              @click="viewMode = 'list'"
            >
              <Icon name="list" :size="15" />
            </button>
          </div>

          <div class="search-box">
            <Icon name="search" :size="16" class="search-icon" />
            <input
              v-model="searchQuery"
              type="search"
              class="search-input"
              placeholder="搜索空间名称或地址"
              aria-label="搜索空间名称或地址"
              @keydown.esc="searchQuery = ''"
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
          @keydown.enter.self="navigateToWorkspace(gallery.id)"
          @keydown.space.self.prevent="navigateToWorkspace(gallery.id)"
        >
          <div class="card-cover">
            <img :src="coverFor(gallery)" class="cover-image" :alt="gallery.name" loading="lazy" />
            <span class="vis-tag" :class="gallery.visibility === 'PUBLIC' ? 'is-public' : gallery.visibility === 'PASSWORD' ? 'is-password' : 'is-private'">
              {{ visibilityLabel(gallery) }}
            </span>
            <span v-if="gallery.hasUnpublishedConfig" class="badge-draft-config">
              待发布配置
            </span>
          </div>
          <div class="card-body">
            <div class="card-title-row">
              <h2>{{ gallery.name }}</h2>
            </div>

            <!-- 卡片 Meta 数据摘要 -->
            <div class="card-metrics-row">
              <span class="metric-item">{{ gallery.photoCount ?? 0 }} 张照片</span>
              <span v-if="gallery.processingCount && gallery.processingCount > 0" class="metric-badge processing">
                {{ gallery.processingCount }} 处理中
              </span>
              <span v-if="gallery.failedPhotoCount && gallery.failedPhotoCount > 0" class="metric-badge failed">
                {{ gallery.failedPhotoCount }} 失败
              </span>
            </div>

            <p class="card-date">更新于 {{ formatTime(gallery.updatedAt || gallery.createdAt) }}</p>

            <div class="card-foot">
              <span class="status-meta">
                <span class="status-dot" :class="gallery.status === 'PUBLISHED' ? 'is-live' : 'is-draft'"></span>
                <span>{{ statusLabel(gallery) }}</span>
              </span>
              <div class="more-wrap" @keydown.esc.stop="closeMenuFromKeyboard" @keydown="navigateMenu" @focusout="closeMenuOnBlur">
                <button
                  class="more-btn"
                  type="button"
                  aria-label="更多操作"
                  :aria-expanded="menuId === gallery.id"
                  @keydown.esc="menuId = null"
                  @click="toggleCardMenu(gallery.id, $event)"
                >
                  <Icon name="more" :size="16" />
                </button>
                <div v-if="menuId === gallery.id" class="card-menu" @click.stop>
                  <button type="button" @click="navigateToWorkspace(gallery.id)">进入工作区</button>
                  <button type="button" @click="navigateToConfig(gallery.id)">展厅配置</button>
                  <button type="button" @click="openViewer(gallery)">预览展厅</button>
                  <template v-if="isOwner">
                    <button type="button" @click="openRenameModal(gallery)">重命名</button>
                    <button type="button" class="card-menu-danger" @click="openDeleteModal(gallery)">删除空间…</button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </article>

      </div>

      <div v-else-if="!loading && !loadError && filteredGalleries.length" class="space-list">
        <button
          v-for="gallery in filteredGalleries"
          :key="gallery.id"
          class="list-row"
          type="button"
          @click="navigateToWorkspace(gallery.id)"
        >
          <img :src="coverFor(gallery)" class="list-thumb" :alt="gallery.name" />
          <div class="list-copy">
            <div class="list-head-row">
              <strong>{{ gallery.name }}</strong>
              <span v-if="gallery.hasUnpublishedConfig" class="badge-draft-config-inline">待发布配置</span>
            </div>
            <div class="list-meta-line">
              <span>{{ gallery.photoCount ?? 0 }} 张照片</span>
              <span v-if="gallery.processingCount && gallery.processingCount > 0" class="metric-badge processing-sm">{{ gallery.processingCount }} 处理中</span>
              <span v-if="gallery.failedPhotoCount && gallery.failedPhotoCount > 0" class="metric-badge failed-sm">{{ gallery.failedPhotoCount }} 失败</span>
              <span>更新于 {{ formatTime(gallery.updatedAt || gallery.createdAt) }}</span>
            </div>
          </div>
          <span class="status-meta">
            <span class="status-dot" :class="gallery.status === 'PUBLISHED' ? 'is-live' : 'is-draft'"></span>
            <span>{{ statusLabel(gallery) }}</span>
          </span>
          <span class="vis-tag" :class="gallery.visibility === 'PUBLIC' ? 'is-public' : gallery.visibility === 'PASSWORD' ? 'is-password' : 'is-private'">
            {{ visibilityLabel(gallery) }}
          </span>
        </button>
      </div>

      <div v-else-if="!loading && !loadError && galleries.length && !filteredGalleries.length" class="space-empty">
        <h3>未找到匹配的空间</h3>
        <p>没有找到与当前筛选或 “{{ searchQuery }}” 相关的空间。</p>
        <button class="btn btn-secondary" type="button" @click="searchQuery = ''; statusFilter = 'ALL'">重置筛选</button>
      </div>

      <div v-else-if="loading" class="space-loading" role="status" aria-live="polite">
        <p>正在加载空间…</p>
        <div class="space-grid" aria-hidden="true"><div v-for="n in 3" :key="n" class="space-skeleton"><div></div><span></span><span></span></div></div>
      </div>

      <div v-else-if="!galleries.length && !loadError" class="space-empty">
        <h2>还没有画廊空间</h2>
        <p>创建第一个 3D 展厅，上传照片后即可配置氛围并分享给访客。</p>
        <button v-if="canCreateGallery" class="space-create-btn" type="button" @click="openCreateModal">
          <Icon name="plus" :size="16" />
          <span>创建第一组照片</span>
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

          <div v-if="createError" class="form-error" role="alert">
            <Icon name="alert-circle" :size="16" />
            <span>{{ createError }}</span>
          </div>

          <form @submit.prevent="handleCreateGallery">
            <div class="form-group">
              <label class="form-label" for="input-gallery-name">空间名称</label>
              <input
                id="input-gallery-name"
                :disabled="creating"
                v-model="createForm.name"
                placeholder="例如：晨雾森林"
                class="form-input"
                maxlength="160"
                required
                @input="handleNameInput"
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="input-gallery-slug">访问地址</label>
              <input
                id="input-gallery-slug"
                :disabled="creating"
                v-model="createForm.slug"
                placeholder="例如：morning-forest"
                class="form-input"
                maxlength="80"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="使用小写字母、数字，多个单词之间使用单个连字符"
                aria-describedby="gallery-slug-hint"
                required
              />
              <p id="gallery-slug-hint" class="form-hint">用于访客链接，可用小写字母、数字和连字符。中文名称会自动生成可用地址。</p>
            </div>
            <div class="form-group">
              <label class="form-label" for="select-gallery-visibility">访问权限</label>
              <select id="select-gallery-visibility" v-model="createForm.visibility" class="select-input" :disabled="creating">
                <option value="PUBLIC">公开</option>
                <option value="PRIVATE">私密</option>
                <option value="PASSWORD">密码保护</option>
              </select>
            </div>
            <div v-if="createForm.visibility === 'PASSWORD'" class="form-group">
              <label class="form-label" for="create-password">展厅访问密码</label>
              <input id="create-password" v-model="createPassword" class="form-input" type="password" autocomplete="new-password" minlength="6" maxlength="128" placeholder="至少 6 个字符，与登录密码无关" :disabled="creating" required />
            </div>
            <p class="form-hint">创建后先保存为草稿，完成发布后访客才能访问。</p>
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

    <Transition name="modal-fade">
      <div v-if="showRenameModal" class="modal-backdrop" @click.self="!renaming && (showRenameModal = false)">
        <div
          ref="renameModalRoot"
          class="modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-title"
          tabindex="-1"
        >
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble">
                <Icon name="edit" :size="20" />
              </div>
              <div>
                <h2 id="rename-title">重命名空间</h2>
                <p>修改空间显示名称，访客链接保持不变</p>
              </div>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" :disabled="renaming" @click="showRenameModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>

          <div v-if="renameError" class="form-error">
            <Icon name="alert-circle" :size="16" />
            <span>{{ renameError }}</span>
          </div>

          <form @submit.prevent="handleRenameGallery">
            <div class="form-group">
              <label class="form-label" for="input-rename-name">空间名称</label>
              <input
                id="input-rename-name"
                v-model="renameForm.name"
                placeholder="例如：晨雾森林"
                class="form-input"
                maxlength="160"
                required
              />
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" :disabled="renaming" @click="showRenameModal = false">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="renaming">
                <Icon v-if="renaming" name="refresh" :size="16" class="spin" />
                <span>{{ renaming ? '保存中…' : '保存' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <Transition name="modal-fade">
      <div v-if="showDeleteModal && galleryToDelete" class="modal-backdrop" @click.self="!deletingGallery && (showDeleteModal = false)">
        <div
          ref="deleteModalRoot"
          class="modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          tabindex="-1"
        >
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble is-danger">
                <Icon name="trash" :size="20" />
              </div>
              <div>
                <h2 id="delete-title">删除空间</h2>
                <p>删除后空间及其照片将无法恢复</p>
              </div>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" :disabled="deletingGallery" @click="showDeleteModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>

          <div v-if="deleteError" class="form-error">
            <Icon name="alert-circle" :size="16" />
            <span>{{ deleteError }}</span>
          </div>

          <div class="form-group">
            <p class="delete-warning">
              即将删除空间 <strong>「{{ galleryToDelete.name }}」</strong>
              <template v-if="(galleryToDelete.photoCount ?? 0) > 0">
                ，其中包含 {{ galleryToDelete.photoCount }} 张照片
              </template>
              。此操作不可撤销。为避免误删，请输入空间名称以确认。
            </p>
            <label class="form-label" for="input-delete-confirm">空间名称</label>
            <input
              id="input-delete-confirm"
              v-model="deleteConfirmName"
              class="form-input"
              :placeholder="galleryToDelete.name"
              autocomplete="off"
            />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" :disabled="deletingGallery" @click="showDeleteModal = false">取消</button>
            <button
              type="button"
              class="btn btn-danger-solid"
              :disabled="!deleteConfirmReady || deletingGallery"
              @click="handleDeleteGallery"
            >
              <Icon v-if="deletingGallery" name="refresh" :size="16" class="spin" />
              <span>{{ deletingGallery ? '删除中…' : '确认删除' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped src="../styles/overview.css"></style>
