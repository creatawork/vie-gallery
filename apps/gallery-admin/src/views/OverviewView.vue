<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import LightboxModal from '../components/LightboxModal.vue'

const router = useRouter()
const toast = useToast()
const { currentUser, setUser, logout } = useAuth()

// ==========================================
// 1. 用户与鉴权状态
// ==========================================
const authMode = ref<'login' | 'register'>('login')
const authForm = ref({
  email: 'tester@example.com',
  password: 'Password123456',
  displayName: 'Admin Tester'
})
const authLoading = ref(false)
const authError = ref('')

// ==========================================
// 2. 空间与照片状态
// ==========================================
const galleries = ref<Gallery[]>([])
const loading = ref(false)
const selectedGalleryId = ref<string | null>(null)
const photos = ref<any[]>([])
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const isDragOver = ref(false)

// Lightbox state
const showLightbox = ref(false)
const lightboxIndex = ref(0)

// Confirm photo delete
const photoToDelete = ref<any | null>(null)
const deletingPhoto = ref(false)

// ==========================================
// 3. 新建空间表单
// ==========================================
const showCreateModal = ref(false)
const createForm = ref({
  name: '',
  slug: '',
  visibility: 'PUBLIC'
})
const creating = ref(false)
const createError = ref('')

// ==========================================
// 4. 分享链接 Modal
// ==========================================
const showShareModal = ref(false)
const shareLinkData = ref<{ shareUrl: string; expiresAt?: string } | null>(null)
const generatingShare = ref(false)
const copied = ref(false)

const selectedGallery = computed(() =>
  galleries.value.find(g => g.id === selectedGalleryId.value) || null
)

// ==========================================
// 5. 鉴权与生命周期
// ==========================================
async function checkAuth() {
  try {
    const res = await apiFetch('/api/me')
    if (res.ok) {
      const data = await res.json()
      setUser(data)
      await loadGalleries()
    } else {
      setUser(null)
    }
  } catch (e) {
    setUser(null)
  }
}

async function handleAuthSubmit() {
  authLoading.value = true
  authError.value = ''
  try {
    const url = authMode.value === 'register' ? '/api/auth/register' : '/api/auth/login'
    const body: any = {
      email: authForm.value.email.trim(),
      password: authForm.value.password
    }
    if (authMode.value === 'register') {
      body.displayName = authForm.value.displayName.trim()
    }

    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      authError.value = err.message || (authMode.value === 'register' ? '注册失败' : '登录失败')
      toast.error(authError.value)
      return
    }

    const data = await res.json()
    setUser(data)
    toast.success(authMode.value === 'register' ? '注册成功，欢迎进入！' : '登录成功')
    await loadGalleries()
  } catch (e: any) {
    authError.value = e.message || '网络连接异常'
    toast.error(authError.value)
  } finally {
    authLoading.value = false
  }
}

async function handleLogout() {
  await logout()
  galleries.value = []
  photos.value = []
  selectedGalleryId.value = null
  toast.info('已安全退出登录')
}

// ==========================================
// 6. 相册空间管理
// ==========================================
async function loadGalleries() {
  loading.value = true
  try {
    const response = await apiFetch('/api/galleries')
    if (response.ok) {
      galleries.value = (await response.json()) as Gallery[]
      if (galleries.value.length > 0 && !selectedGalleryId.value) {
        selectGallery(galleries.value[0].id)
      }
    }
  } finally {
    loading.value = false
  }
}

async function selectGallery(id: string) {
  selectedGalleryId.value = id
  await loadPhotos(id)
}

async function loadPhotos(id: string) {
  const r = await apiFetch(`/api/galleries/${id}/photos`)
  if (r.ok) {
    photos.value = await r.json()
  }
}

function handleNameInput() {
  // 自动生成 slug
  if (!createForm.value.slug || createForm.value.slug === slugify(createForm.value.name.slice(0, -1))) {
    createForm.value.slug = slugify(createForm.value.name)
  }
}

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
}

async function handleCreateGallery() {
  if (!createForm.value.name.trim() || !createForm.value.slug.trim()) {
    createError.value = '请填写空间名称和标识符 (Slug)'
    return
  }
  creating.value = true
  createError.value = ''
  try {
    const res = await apiFetch('/api/galleries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createForm.value.name.trim(),
        slug: createForm.value.slug.trim(),
        visibility: createForm.value.visibility
      })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      createError.value = err.message || '创建空间失败'
      toast.error(createError.value)
      return
    }
    const newGallery = await res.json()
    showCreateModal.value = false
    createForm.value = { name: '', slug: '', visibility: 'PUBLIC' }
    toast.success(`空间 “${newGallery.name}” 创建成功！`)
    await loadGalleries()
    selectGallery(newGallery.id)
  } catch (e: any) {
    createError.value = e.message || '网络请求失败'
  } finally {
    creating.value = false
  }
}

// ==========================================
// 7. 照片上传 (支持拖拽 & 任务轮询)
// ==========================================
async function handleDrop(e: DragEvent) {
  isDragOver.value = false
  if (!e.dataTransfer?.files?.length || !selectedGalleryId.value) return
  await processUploadFiles(e.dataTransfer.files)
}

async function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !selectedGalleryId.value) return
  await processUploadFiles(input.files)
  input.value = ''
}

async function processUploadFiles(files: FileList) {
  if (!selectedGalleryId.value) return
  uploading.value = true
  uploadProgress.value = 10
  uploadStatusText.value = `正在上传 ${files.length} 张照片...`

  try {
    const form = new FormData()
    Array.from(files).forEach(f => form.append('files', f))
    
    const response = await apiFetch(`/api/galleries/${selectedGalleryId.value}/photos`, {
      method: 'POST',
      body: form
    })
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      toast.error(err.message || '照片上传失败')
      return
    }

    const result = (await response.json()) as { items?: { taskId: string }[] }
    uploadProgress.value = 40
    uploadStatusText.value = '服务器正在处理并生成高保真缩略图...'

    if (result.items && result.items.length > 0) {
      const totalTasks = result.items.length
      let finished = 0
      
      for (const item of result.items) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 800))
          const task = await apiFetch(`/api/photos/tasks/${item.taskId}`)
          if (!task.ok) break
          const state = (await task.json()) as { status: string }
          if (['SUCCEEDED', 'FAILED'].includes(state.status)) {
            finished++
            uploadProgress.value = 40 + Math.round((finished / totalTasks) * 55)
            break
          }
        }
      }
    }

    uploadProgress.value = 100
    toast.success(`成功上传并处理 ${files.length} 张照片！`)
    await loadPhotos(selectedGalleryId.value)
  } catch (err: any) {
    toast.error(err.message || '上传异常')
  } finally {
    setTimeout(() => {
      uploading.value = false
      uploadProgress.value = 0
      uploadStatusText.value = ''
    }, 600)
  }
}

// ==========================================
// 8. 照片操作 (封面 / 删除 / Lightbox)
// ==========================================
function openLightbox(index: number) {
  lightboxIndex.value = index
  showLightbox.value = true
}

async function handleSetCover(photo: any) {
  try {
    const res = await apiFetch(`/api/photos/${photo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover: true })
    })
    if (res.ok) {
      toast.success('已设为相册封面！')
      if (selectedGalleryId.value) {
        await loadPhotos(selectedGalleryId.value)
      }
    } else {
      toast.error('设置封面失败')
    }
  } catch (e: any) {
    toast.error(e.message || '网络请求失败')
  }
}

function promptDeletePhoto(photo: any) {
  photoToDelete.value = photo
}

async function confirmDeletePhoto() {
  if (!photoToDelete.value) return
  deletingPhoto.value = true
  try {
    const res = await apiFetch(`/api/photos/${photoToDelete.value.id}`, {
      method: 'DELETE'
    })
    if (res.ok) {
      toast.success('照片已成功删除')
      if (showLightbox.value) {
        showLightbox.value = false
      }
      if (selectedGalleryId.value) {
        await loadPhotos(selectedGalleryId.value)
      }
    } else {
      toast.error('删除照片失败')
    }
  } catch (e: any) {
    toast.error(e.message || '网络请求失败')
  } finally {
    deletingPhoto.value = false
    photoToDelete.value = null
  }
}

// ==========================================
// 9. 分享链接与外部跳转
// ==========================================
async function openShareModal() {
  if (!selectedGalleryId.value) return
  generatingShare.value = true
  showShareModal.value = true
  copied.value = false
  try {
    const res = await apiFetch(`/api/galleries/${selectedGalleryId.value}/share-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (res.ok) {
      const data = await res.json()
      const baseViewer = `${window.location.protocol}//${window.location.hostname}:5174`
      const gSlug = selectedGallery.value?.slug || ''
      shareLinkData.value = {
        shareUrl: `${baseViewer}/g/${gSlug}?t=${data.rawToken}`,
        expiresAt: data.expiresAt
      }
    }
  } catch (e) {
    toast.error('生成分享链接失败')
  } finally {
    generatingShare.value = false
  }
}

async function copyShareUrl() {
  if (!shareLinkData.value?.shareUrl) return
  try {
    await navigator.clipboard.writeText(shareLinkData.value.shareUrl)
    copied.value = true
    toast.success('分享链接已复制到剪贴板！')
    setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch (e) {
    toast.error('复制失败，请手动选择复制')
  }
}

function openViewer(slug?: string) {
  const s = slug || selectedGallery.value?.slug
  if (!s) return
  const baseViewer = `${window.location.protocol}//${window.location.hostname}:5174`
  window.open(`${baseViewer}/g/${s}`, '_blank')
}

function goToConfig(galleryId?: string) {
  const gid = galleryId || selectedGalleryId.value
  if (!gid) return
  router.push(`/galleries/${gid}/config`)
}

checkAuth()
</script>

<template>
  <!-- 未登录状态：高端毛玻璃鉴权卡片 -->
  <div v-if="!currentUser" class="auth-wrapper">
    <div class="auth-glow"></div>
    <div class="auth-card">
      <div class="auth-header">
        <div class="brand-badge">
          <Icon name="gallery" :size="24" />
        </div>
        <h2>VIE Gallery Console</h2>
        <p>{{ authMode === 'register' ? '注册新管理员工作区，开启沉浸式相册' : '登录你的创作者管理后台' }}</p>
      </div>

      <div class="auth-tabs">
        <button
          :class="{ active: authMode === 'login' }"
          @click="authMode = 'login'; authError = ''"
        >
          账号登录
        </button>
        <button
          :class="{ active: authMode === 'register' }"
          @click="authMode = 'register'; authError = ''"
        >
          注册账户
        </button>
      </div>

      <div v-if="authError" class="form-error">
        <Icon name="alert-circle" :size="16" />
        <span>{{ authError }}</span>
      </div>

      <form @submit.prevent="handleAuthSubmit">
        <div v-if="authMode === 'register'" class="form-group">
          <label class="form-label">用户名称</label>
          <input
            id="auth-display-name"
            v-model="authForm.displayName"
            placeholder="例如：Alex Chen"
            class="form-input"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label">电子邮箱</label>
          <input
            id="auth-email"
            v-model="authForm.email"
            type="email"
            placeholder="name@example.com"
            class="form-input"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label">密码 (至少 12 位)</label>
          <input
            id="auth-password"
            v-model="authForm.password"
            type="password"
            placeholder="••••••••••••"
            class="form-input"
            required
          />
        </div>

        <button
          id="btn-auth-submit"
          type="submit"
          class="btn btn-primary auth-submit"
          :disabled="authLoading"
        >
          <Icon v-if="authLoading" name="refresh" :size="16" class="spin" />
          <span>{{ authLoading ? '认证中…' : (authMode === 'register' ? '创建并进入工作区' : '登录控制台') }}</span>
        </button>
      </form>
    </div>
  </div>

  <!-- 已登录状态：全新相册控制台工作区 -->
  <div v-else class="dashboard-root">
    <!-- Top Workspace Header -->
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">相册空间管理</h1>
        <p class="page-subtitle">管理你的全部 3D 沉浸式相册，支持高清批量上传与实时参数调优</p>
      </div>

      <div class="header-right">
        <button id="btn-open-create-modal" class="btn btn-primary" @click="showCreateModal = true">
          <Icon name="plus" :size="16" />
          <span>新建空间</span>
        </button>
      </div>
    </header>

    <!-- Stat Bar & Filter -->
    <section class="stat-toolbar">
      <div class="stat-pills">
        <div class="stat-pill">
          <Icon name="gallery" :size="16" />
          <span class="stat-label">空间总数</span>
          <span class="stat-value">{{ galleries.length }}</span>
        </div>
        <div v-if="selectedGallery" class="stat-pill active">
          <Icon name="photo" :size="16" />
          <span class="stat-label">当前相册照片</span>
          <span class="stat-value">{{ photos.length }}</span>
        </div>
      </div>

      <button class="btn btn-ghost refresh-btn" :disabled="loading" @click="loadGalleries">
        <Icon name="refresh" :size="15" :class="{ spin: loading }" />
        <span>{{ loading ? '刷新中…' : '刷新数据' }}</span>
      </button>
    </section>

    <!-- Gallery Cards Grid -->
    <section class="gallery-grid" aria-live="polite">
      <article
        v-for="gallery in galleries"
        :key="gallery.id"
        class="gallery-card"
        :class="{ selected: gallery.id === selectedGalleryId }"
        @click="selectGallery(gallery.id)"
      >
        <div class="card-visual">
          <div class="card-glow"></div>
          <div class="card-pattern">
            <Icon name="gallery" :size="36" />
          </div>
          <div class="card-top-badges">
            <span class="badge" :class="gallery.visibility === 'PUBLIC' ? 'badge-public' : 'badge-private'">
              <Icon :name="gallery.visibility === 'PUBLIC' ? 'globe' : 'lock'" :size="12" />
              <span>{{ gallery.visibility }}</span>
            </span>
          </div>
        </div>

        <div class="card-body">
          <div class="card-info">
            <h3 class="gallery-title">{{ gallery.name }}</h3>
            <div class="slug-row">
              <code class="slug-tag">/g/{{ gallery.slug }}</code>
            </div>
          </div>

          <div class="card-actions" @click.stop>
            <button class="icon-action-btn" title="3D 空间配置" @click="goToConfig(gallery.id)">
              <Icon name="sliders" :size="16" />
            </button>
            <button class="icon-action-btn" title="在 3D Viewer 中预览" @click="openViewer(gallery.slug)">
              <Icon name="external" :size="16" />
            </button>
          </div>
        </div>
      </article>

      <!-- Empty Gallery State -->
      <div v-if="!loading && galleries.length === 0" class="empty-state">
        <div class="empty-icon-box">
          <Icon name="gallery" :size="32" />
        </div>
        <h3>还没有创建照片空间</h3>
        <p>创建你的第一个相册空间，支持 3D 粒子星空、螺旋布局与无缝高保真展示。</p>
        <button class="btn btn-primary" @click="showCreateModal = true">
          <Icon name="plus" :size="16" />
          <span>立即新建空间</span>
        </button>
      </div>
    </section>

    <!-- Active Gallery Detail & Photos Panel -->
    <section v-if="selectedGallery" class="photo-management-panel">
      <div class="panel-header">
        <div class="panel-left">
          <div class="gallery-title-row">
            <h2>{{ selectedGallery.name }}</h2>
            <span class="badge" :class="selectedGallery.visibility === 'PUBLIC' ? 'badge-public' : 'badge-private'">
              <Icon :name="selectedGallery.visibility === 'PUBLIC' ? 'globe' : 'lock'" :size="12" />
              <span>{{ selectedGallery.visibility }}</span>
            </span>
          </div>
          <p class="panel-meta">
            <span>访问路由: <code>/g/{{ selectedGallery.slug }}</code></span>
            <span class="divider">·</span>
            <span>包含 {{ photos.length }} 张照片</span>
          </p>
        </div>

        <div class="panel-actions">
          <button class="btn btn-secondary" title="配置 3D 布局与粒子特效" @click="goToConfig()">
            <Icon name="sliders" :size="16" />
            <span>3D 视觉配置</span>
          </button>
          <button id="btn-share-link" class="btn btn-secondary" @click="openShareModal">
            <Icon name="share" :size="16" />
            <span>分享链接</span>
          </button>
          <button id="btn-open-viewer" class="btn btn-primary" @click="openViewer()">
            <Icon name="external" :size="16" />
            <span>3D 空间漫游</span>
          </button>
        </div>
      </div>

      <!-- Drag & Drop Upload Zone -->
      <div
        class="upload-dropzone"
        :class="{ 'drag-over': isDragOver, 'is-uploading': uploading }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
      >
        <div v-if="!uploading" class="dropzone-content">
          <div class="upload-icon-circle">
            <Icon name="upload" :size="24" />
          </div>
          <div class="dropzone-text">
            <h4>拖拽照片至此处上传，或 <label class="file-picker-link">点击选择文件<input type="file" multiple accept="image/jpeg,image/png,image/webp" hidden @change="handleFileInput" /></label></h4>
            <p>支持 JPG、PNG、WebP 高清图像 · 自动生成多尺度微距缩略图与 WebGL 3D 纹理</p>
          </div>
        </div>

        <div v-else class="upload-progress-box">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: `${uploadProgress}%` }"></div>
          </div>
          <div class="progress-status">
            <span>{{ uploadStatusText }}</span>
            <span class="progress-percentage">{{ uploadProgress }}%</span>
          </div>
        </div>
      </div>

      <!-- Photo Grid Stream -->
      <div v-if="photos.length > 0" class="photo-grid">
        <article
          v-for="(photo, idx) in photos"
          :key="photo.id"
          class="photo-card"
          @click="openLightbox(idx)"
        >
          <div class="photo-img-box">
            <img v-if="photo.thumbnailUrl" :src="photo.thumbnailUrl" :alt="photo.title || 'Photo'" loading="lazy" />
            <div v-else class="empty-thumb-pattern">
              <Icon name="photo" :size="24" />
            </div>

            <!-- Cover Badge -->
            <div v-if="photo.cover" class="photo-cover-tag">
              <Icon name="star" :size="12" />
              <span>封面</span>
            </div>

            <!-- Hover Action Overlay -->
            <div class="photo-hover-overlay" @click.stop>
              <div class="overlay-top">
                <button
                  class="photo-action-btn"
                  :title="photo.cover ? '当前相册封面' : '设为相册封面'"
                  :class="{ active: photo.cover }"
                  @click="handleSetCover(photo)"
                >
                  <Icon name="star" :size="15" />
                </button>
                <button
                  class="photo-action-btn btn-danger"
                  title="删除照片"
                  @click="promptDeletePhoto(photo)"
                >
                  <Icon name="trash" :size="15" />
                </button>
              </div>
              <div class="overlay-bottom">
                <span class="photo-size">{{ Math.round((photo.byteSize || 0) / 1024) }} KB</span>
              </div>
            </div>
          </div>

          <div class="photo-info-bar">
            <span class="photo-name">{{ photo.title || '未命名照片' }}</span>
            <span class="status-dot" :class="`dot-${photo.status?.toLowerCase()}`" :title="`状态: ${photo.status}`"></span>
          </div>
        </article>
      </div>

      <!-- Empty Photos -->
      <div v-else class="empty-photos-panel">
        <div class="empty-photo-icon">
          <Icon name="photo" :size="32" />
        </div>
        <h4>相册内暂无照片</h4>
        <p>通过上方拖拽区域或点击上传，即刻生成绚丽的 3D 照片空间。</p>
      </div>
    </section>

    <!-- Modal 1: 新建空间弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showCreateModal" class="modal-backdrop" @click.self="!creating && (showCreateModal = false)">
        <div class="modal-card">
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble">
                <Icon name="plus" :size="20" />
              </div>
              <div>
                <h3>新建照片空间</h3>
                <p>创建一个全新的相册空间并配置独特的视觉主题</p>
              </div>
            </div>
            <button class="modal-close" @click="showCreateModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>

          <div v-if="createError" class="form-error">
            <Icon name="alert-circle" :size="16" />
            <span>{{ createError }}</span>
          </div>

          <form @submit.prevent="handleCreateGallery">
            <div class="form-group">
              <label class="form-label">空间名称</label>
              <input
                id="input-gallery-name"
                v-model="createForm.name"
                placeholder="例如：自然风光与星空探索"
                class="form-input"
                autofocus
                required
                @input="handleNameInput"
              />
            </div>

            <div class="form-group">
              <label class="form-label">标识符 (Slug URL)</label>
              <input
                id="input-gallery-slug"
                v-model="createForm.slug"
                placeholder="例如：nature-cosmos"
                class="form-input"
                required
              />
              <span class="field-hint">公开访问路径: <code>/g/{{ createForm.slug || 'slug' }}</code></span>
            </div>

            <div class="form-group">
              <label class="form-label">访问权限 (Visibility)</label>
              <select id="select-gallery-visibility" v-model="createForm.visibility" class="select-input">
                <option value="PUBLIC">公开展示 (PUBLIC - 所有人可通过链接访问)</option>
                <option value="PRIVATE">私密相册 (PRIVATE - 需凭专用分享 Token 访问)</option>
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

    <!-- Modal 2: 分享链接弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showShareModal" class="modal-backdrop" @click.self="showShareModal = false">
        <div class="modal-card">
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble share-bubble">
                <Icon name="share" :size="20" />
              </div>
              <div>
                <h3>分享相册空间</h3>
                <p>生成专属的安全访问链接与他人共享</p>
              </div>
            </div>
            <button class="modal-close" @click="showShareModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>

          <div v-if="generatingShare" class="generating-box">
            <Icon name="refresh" :size="24" class="spin" />
            <p>正在生成加密分享凭证...</p>
          </div>

          <div v-else-if="shareLinkData" class="share-content">
            <div class="link-display-group">
              <input :value="shareLinkData.shareUrl" readonly class="form-input share-url-input" />
              <button class="btn btn-primary copy-btn" @click="copyShareUrl">
                <Icon :name="copied ? 'check' : 'copy'" :size="16" />
                <span>{{ copied ? '已复制' : '复制链接' }}</span>
              </button>
            </div>
            <div class="share-tips">
              <Icon name="lock" :size="14" />
              <span>任何拥有此加密链接的用户均可进入 3D 沉浸式相册浏览照片。</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Confirm Photo Delete Dialog -->
    <ConfirmModal
      :show="!!photoToDelete"
      title="删除确认"
      message="确定要永久删除这张照片吗？此操作无法恢复。"
      confirm-text="确认删除"
      :danger="true"
      :loading="deletingPhoto"
      @confirm="confirmDeletePhoto"
      @cancel="photoToDelete = null"
    />

    <!-- Fullscreen Lightbox Viewer -->
    <LightboxModal
      :show="showLightbox"
      :photos="photos"
      :current-index="lightboxIndex"
      @close="showLightbox = false"
      @select="idx => lightboxIndex = idx"
      @set-cover="handleSetCover"
      @delete="promptDeletePhoto"
    />
  </div>
</template>

<style scoped>
/* ==========================================
   1. 登录与注册毛玻璃卡片
   ========================================== */
.auth-wrapper {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 80vh;
  padding: 24px;
}

.auth-glow {
  position: absolute;
  width: 380px;
  height: 380px;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%);
  filter: blur(40px);
  z-index: 0;
  pointer-events: none;
}

.auth-card {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: var(--radius-xl);
  padding: 38px;
  width: min(450px, 100%);
  box-shadow: var(--shadow-xl);
}

.auth-header {
  text-align: center;
  margin-bottom: 24px;
}

.brand-badge {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, #10b981 0%, #047857 100%);
  color: #ffffff;
  border-radius: 14px;
  margin-bottom: 14px;
  box-shadow: 0 8px 18px rgba(16, 185, 129, 0.3);
}

.auth-header h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}

.auth-header p {
  font-size: 13.5px;
  color: var(--text-secondary);
}

.auth-tabs {
  display: flex;
  background: #f1f5f3;
  border-radius: var(--radius-md);
  padding: 4px;
  margin-bottom: 20px;
}

.auth-tabs button {
  flex: 1;
  padding: 9px 12px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.auth-tabs button.active {
  background: #ffffff;
  color: var(--brand-primary);
  box-shadow: var(--shadow-xs);
}

.form-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  margin-bottom: 16px;
}

.auth-submit {
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  font-size: 15px;
}

/* ==========================================
   2. 控制台主页面
   ========================================== */
.dashboard-root {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 8px 0;
}

.page-title {
  font-size: 26px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: #0f172a;
  margin-bottom: 4px;
}

.page-subtitle {
  font-size: 13.5px;
  color: var(--text-tertiary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Stat Toolbar */
.stat-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.7);
}

.stat-pills {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: var(--radius-full);
  font-size: 13px;
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
  backdrop-filter: blur(10px) saturate(150%);
  -webkit-backdrop-filter: blur(10px) saturate(150%);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}

.stat-pill.active {
  border-color: rgba(16, 185, 129, 0.3);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.9), rgba(209, 250, 229, 0.7));
  color: #047857;
  box-shadow: 0 2px 12px rgba(16, 185, 129, 0.12);
}

.stat-value {
  font-weight: 750;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.stat-pill.active .stat-value {
  color: #047857;
}

/* ==========================================
   3. 相册卡片网格 - 现代化清新设计
   ========================================== */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.gallery-card {
  position: relative;
  background: linear-gradient(145deg, #ffffff 0%, #fafcfb 100%);
  border: 1.5px solid rgba(16, 185, 129, 0.08);
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 
    0 4px 12px rgba(15, 23, 42, 0.04),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.gallery-card::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 20px;
  padding: 1.5px;
  background: linear-gradient(145deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.05));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
}

.gallery-card:hover {
  transform: translateY(-6px) scale(1.01);
  box-shadow: 
    0 20px 40px rgba(16, 185, 129, 0.12),
    0 8px 16px rgba(15, 23, 42, 0.06),
    0 0 0 1px rgba(16, 185, 129, 0.1) inset;
  border-color: rgba(16, 185, 129, 0.2);
}

.gallery-card:hover::before {
  opacity: 1;
}

.gallery-card.selected {
  border-color: rgba(16, 185, 129, 0.35);
  background: linear-gradient(145deg, #ecfdf5 0%, #f0fdf4 100%);
  box-shadow: 
    0 0 0 3px rgba(16, 185, 129, 0.15),
    0 12px 32px rgba(16, 185, 129, 0.18),
    0 0 0 1px rgba(16, 185, 129, 0.2) inset;
}

.card-visual {
  position: relative;
  aspect-ratio: 16/9;
  background: 
    linear-gradient(135deg, rgba(236, 253, 245, 0.6) 0%, rgba(209, 250, 229, 0.4) 100%),
    linear-gradient(45deg, #d1fae5 25%, transparent 25%, transparent 75%, #d1fae5 75%, #d1fae5),
    linear-gradient(45deg, #d1fae5 25%, transparent 25%, transparent 75%, #d1fae5 75%, #d1fae5);
  background-size: 100% 100%, 20px 20px, 20px 20px;
  background-position: 0 0, 0 0, 10px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-visual::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 50%, rgba(16, 185, 129, 0.08) 0%, transparent 60%);
  pointer-events: none;
}

.card-pattern {
  color: rgba(5, 150, 105, 0.15);
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  filter: drop-shadow(0 2px 8px rgba(16, 185, 129, 0.1));
}

.gallery-card:hover .card-pattern {
  transform: scale(1.15) rotate(5deg);
  color: rgba(16, 185, 129, 0.35);
  filter: drop-shadow(0 4px 12px rgba(16, 185, 129, 0.2));
}

.card-top-badges {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
}

.card-body {
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.95) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.gallery-title {
  font-size: 16px;
  font-weight: 650;
  color: #0f172a;
  margin-bottom: 6px;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.slug-tag {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: #059669;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.15);
  font-weight: 500;
  letter-spacing: -0.01em;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-action-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #64748b;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(226, 232, 240, 0.8);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.icon-action-btn:hover {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border-color: rgba(16, 185, 129, 0.3);
  color: #059669;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
}

/* Empty State */
.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 72px 28px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.9) 0%, rgba(250, 252, 251, 0.7) 100%);
  border: 2px dashed rgba(203, 213, 225, 0.6);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.empty-icon-box {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  color: #059669;
  display: grid;
  place-items: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.15);
}

.empty-state h3 {
  font-size: 19px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.empty-state p {
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 460px;
  margin-bottom: 24px;
  line-height: 1.6;
}

/* ==========================================
   4. 照片管理面板与拖拽上传 - 现代化设计
   ========================================== */
.photo-management-panel {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 252, 251, 0.9) 100%);
  border: 1.5px solid rgba(226, 232, 240, 0.6);
  border-radius: 24px;
  padding: 32px;
  box-shadow: 
    0 8px 24px rgba(15, 23, 42, 0.05),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  display: flex;
  flex-direction: column;
  gap: 28px;
  backdrop-filter: blur(20px) saturate(120%);
  -webkit-backdrop-filter: blur(20px) saturate(120%);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 18px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.7);
}

.gallery-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
}

.gallery-title-row h2 {
  font-size: 24px;
  font-weight: 750;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.panel-meta {
  font-size: 13.5px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-meta code {
  font-family: var(--font-mono);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.7), rgba(209, 250, 229, 0.5));
  padding: 3px 8px;
  border-radius: 6px;
  color: #047857;
  font-weight: 550;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.divider {
  opacity: 0.4;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Dropzone - 现代化拖拽上传区 */
.upload-dropzone {
  border: 2px dashed rgba(203, 213, 225, 0.6);
  border-radius: 18px;
  padding: 40px 28px;
  text-align: center;
  background: linear-gradient(135deg, rgba(250, 252, 251, 0.5) 0%, rgba(248, 250, 252, 0.3) 100%);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.upload-dropzone::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.03) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.upload-dropzone:hover::before {
  opacity: 1;
}

.upload-dropzone.drag-over {
  border-color: rgba(16, 185, 129, 0.6);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.6) 0%, rgba(209, 250, 229, 0.4) 100%);
  transform: scale(1.005);
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.08);
}

.upload-dropzone.is-uploading {
  border-style: solid;
  border-color: rgba(16, 185, 129, 0.4);
  background: linear-gradient(135deg, rgba(240, 253, 244, 0.8) 0%, rgba(236, 253, 245, 0.6) 100%);
}

.dropzone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.upload-icon-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  color: #059669;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.upload-dropzone:hover .upload-icon-circle {
  transform: scale(1.08) translateY(-2px);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.25);
}

.dropzone-text h4 {
  font-size: 15.5px;
  font-weight: 650;
  color: #0f172a;
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}

.file-picker-link {
  color: #059669;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  font-weight: 600;
  transition: color 0.2s ease;
}

.file-picker-link:hover {
  color: #047857;
}

.dropzone-text p {
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.upload-progress-box {
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-bar-track {
  height: 10px;
  background: rgba(226, 232, 240, 0.5);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(203, 213, 225, 0.3) inset;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
  position: relative;
  overflow: hidden;
}

.progress-bar-fill::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.progress-status {
  display: flex;
  justify-content: space-between;
  font-size: 13.5px;
  color: var(--text-secondary);
}

.progress-percentage {
  font-weight: 750;
  color: #047857;
  letter-spacing: -0.02em;
}

/* Photo Grid - 现代化清新设计 */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.photo-card {
  position: relative;
  border: 1.5px solid rgba(226, 232, 240, 0.6);
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(145deg, #ffffff 0%, #fafcfb 100%);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 
    0 2px 8px rgba(15, 23, 42, 0.04),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
}

.photo-card::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 16px;
  padding: 1.5px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.1));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.photo-card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 
    0 16px 32px rgba(16, 185, 129, 0.1),
    0 6px 12px rgba(15, 23, 42, 0.06),
    0 0 0 1px rgba(16, 185, 129, 0.15) inset;
  border-color: rgba(16, 185, 129, 0.3);
}

.photo-card:hover::before {
  opacity: 1;
}

.photo-img-box {
  position: relative;
  aspect-ratio: 4/3;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  overflow: hidden;
}

.photo-img-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.photo-card:hover .photo-img-box img {
  transform: scale(1.05);
}

.empty-thumb-pattern {
  display: grid;
  place-items: center;
  height: 100%;
  color: rgba(5, 150, 105, 0.3);
}

.photo-cover-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95));
  color: #ffffff;
  font-size: 11px;
  font-weight: 650;
  border-radius: 8px;
  box-shadow: 
    0 4px 12px rgba(16, 185, 129, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  z-index: 2;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.photo-hover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%);
  backdrop-filter: blur(4px) saturate(120%);
  -webkit-backdrop-filter: blur(4px) saturate(120%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 3;
}

.photo-card:hover .photo-hover-overlay {
  opacity: 1;
}

.overlay-top {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.photo-action-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.95);
  color: #475569;
  display: grid;
  place-items: center;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(226, 232, 240, 0.5);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.photo-action-btn:hover {
  background: #ffffff;
  transform: scale(1.1) translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.photo-action-btn.active {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.photo-action-btn.btn-danger:hover {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.3);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
}

.overlay-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: rgba(248, 250, 252, 0.95);
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.photo-info-bar {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.95) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.photo-name {
  font-size: 13px;
  font-weight: 550;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
  transition: all 0.2s ease;
}

.photo-card:hover .status-dot {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.7);
}

.dot-ready {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.5);
}

.dot-processing {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.5);
}

.dot-failed {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.5);
}

.empty-photos-panel {
  text-align: center;
  padding: 56px 28px;
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(145deg, rgba(250, 252, 251, 0.6) 0%, rgba(248, 250, 252, 0.3) 100%);
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.5);
}

.empty-photo-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  color: rgba(5, 150, 105, 0.55);
  display: grid;
  place-items: center;
  margin-bottom: 16px;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.1);
}

.empty-photos-panel h4 {
  font-size: 16.5px;
  font-weight: 650;
  color: var(--text-secondary);
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}

/* ==========================================
   5. 通用 Modal 弹窗 - 现代化设计
   ========================================== */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(12px) saturate(120%);
  -webkit-backdrop-filter: blur(12px) saturate(120%);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-card {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 252, 251, 0.96) 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.8);
  border-radius: 24px;
  padding: 32px;
  width: min(520px, 100%);
  box-shadow: 
    0 32px 64px -12px rgba(15, 23, 42, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.modal-title-box {
  display: flex;
  align-items: center;
  gap: 14px;
}

.modal-icon-bubble {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  color: #059669;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.18);
}

.modal-icon-bubble.share-bubble {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  color: #2563eb;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.18);
}

.modal-title-box h3 {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 3px;
  letter-spacing: -0.02em;
}

.modal-title-box p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal-close {
  color: #94a3b8;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.modal-close:hover {
  color: var(--text-primary);
  background: #f1f5f9;
}

.field-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.field-hint code {
  font-family: var(--font-mono);
  color: #065f46;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.link-display-group {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.share-url-input {
  font-family: var(--font-mono);
  font-size: 13px;
}

.share-tips {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  background: #f8fafc;
  padding: 10px 14px;
  border-radius: var(--radius-md);
}

.generating-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  gap: 12px;
  color: var(--text-secondary);
}

/* Animations */
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
</style>
