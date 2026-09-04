<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

// 用户与鉴权状态
const currentUser = ref<any>(null)
const authMode = ref<'login' | 'register'>('register')
const authForm = ref({
  email: 'tester@example.com',
  password: 'Password123456',
  displayName: 'Admin Tester'
})
const authLoading = ref(false)
const authError = ref('')

// 空间与照片状态
const galleries = ref<Gallery[]>([])
const loading = ref(false)
const selectedGalleryId = ref<string | null>(null)
const photos = ref<any[]>([])
const uploading = ref(false)
const shareUrl = ref<string | null>(null)

// 新建空间表单
const showCreateModal = ref(false)
const createForm = ref({
  name: '',
  slug: '',
  visibility: 'PUBLIC'
})
const creating = ref(false)
const createError = ref('')

const selectedGallery = computed(() =>
  galleries.value.find(g => g.id === selectedGalleryId.value) || null
)

// 检查登录状态
async function checkAuth() {
  try {
    const res = await apiFetch('/api/me')
    if (res.ok) {
      currentUser.value = await res.json()
      await loadGalleries()
    } else {
      currentUser.value = null
    }
  } catch (e) {
    currentUser.value = null
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
      return
    }

    currentUser.value = await res.json()
    await loadGalleries()
  } catch (e: any) {
    authError.value = e.message || '网络连接异常'
  } finally {
    authLoading.value = false
  }
}

async function handleLogout() {
  await apiFetch('/api/auth/logout', { method: 'POST' })
  currentUser.value = null
  galleries.value = []
  photos.value = []
  selectedGalleryId.value = null
}

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
  shareUrl.value = null
  await loadPhotos(id)
}

async function loadPhotos(id: string) {
  const r = await apiFetch(`/api/galleries/${id}/photos`)
  if (r.ok) {
    photos.value = await r.json()
  }
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
      return
    }
    const newGallery = await res.json()
    showCreateModal.value = false
    createForm.value = { name: '', slug: '', visibility: 'PUBLIC' }
    await loadGalleries()
    selectGallery(newGallery.id)
  } catch (e: any) {
    createError.value = e.message || '网络请求失败'
  } finally {
    creating.value = false
  }
}

async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length || !selectedGalleryId.value) return
  uploading.value = true
  try {
    const form = new FormData()
    Array.from(input.files).forEach(f => form.append('files', f))
    const response = await apiFetch(`/api/galleries/${selectedGalleryId.value}/photos`, {
      method: 'POST',
      body: form
    })
    const result = (await response.json()) as { items?: { taskId: string }[] }
    if (response.ok && result.items) {
      for (const item of result.items) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000))
          const task = await apiFetch(`/api/photos/tasks/${item.taskId}`)
          if (!task.ok) break
          const state = (await task.json()) as { status: string }
          if (['SUCCEEDED', 'FAILED'].includes(state.status)) break
        }
      }
    }
    await loadPhotos(selectedGalleryId.value)
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function createShareLink() {
  if (!selectedGalleryId.value) return
  try {
    const res = await apiFetch(`/api/galleries/${selectedGalleryId.value}/share-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (res.ok) {
      const data = await res.json()
      const baseViewer = 'http://localhost:5174'
      const gSlug = selectedGallery.value?.slug || ''
      shareUrl.value = `${baseViewer}/g/${gSlug}?t=${data.rawToken}`
    }
  } catch (e) {
    console.error(e)
  }
}

function openViewer(slug?: string) {
  const s = slug || selectedGallery.value?.slug
  if (!s) return
  window.open(`http://localhost:5174/g/${s}`, '_blank')
}

checkAuth()
</script>

<template>
  <!-- 未登录状态：展示登录/注册框 -->
  <div v-if="!currentUser" class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-header">
        <div class="brand-badge">V</div>
        <h2>VIE Gallery 管理后台</h2>
        <p>{{ authMode === 'register' ? '创建新管理员账户以管理相册' : '登录你的管理控制台' }}</p>
      </div>

      <div class="auth-tabs">
        <button
          :class="{ active: authMode === 'register' }"
          @click="authMode = 'register'; authError = ''"
        >
          注册账户
        </button>
        <button
          :class="{ active: authMode === 'login' }"
          @click="authMode = 'login'; authError = ''"
        >
          用户登录
        </button>
      </div>

      <div v-if="authError" class="form-error">{{ authError }}</div>

      <form @submit.prevent="handleAuthSubmit">
        <div v-if="authMode === 'register'" class="form-group">
          <label>用户名称</label>
          <input
            id="auth-display-name"
            v-model="authForm.displayName"
            placeholder="例如：Admin Tester"
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label>电子邮箱</label>
          <input
            id="auth-email"
            v-model="authForm.email"
            type="email"
            placeholder="name@example.com"
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label>密码 (至少 12 位)</label>
          <input
            id="auth-password"
            v-model="authForm.password"
            type="password"
            placeholder="至少 12 个字符"
            class="form-input"
          />
        </div>

        <button
          id="btn-auth-submit"
          type="submit"
          class="primary auth-submit"
          :disabled="authLoading"
        >
          {{ authLoading ? '处理中…' : (authMode === 'register' ? '立即注册并进入' : '登录控制台') }}
        </button>
      </form>
    </div>
  </div>

  <!-- 已登录状态：展示完整空间管理视图 -->
  <div v-else>
    <header class="page-header">
      <div>
        <p class="eyebrow">
          Workspace · {{ currentUser.user?.displayName || currentUser.displayName || 'User' }}
          ({{ currentUser.tenant?.name || 'My Gallery' }})
        </p>
        <h1>照片空间</h1>
      </div>
      <div class="header-right">
        <button id="btn-logout" class="quiet logout-btn" @click="handleLogout">退出登录</button>
        <button id="btn-open-create-modal" class="primary" @click="showCreateModal = true">新建空间</button>
      </div>
    </header>

    <section class="toolbar">
      <span>{{ galleries.length }} 个空间</span>
      <button class="quiet" @click="loadGalleries">{{ loading ? '加载中…' : '刷新' }}</button>
    </section>

    <!-- 空间列表 -->
    <section class="gallery-grid" aria-live="polite">
      <article
        v-for="gallery in galleries"
        :key="gallery.id"
        class="gallery-card"
        :class="{ selected: gallery.id === selectedGalleryId }"
        @click="selectGallery(gallery.id)"
      >
        <div class="card-image"></div>
        <div class="card-body">
          <div>
            <h2>{{ gallery.name }}</h2>
            <small class="slug-tag">/g/{{ gallery.slug }}</small>
          </div>
          <span>{{ gallery.visibility }}</span>
        </div>
      </article>

      <div v-if="!loading && galleries.length === 0" class="empty-state">
        <strong>还没有照片空间</strong>
        <p>点击上方“新建空间”按钮，开始整理和分享照片。</p>
      </div>
    </section>

    <!-- 选中的空间详情与照片管理 -->
    <section v-if="selectedGallery" class="photo-panel">
      <div class="panel-header">
        <div>
          <h2>{{ selectedGallery.name }} ({{ photos.length }} 张照片)</h2>
          <p class="meta">Slug: <code>/g/{{ selectedGallery.slug }}</code> | 状态: {{ selectedGallery.visibility }}</p>
        </div>
        <div class="panel-actions">
          <label class="primary upload-btn">
            {{ uploading ? '上传处理中…' : '上传照片' }}
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              @change="uploadFiles"
              hidden
              :disabled="uploading"
            />
          </label>
        <button id="btn-share-link" class="secondary-btn" @click="createShareLink">生成分享链接</button>
        <button id="btn-open-viewer" class="secondary-btn" @click="openViewer()">在 Viewer 中浏览</button>
        </div>
      </div>

      <!-- 分享链接提示 -->
      <div v-if="shareUrl" class="share-box">
        <strong>✨ 分享链接已生成：</strong>
        <a :href="shareUrl" target="_blank">{{ shareUrl }}</a>
      </div>

      <!-- 照片网格 -->
      <div v-if="photos.length > 0" class="photo-grid">
        <article v-for="photo in photos" :key="photo.id" class="photo-card">
          <img v-if="photo.thumbnailUrl" :src="photo.thumbnailUrl" :alt="photo.title || 'Photo'" />
          <div v-else class="card-image empty-thumb"></div>
          <div class="photo-meta">
            <span>{{ photo.status }}</span>
            <small>{{ Math.round((photo.byteSize || 0) / 1024) }} KB</small>
          </div>
        </article>
      </div>
      <div v-else class="empty-photos">
        <p>相册内暂无照片，请点击“上传照片”进行添加。</p>
      </div>
    </section>

    <!-- 新建空间 Modal 弹窗 -->
    <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
      <div class="modal-card">
        <h2>新建照片空间</h2>
        <div v-if="createError" class="form-error">{{ createError }}</div>
      <form @submit.prevent="handleCreateGallery">
        <div class="form-group">
          <label>空间名称</label>
          <input
            id="input-gallery-name"
            v-model="createForm.name"
            placeholder="例如：自然风光画廊"
            class="form-input"
            autofocus
          />
        </div>
        <div class="form-group">
          <label>标识符 (Slug)</label>
          <input
            id="input-gallery-slug"
            v-model="createForm.slug"
            placeholder="例如：nature-2026"
            class="form-input"
          />
          <small>用于公开访问路径: /g/{slug}</small>
        </div>
        <div class="form-group">
          <label>可见性</label>
          <select id="select-gallery-visibility" v-model="createForm.visibility" class="form-input">
            <option value="PUBLIC">公开 (PUBLIC)</option>
            <option value="PRIVATE">私密 (PRIVATE - 需分享链接)</option>
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="quiet" @click="showCreateModal = false" :disabled="creating">取消</button>
          <button id="btn-create-submit" type="submit" class="primary" :disabled="creating">
            {{ creating ? '创建中…' : '确认创建' }}
          </button>
        </div>
      </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-wrapper {
  display: grid;
  place-items: center;
  min-height: 70vh;
}
.auth-card {
  background: #ffffff;
  border: 1px solid #e0e5df;
  border-radius: 12px;
  padding: 36px;
  width: min(440px, 92vw);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}
.auth-header {
  text-align: center;
  margin-bottom: 24px;
}
.brand-badge {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  background: #d7ed74;
  color: #1d2925;
  font-weight: 700;
  font-size: 20px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.auth-header h2 {
  margin: 0 0 6px;
  font-size: 22px;
}
.auth-header p {
  margin: 0;
  color: #6c7b72;
  font-size: 13px;
}
.auth-tabs {
  display: flex;
  background: #f0f3ef;
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 20px;
}
.auth-tabs button {
  flex: 1;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  color: #51645a;
}
.auth-tabs button.active {
  background: #ffffff;
  color: #1d2925;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.auth-submit {
  width: 100%;
  margin-top: 20px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logout-btn {
  color: #a33;
  font-size: 13px;
}
.gallery-card {
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}
.gallery-card:hover {
  transform: translateY(-2px);
  border-color: #31433d;
}
.gallery-card.selected {
  border: 2px solid #1d2925;
  box-shadow: 0 4px 12px rgba(29, 41, 37, 0.1);
}
.slug-tag {
  color: #6c7b72;
  font-size: 11px;
}
.photo-panel {
  margin-top: 36px;
  background: #ffffff;
  border: 1px solid #e0e5df;
  border-radius: 8px;
  padding: 24px;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 1px solid #edf1eb;
  padding-bottom: 16px;
}
.panel-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.panel-header .meta {
  margin: 0;
  color: #6c7b72;
  font-size: 13px;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.upload-btn {
  display: inline-block;
  cursor: pointer;
}
.secondary-btn {
  border: 1px solid #cdd6cc;
  background: #ffffff;
  color: #1d2925;
  padding: 10px 14px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 13px;
}
.secondary-btn:hover {
  background: #f5f6f3;
}
.share-box {
  margin-top: 16px;
  padding: 12px 16px;
  background: #f0f7f2;
  border: 1px solid #c4e3cb;
  border-radius: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.share-box a {
  color: #1d5930;
  font-weight: 600;
  word-break: break-all;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.photo-card {
  border: 1px solid #e0e5df;
  border-radius: 6px;
  overflow: hidden;
  background: #fafbfa;
}
.photo-card img {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  display: block;
}
.empty-thumb {
  aspect-ratio: 4/3;
  background: #eef1ec;
}
.photo-meta {
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6c7b72;
}
.empty-photos {
  text-align: center;
  padding: 40px;
  color: #8fa198;
}

/* Modal styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  z-index: 100;
}
.modal-card {
  background: #ffffff;
  border-radius: 10px;
  padding: 28px;
  width: min(440px, 90vw);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}
.modal-card h2 {
  margin: 0 0 16px;
  font-size: 20px;
}
.form-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: #31433d;
}
.form-input {
  border: 1px solid #cdd6cc;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}
.form-group small {
  font-size: 11px;
  color: #75847b;
}
.form-error {
  background: #fdf2f2;
  color: #b91c1c;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 14px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
