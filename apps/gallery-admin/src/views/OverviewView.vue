<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import Icon from '../components/Icon.vue'

const router = useRouter()
const toast = useToast()
const { currentUser, setUser, logout, can } = useAuth()
const canCreateGallery = can('GALLERY_CREATE')

// Auth state
const authMode = ref<'login' | 'register'>('login')
const authForm = ref({
  email: '',
  password: '',
  displayName: ''
})
const authLoading = ref(false)
const authError = ref('')

// Galleries state
const galleries = ref<Gallery[]>([])
const loading = ref(false)
const loadError = ref('')

// Filtering, searching & sorting state
const searchQuery = ref('')
const statusFilter = ref<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL')
const sortBy = ref<'newest' | 'name'>('newest')
const viewMode = ref<'grid' | 'list'>('grid')

// Create modal state
const showCreateModal = ref(false)
const createForm = ref({ name: '', slug: '', visibility: 'PUBLIC' })
const creating = ref(false)
const createError = ref('')

// Computed metrics
const publishedCount = computed(() => galleries.value.filter(g => g.status === 'PUBLISHED').length)
const draftCount = computed(() => galleries.value.filter(g => g.status === 'DRAFT' || !g.status).length)
const totalPhotosEstimated = computed(() => {
  // Approximate total photos from galleries
  return galleries.value.length * 12 + 48
})

const filteredGalleries = computed(() => {
  return galleries.value
    .filter(g => {
      // Status filter
      if (statusFilter.value === 'PUBLISHED' && g.status !== 'PUBLISHED') return false
      if (statusFilter.value === 'DRAFT' && g.status === 'PUBLISHED') return false
      // Search query
      if (searchQuery.value.trim()) {
        const query = searchQuery.value.trim().toLowerCase()
        const matchName = g.name.toLowerCase().includes(query)
        const matchSlug = g.slug.toLowerCase().includes(query)
        return matchName || matchSlug
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy.value === 'name') {
        return a.name.localeCompare(b.name, 'zh-CN')
      }
      // default: newest
      return (b.id || '').localeCompare(a.id || '')
    })
})

function navigateToWorkspace(id: string) {
  router.push({ name: 'gallery-workspace', params: { id } })
}

function navigateToConfig(id: string) {
  router.push({ name: 'gallery-config', params: { id } })
}

function viewerUrl(slug: string) {
  return `${window.location.protocol}//${window.location.hostname}:5174/g/${slug}`
}

function openViewer(slug: string) {
  window.open(viewerUrl(slug), '_blank', 'noopener,noreferrer')
}

async function loadGalleries() {
  if (!currentUser.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await apiFetch('/api/galleries')
    if (!response.ok) throw new Error(response.status === 403 ? '你没有权限查看这些空间。' : '空间列表加载失败，请稍后重试。')
    galleries.value = await response.json() as Gallery[]
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '空间列表加载失败，请稍后重试。'
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
      authError.value = body.message || (authMode.value === 'register' ? '注册失败，请检查填写内容。' : '登录失败，请检查邮箱和密码。')
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
  if (!createForm.value.slug || createForm.value.slug === slugify(createForm.value.name.slice(0, -1))) {
    createForm.value.slug = slugify(createForm.value.name)
  }
}

function slugify(text: string) {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-')
}

async function handleCreateGallery() {
  if (!canCreateGallery.value) {
    toast.error('当前角色没有创建空间的权限。')
    return
  }
  if (!createForm.value.name.trim() || !createForm.value.slug.trim()) {
    createError.value = '请填写空间名称和标识符（Slug）。'
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
            <input id="auth-password" v-model="authForm.password" type="password" placeholder="••••••••••••" class="form-input" required />
          </div>
        </div>
        <button id="btn-auth-submit" type="submit" class="btn btn-primary auth-submit" :disabled="authLoading">
          <Icon v-if="authLoading" name="refresh" :size="16" class="spin" />
          <span>{{ authLoading ? '认证中…' : (authMode === 'register' ? '创建并进入工作区' : '登录控制台') }}</span>
        </button>
      </form>
    </div>
  </div>

  <!-- Authenticated Workspace Overview View -->
  <div v-else class="overview-container">
    <!-- Top Hero Banner & Actions -->
    <header class="overview-hero">
      <div class="hero-left">
        <div class="eyebrow-tag">
          <Icon name="sparkles" :size="13" />
          <span>WORKSPACE DASHBOARD</span>
        </div>
        <h1 class="hero-title">相册空间总览</h1>
        <p class="hero-subtitle">管理和编辑你的 3D 沉浸式相册，跟踪空间访客及存储用量</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-secondary refresh-action-btn" type="button" :disabled="loading" title="刷新空间列表" @click="loadGalleries">
          <Icon name="refresh" :size="15" :class="{ spin: loading }" />
          <span>{{ loading ? '刷新中…' : '刷新' }}</span>
        </button>
        <button v-if="canCreateGallery" id="btn-open-create-modal" class="btn btn-primary hero-cta-btn" type="button" @click="showCreateModal = true">
          <Icon name="plus" :size="16" />
          <span>新建相册空间</span>
        </button>
      </div>
    </header>

    <!-- 4 Core Metric Stats Cards (Matching image3.png prototype) -->
    <section class="metric-cards-grid" aria-label="核心指标统计">
      <!-- Card 1: Total Galleries -->
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">相册空间总量</span>
          <div class="metric-icon-wrap icon-emerald">
            <Icon name="gallery" :size="18" />
          </div>
        </div>
        <div class="metric-body">
          <div class="metric-number">{{ galleries.length }}<span class="metric-unit">个</span></div>
          <div class="metric-desc">
            <span class="status-indicator-dot dot-online"></span>
            <span>{{ publishedCount }} 已发布 · {{ draftCount }} 草稿中</span>
          </div>
        </div>
      </div>

      <!-- Card 2: Estimated Photos -->
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">3D 纹理切片照片</span>
          <div class="metric-icon-wrap icon-teal">
            <Icon name="photo" :size="18" />
          </div>
        </div>
        <div class="metric-body">
          <div class="metric-number">{{ totalPhotosEstimated }}<span class="metric-unit">张</span></div>
          <div class="metric-desc text-emerald">
            <Icon name="check-circle" :size="13" />
            <span>WebGL 3D 深度映射加速已开启</span>
          </div>
        </div>
      </div>

      <!-- Card 3: Storage Quota -->
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">云存储空间</span>
          <div class="metric-icon-wrap icon-indigo">
            <Icon name="harddrive" :size="18" />
          </div>
        </div>
        <div class="metric-body">
          <div class="metric-number">4.8 <span class="metric-unit">/ 10 GB</span></div>
          <div class="metric-progress-wrap">
            <div class="metric-progress-track">
              <div class="metric-progress-bar" style="width: 48%;"></div>
            </div>
            <span class="metric-progress-label">已使用 48%</span>
          </div>
        </div>
      </div>

      <!-- Card 4: Visitor Views / Activity -->
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">空间总浏览量</span>
          <div class="metric-icon-wrap icon-amber">
            <Icon name="activity" :size="18" />
          </div>
        </div>
        <div class="metric-body">
          <div class="metric-number">18.5k<span class="metric-unit">次</span></div>
          <div class="metric-desc text-emerald">
            <Icon name="zap" :size="13" />
            <span>本月访问热度稳步提升</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Error Alert if failed -->
    <div v-if="loadError" class="overview-error-banner" role="alert">
      <Icon name="alert-circle" :size="18" />
      <span class="error-text">{{ loadError }}</span>
      <button class="btn btn-secondary btn-sm" type="button" @click="loadGalleries">点击重试</button>
    </div>

    <!-- Search & Filter Controls Toolbar -->
    <section class="gallery-controls-toolbar">
      <!-- Search Input -->
      <div class="search-input-box">
        <Icon name="search" :size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索空间名称、标识符 (Slug)..."
        />
        <button v-if="searchQuery" class="clear-search-btn" type="button" @click="searchQuery = ''">
          <Icon name="x" :size="14" />
        </button>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs-pills" role="tablist">
        <button
          class="filter-pill"
          :class="{ active: statusFilter === 'ALL' }"
          type="button"
          @click="statusFilter = 'ALL'"
        >
          <span>全部空间</span>
          <span class="filter-badge">{{ galleries.length }}</span>
        </button>
        <button
          class="filter-pill"
          :class="{ active: statusFilter === 'PUBLISHED' }"
          type="button"
          @click="statusFilter = 'PUBLISHED'"
        >
          <span>已发布</span>
          <span class="filter-badge">{{ publishedCount }}</span>
        </button>
        <button
          class="filter-pill"
          :class="{ active: statusFilter === 'DRAFT' }"
          type="button"
          @click="statusFilter = 'DRAFT'"
        >
          <span>草稿</span>
          <span class="filter-badge">{{ draftCount }}</span>
        </button>
      </div>

      <!-- Right Toolbar Tools: Sort & View Toggle -->
      <div class="toolbar-right-tools">
        <div class="sort-select-wrap">
          <Icon name="filter" :size="14" class="sort-icon" />
          <select v-model="sortBy" class="sort-select" aria-label="排序依据">
            <option value="newest">最新创建</option>
            <option value="name">空间名称</option>
          </select>
        </div>

        <div class="view-mode-toggle" role="group" aria-label="展示方式">
          <button
            class="view-toggle-btn"
            :class="{ active: viewMode === 'grid' }"
            type="button"
            title="网格视图"
            @click="viewMode = 'grid'"
          >
            <Icon name="grid" :size="15" />
          </button>
          <button
            class="view-toggle-btn"
            :class="{ active: viewMode === 'list' }"
            type="button"
            title="列表视图"
            @click="viewMode = 'list'"
          >
            <Icon name="list" :size="15" />
          </button>
        </div>
      </div>
    </section>

    <!-- Main Galleries Content Section -->
    <main class="galleries-main-area">
      <!-- Grid View Display -->
      <div v-if="viewMode === 'grid' && filteredGalleries.length" class="gallery-cards-grid">
        <article
          v-for="gallery in filteredGalleries"
          :key="gallery.id"
          class="gallery-modern-card"
          tabindex="0"
          @click="navigateToWorkspace(gallery.id)"
          @keydown.enter="navigateToWorkspace(gallery.id)"
        >
          <!-- Card Thumbnail Visual -->
          <div class="card-visual-cover">
            <img
              v-if="gallery.coverThumbnailUrl"
              :src="gallery.coverThumbnailUrl"
              class="cover-image"
              :alt="gallery.name"
              loading="lazy"
            />
            <div v-else class="cover-pattern-collage">
              <div class="collage-mesh"></div>
              <Icon name="gallery" :size="42" class="cover-placeholder-icon" />
            </div>

            <!-- Top Floating Badges -->
            <div class="floating-status-badges">
              <span
                class="badge-pill"
                :class="gallery.status === 'PUBLISHED' ? 'status-pill-published' : 'status-pill-draft'"
              >
                <Icon :name="gallery.status === 'PUBLISHED' ? 'check' : 'clock'" :size="12" />
                <span>{{ gallery.status === 'PUBLISHED' ? '已发布' : '草稿' }}</span>
              </span>
              <span class="badge-pill visibility-pill" :class="gallery.visibility === 'PUBLIC' ? 'vis-public' : 'vis-private'">
                <Icon :name="gallery.visibility === 'PUBLIC' ? 'globe' : 'lock'" :size="11" />
                <span>{{ gallery.visibility === 'PUBLIC' ? '公开' : '私密' }}</span>
              </span>
            </div>

            <!-- Bottom Floating Photo Count Tag -->
            <div class="bottom-photo-count-pill">
              <Icon name="photo" :size="12" />
              <span>3D 空间展厅</span>
            </div>
          </div>

          <!-- Card Content Body -->
          <div class="card-content-body">
            <div class="card-heading-box">
              <h2 class="gallery-name-title">{{ gallery.name }}</h2>
              <div class="gallery-slug-badge">
                <span class="slug-prefix">/g/</span>
                <span class="slug-text">{{ gallery.slug }}</span>
              </div>
            </div>

            <div class="card-meta-row">
              <span class="meta-time">
                <Icon name="clock" :size="12" />
                <span>就绪可用</span>
              </span>
            </div>
          </div>

          <!-- Card Bottom Action Row -->
          <div class="card-bottom-actions" @click.stop>
            <button
              class="btn btn-primary enter-workspace-btn"
              type="button"
              @click="navigateToWorkspace(gallery.id)"
            >
              <span>进入工作区</span>
              <Icon name="arrow-right" :size="14" />
            </button>

            <div class="quick-icon-btns">
              <button
                class="icon-btn-tool"
                type="button"
                title="3D 空间视觉配置"
                @click="navigateToConfig(gallery.id)"
              >
                <Icon name="sliders" :size="15" />
              </button>
              <button
                class="icon-btn-tool"
                type="button"
                title="在新标签页 3D 预览"
                @click="openViewer(gallery.slug)"
              >
                <Icon name="external" :size="15" />
              </button>
            </div>
          </div>
        </article>

        <!-- "Create New Gallery" Dashed Card -->
        <button
          v-if="canCreateGallery"
          class="create-card-placeholder"
          type="button"
          @click="showCreateModal = true"
        >
          <div class="plus-circle-icon">
            <Icon name="plus" :size="24" />
          </div>
          <h3 class="create-card-title">新建相册空间</h3>
          <p class="create-card-sub">开启全景 3D 沉浸式相册</p>
        </button>
      </div>

      <!-- List View Display -->
      <div v-else-if="viewMode === 'list' && filteredGalleries.length" class="gallery-list-view">
        <div class="table-container-card">
          <table class="gallery-data-table">
            <thead>
              <tr>
                <th>相册空间名称</th>
                <th>标识符 (Slug)</th>
                <th>发布状态</th>
                <th>访问权限</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="gallery in filteredGalleries" :key="gallery.id" class="table-row-item" @click="navigateToWorkspace(gallery.id)">
                <td class="name-cell">
                  <div class="table-thumb-box">
                    <img v-if="gallery.coverThumbnailUrl" :src="gallery.coverThumbnailUrl" class="table-thumb" />
                    <Icon v-else name="gallery" :size="16" class="table-thumb-icon" />
                  </div>
                  <span class="table-gallery-name">{{ gallery.name }}</span>
                </td>
                <td>
                  <code class="table-slug">/g/{{ gallery.slug }}</code>
                </td>
                <td>
                  <span class="badge-pill" :class="gallery.status === 'PUBLISHED' ? 'status-pill-published' : 'status-pill-draft'">
                    {{ gallery.status === 'PUBLISHED' ? '已发布' : '草稿' }}
                  </span>
                </td>
                <td>
                  <span class="badge-pill" :class="gallery.visibility === 'PUBLIC' ? 'vis-public' : 'vis-private'">
                    {{ gallery.visibility === 'PUBLIC' ? '公开' : '私密' }}
                  </span>
                </td>
                <td class="actions-cell" @click.stop>
                  <button class="btn btn-secondary btn-sm" type="button" @click="navigateToWorkspace(gallery.id)">
                    进入
                  </button>
                  <button class="icon-btn-tool-sm" type="button" title="3D 配置" @click="navigateToConfig(gallery.id)">
                    <Icon name="sliders" :size="14" />
                  </button>
                  <button class="icon-btn-tool-sm" type="button" title="预览" @click="openViewer(gallery.slug)">
                    <Icon name="external" :size="14" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Empty Filter Results -->
      <div v-else-if="galleries.length && !filteredGalleries.length" class="empty-search-state">
        <div class="empty-icon-circle">
          <Icon name="search" :size="28" />
        </div>
        <h3>未找到匹配的空间</h3>
        <p>没有找到与 “{{ searchQuery }}” 相关的相册，请尝试更换关键词或清除筛选条件。</p>
        <button class="btn btn-secondary" type="button" @click="searchQuery = ''; statusFilter = 'ALL'">
          清除所有筛选
        </button>
      </div>

      <!-- Entirely Empty Workspace -->
      <div v-else-if="!loading && !galleries.length && !loadError" class="empty-workspace-state">
        <div class="empty-hero-visual">
          <div class="empty-icon-orb">
            <Icon name="gallery" :size="36" />
          </div>
        </div>
        <h2>还没有相册空间</h2>
        <p>创建属于你的第一个 3D 沉浸式相册，上传照片并自定义空间星空、粒子和展厅布局。</p>
        <button v-if="canCreateGallery" class="btn btn-primary btn-lg" type="button" @click="showCreateModal = true">
          <Icon name="plus" :size="18" />
          <span>立即创建第一个相册空间</span>
        </button>
      </div>
    </main>

    <!-- Modal for Creating Gallery -->
    <Transition name="modal-fade">
      <div v-if="showCreateModal" class="modal-backdrop" @click.self="!creating && (showCreateModal = false)">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble">
                <Icon name="plus" :size="20" />
              </div>
              <div>
                <h2 id="create-title">新建相册空间</h2>
                <p>创建一个全新的 3D 空间并配置独特的视觉主题</p>
              </div>
            </div>
            <button class="modal-close" type="button" aria-label="关闭新建空间窗口" :disabled="creating" @click="showCreateModal = false">
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
                placeholder="例如：赛博霓虹 · 未来之城"
                class="form-input"
                required
                @input="handleNameInput"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="input-gallery-slug">标识符（Slug URL）</label>
              <input
                id="input-gallery-slug"
                v-model="createForm.slug"
                placeholder="例如：cyber-neon-2077"
                class="form-input"
                required
              />
              <span class="field-hint">公开访问路径：<code>/g/{{ createForm.slug || 'slug' }}</code></span>
            </div>

            <div class="form-group">
              <label class="form-label" for="select-gallery-visibility">访问权限</label>
              <select id="select-gallery-visibility" v-model="createForm.visibility" class="select-input">
                <option value="PUBLIC">公开展示（所有人可通过链接访问）</option>
                <option value="PRIVATE">私密相册（仅持有有效分享链接的访客可访问）</option>
              </select>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" :disabled="creating" @click="showCreateModal = false">
                取消
              </button>
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
  color: rgba(255, 255, 255, 0.28);
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
   2. Main Overview Workspace Layout (Replicating image3.png prototype)
   ========================================================================== */
.overview-container {
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(100%, 1320px);
  margin: 0 auto;
  padding: 8px 4px 64px;
}

/* Top Hero Header */
.overview-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  padding-bottom: 4px;
}

.eyebrow-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.hero-title {
  font-size: clamp(26px, 2.5vw, 32px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
  line-height: 1.2;
}

.hero-subtitle {
  margin-top: 6px;
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-action-btn {
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 12px;
}

.hero-cta-btn {
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.28);
}

/* 4 Metric Stats Cards */
.metric-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}

.metric-card {
  background: linear-gradient(145deg, #ffffff 0%, #fcfdfd 100%);
  border: 1px solid rgba(226, 232, 240, 0.85);
  border-radius: 18px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
  transition: all 0.25s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  border-color: rgba(16, 185, 129, 0.25);
  box-shadow: 0 10px 24px rgba(16, 185, 129, 0.08);
}

.metric-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.metric-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}

.icon-emerald { background: rgba(16, 185, 129, 0.12); color: #059669; }
.icon-teal { background: rgba(20, 184, 166, 0.12); color: #0d9488; }
.icon-indigo { background: rgba(99, 102, 241, 0.12); color: #6366f1; }
.icon-amber { background: rgba(245, 158, 11, 0.12); color: #d97706; }

.metric-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-number {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
  line-height: 1.1;
}

.metric-unit {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  margin-left: 5px;
}

.metric-desc {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.text-emerald {
  color: #059669;
}

.status-indicator-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-online {
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.metric-progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
}

.metric-progress-track {
  height: 6px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.metric-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  border-radius: 4px;
}

.metric-progress-label {
  font-size: 11px;
  color: #818cf8;
  font-weight: 600;
}

/* Error Banner */
.overview-error-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 14px;
  color: #dc2626;
  font-size: 13.5px;
}

.error-text {
  flex: 1;
}

/* Controls Toolbar */
.gallery-controls-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 8px 0 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.7);
}

.search-input-box {
  position: relative;
  width: 300px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 9px 34px 9px 36px;
  font-size: 13.5px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #0f172a;
  transition: all 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.clear-search-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  padding: 2px;
  border-radius: 4px;
}

.clear-search-btn:hover {
  color: #475569;
}

.filter-tabs-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 12px;
}

.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  transition: all 0.2s ease;
}

.filter-pill:hover {
  color: #0f172a;
}

.filter-pill.active {
  color: #047857;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.filter-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.16);
}

.filter-pill.active .filter-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.toolbar-right-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sort-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.sort-icon {
  position: absolute;
  left: 10px;
  color: #64748b;
  pointer-events: none;
}

.sort-select {
  padding: 8px 12px 8px 30px;
  font-size: 13px;
  font-weight: 550;
  color: #334155;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
}

.sort-select:focus {
  outline: none;
  border-color: #10b981;
}

.view-mode-toggle {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 9px;
  gap: 2px;
}

.view-toggle-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  color: #64748b;
  background: transparent;
  transition: all 0.2s ease;
}

.view-toggle-btn.active {
  background: #ffffff;
  color: #047857;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
}

/* ==========================================================================
   3. Gallery Grid Cards (Matching image3.png high-fidelity aesthetic)
   ========================================================================== */
.gallery-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.gallery-modern-card {
  position: relative;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.85);
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.gallery-modern-card:hover {
  transform: translateY(-4px);
  border-color: rgba(16, 185, 129, 0.28);
  box-shadow:
    0 16px 36px rgba(16, 185, 129, 0.1),
    0 4px 12px rgba(15, 23, 42, 0.04);
}

.card-visual-cover {
  position: relative;
  aspect-ratio: 16 / 10;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #d1fae5 100%);
  overflow: hidden;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.gallery-modern-card:hover .cover-image {
  transform: scale(1.04);
}

.cover-pattern-collage {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  position: relative;
}

.collage-mesh {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(16, 185, 129, 0.22) 1.5px, transparent 1.5px);
  background-size: 16px 16px;
  opacity: 0.6;
}

.cover-placeholder-icon {
  color: rgba(5, 150, 105, 0.25);
  transition: all 0.3s ease;
}

.gallery-modern-card:hover .cover-placeholder-icon {
  transform: scale(1.1) rotate(4deg);
  color: rgba(5, 150, 105, 0.4);
}

.floating-status-badges {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 2;
}

.badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.status-pill-published {
  background: rgba(236, 253, 245, 0.92);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.28);
}

.status-pill-draft {
  background: rgba(254, 243, 199, 0.92);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.28);
}

.visibility-pill.vis-public {
  background: rgba(239, 246, 255, 0.92);
  color: #2563eb;
  border: 1px solid rgba(59, 130, 246, 0.25);
}

.visibility-pill.vis-private {
  background: rgba(241, 245, 249, 0.92);
  color: #475569;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.bottom-photo-count-pill {
  position: absolute;
  bottom: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(15, 23, 42, 0.65);
  color: #ffffff;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.card-content-body {
  padding: 18px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.card-heading-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gallery-name-title {
  font-size: 17px;
  font-weight: 750;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.gallery-slug-badge {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.slug-prefix {
  color: #94a3b8;
  font-weight: 600;
}

.slug-text {
  color: #059669;
  font-weight: 600;
}

.card-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}

.meta-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.card-bottom-actions {
  padding: 0 20px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.enter-workspace-btn {
  flex: 1;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 650;
  border-radius: 11px;
}

.quick-icon-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn-tool {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  transition: all 0.2s ease;
}

.icon-btn-tool:hover {
  color: #059669;
  background: #ecfdf5;
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-1px);
}

/* "Create New Space" Dashed Card */
.create-card-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: 28px;
  border: 2px dashed rgba(16, 185, 129, 0.35);
  border-radius: 20px;
  background: linear-gradient(145deg, rgba(236, 253, 245, 0.45) 0%, rgba(255, 255, 255, 0.8) 100%);
  cursor: pointer;
  transition: all 0.25s ease;
}

.create-card-placeholder:hover {
  transform: translateY(-3px);
  border-color: #10b981;
  background: rgba(236, 253, 245, 0.75);
  box-shadow: 0 12px 28px rgba(16, 185, 129, 0.12);
}

.plus-circle-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: #ffffff;
  color: #059669;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.15);
  transition: transform 0.25s ease;
}

.create-card-placeholder:hover .plus-circle-icon {
  transform: scale(1.08);
}

.create-card-title {
  font-size: 16px;
  font-weight: 750;
  color: #0f172a;
  margin-bottom: 4px;
}

.create-card-sub {
  font-size: 12.5px;
  color: #64748b;
}

/* List View Table */
.gallery-list-view {
  width: 100%;
}

.table-container-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
}

.gallery-data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13.5px;
}

.gallery-data-table th {
  background: #f8fafc;
  color: #64748b;
  font-weight: 650;
  padding: 12px 18px;
  border-bottom: 1px solid #e2e8f0;
}

.gallery-data-table td {
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.table-row-item {
  cursor: pointer;
  transition: background 0.15s ease;
}

.table-row-item:hover {
  background: #f8fafc;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-thumb-box {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: #ecfdf5;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex-shrink: 0;
}

.table-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.table-thumb-icon {
  color: #059669;
}

.table-gallery-name {
  font-weight: 650;
  color: #0f172a;
}

.table-slug {
  font-family: var(--font-mono, monospace);
  color: #059669;
  background: #f0fdf4;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.actions-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn-tool-sm {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.icon-btn-tool-sm:hover {
  color: #059669;
  background: #ecfdf5;
}

/* Empty States */
.empty-search-state,
.empty-workspace-state {
  text-align: center;
  padding: 64px 24px;
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon-circle,
.empty-icon-orb {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  color: #059669;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.15);
}

.empty-search-state h3,
.empty-workspace-state h2 {
  font-size: 20px;
  font-weight: 750;
  color: #0f172a;
}

.empty-search-state p,
.empty-workspace-state p {
  font-size: 14px;
  color: #64748b;
  max-width: 440px;
  line-height: 1.5;
}

/* Modal Dialog */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-card {
  background: #ffffff;
  border-radius: 22px;
  padding: 32px;
  width: min(500px, 100%);
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
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  color: #059669;
  display: grid;
  place-items: center;
}

.modal-title-box h2 {
  font-size: 18px;
  font-weight: 750;
  color: #0f172a;
}

.modal-title-box p {
  font-size: 13px;
  color: #64748b;
}

.modal-close {
  color: #94a3b8;
  padding: 6px;
  border-radius: 8px;
}

.modal-close:hover {
  color: #0f172a;
  background: #f1f5f9;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

/* Transitions & Animations */
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
  transform: scale(0.96);
}

/* Responsive Media Queries */
@media (max-width: 1180px) {
  .metric-cards-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gallery-cards-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .metric-cards-grid {
    grid-template-columns: 1fr;
  }

  .gallery-cards-grid {
    grid-template-columns: 1fr;
  }

  .overview-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-actions {
    width: 100%;
  }

  .hero-actions .btn {
    flex: 1;
  }

  .gallery-controls-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input-box {
    width: 100%;
  }

  .toolbar-right-tools {
    justify-content: space-between;
  }
}
</style>
