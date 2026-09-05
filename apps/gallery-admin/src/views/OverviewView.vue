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
const { currentUser, setUser, logout } = useAuth()

const authMode = ref<'login' | 'register'>('login')
const authForm = ref({
  email: 'tester@example.com',
  password: 'Password123456',
  displayName: 'Admin Tester'
})
const authLoading = ref(false)
const authError = ref('')

const galleries = ref<Gallery[]>([])
const loading = ref(false)
const loadError = ref('')

const showCreateModal = ref(false)
const createForm = ref({ name: '', slug: '', visibility: 'PUBLIC' })
const creating = ref(false)
const createError = ref('')

const featuredGallery = computed(() => galleries.value[0] || null)

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

async function handleLogout() {
  await logout()
  galleries.value = []
  toast.info('已安全退出登录')
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
  <div v-if="!currentUser" class="auth-wrapper">
    <div class="auth-glow"></div>
    <div class="auth-card">
      <div class="auth-header">
        <div class="brand-badge"><Icon name="gallery" :size="24" /></div>
        <h2>VIE Gallery Console</h2>
        <p>{{ authMode === 'register' ? '注册新管理员工作区，开启沉浸式相册' : '登录你的创作者管理后台' }}</p>
      </div>
      <div class="auth-tabs">
        <button :class="{ active: authMode === 'login' }" type="button" @click="authMode = 'login'; authError = ''">账号登录</button>
        <button :class="{ active: authMode === 'register' }" type="button" @click="authMode = 'register'; authError = ''">注册账户</button>
      </div>
      <div v-if="authError" class="form-error"><Icon name="alert-circle" :size="16" /><span>{{ authError }}</span></div>
      <form @submit.prevent="handleAuthSubmit">
        <div v-if="authMode === 'register'" class="form-group">
          <label class="form-label" for="auth-display-name">用户名称</label>
          <input id="auth-display-name" v-model="authForm.displayName" placeholder="例如：Alex Chen" class="form-input" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="auth-email">电子邮箱</label>
          <input id="auth-email" v-model="authForm.email" type="email" placeholder="name@example.com" class="form-input" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="auth-password">密码（至少 12 位）</label>
          <input id="auth-password" v-model="authForm.password" type="password" placeholder="••••••••••••" class="form-input" required />
        </div>
        <button id="btn-auth-submit" type="submit" class="btn btn-primary auth-submit" :disabled="authLoading">
          <Icon v-if="authLoading" name="refresh" :size="16" class="spin" />
          <span>{{ authLoading ? '认证中…' : (authMode === 'register' ? '创建并进入工作区' : '登录控制台') }}</span>
        </button>
      </form>
    </div>
  </div>

  <div v-else class="dashboard-root">
    <header class="page-header page-intro">
      <div class="header-left">
        <span class="page-eyebrow">WORKSPACE</span>
        <h1 class="page-title">相册空间</h1>
        <p class="page-subtitle">管理和编辑你的 3D 沉浸式相册</p>
      </div>
      <div class="header-right">
        <button id="btn-open-create-modal" class="btn btn-primary" type="button" @click="showCreateModal = true">
          <Icon name="plus" :size="16" /><span>新建空间</span>
        </button>
      </div>
    </header>

    <section class="stat-toolbar workspace-toolbar" aria-label="空间列表工具栏">
      <div class="workspace-filters" role="tablist" aria-label="空间筛选">
        <button class="filter-tab is-active" role="tab" aria-selected="true" type="button">
          <Icon name="gallery" :size="15" /><span>全部空间</span><strong>{{ galleries.length }}</strong>
        </button>
      </div>
      <button class="btn btn-ghost refresh-btn" type="button" :disabled="loading" @click="loadGalleries">
        <Icon name="refresh" :size="15" :class="{ spin: loading }" /><span>{{ loading ? '刷新中…' : '刷新列表' }}</span>
      </button>
    </section>

    <div v-if="loadError" class="overview-error" role="alert">
      <Icon name="alert-circle" :size="17" /><span>{{ loadError }}</span>
      <button class="btn btn-secondary" type="button" @click="loadGalleries">重试</button>
    </div>

    <section v-if="featuredGallery" class="recent-workspace" aria-labelledby="recent-workspace-title">
      <div class="recent-workspace-copy">
        <span class="section-kicker">CONTINUE CREATING</span>
        <h2 id="recent-workspace-title">继续上次工作</h2>
        <p>{{ featuredGallery.name }} · 进入空间继续上传和编辑</p>
      </div>
      <div class="recent-workspace-actions">
        <button class="btn btn-primary" type="button" @click="navigateToWorkspace(featuredGallery.id)"><Icon name="arrow-right" :size="16" /><span>继续编辑</span></button>
        <button class="btn btn-secondary" type="button" @click="openViewer(featuredGallery.slug)"><Icon name="eye" :size="16" /><span>预览空间</span></button>
      </div>
    </section>

    <section class="gallery-section" aria-labelledby="gallery-section-title">
      <div class="section-heading-row">
        <div><span class="section-kicker">YOUR SPACES</span><h2 id="gallery-section-title">我的空间</h2></div>
        <span v-if="galleries.length" class="section-count">{{ galleries.length }} 个空间</span>
      </div>
      <div class="gallery-grid" aria-live="polite">
        <article
          v-for="gallery in galleries"
          :key="gallery.id"
          class="gallery-card"
          tabindex="0"
          @click="navigateToWorkspace(gallery.id)"
          @keydown.enter="navigateToWorkspace(gallery.id)"
        >
          <div class="card-visual">
            <img v-if="gallery.coverThumbnailUrl" :src="gallery.coverThumbnailUrl" class="gallery-cover-img" :alt="gallery.name" loading="lazy" />
            <div v-else class="card-pattern"><Icon name="gallery" :size="36" /></div>
            <div class="card-glow"></div>
            <div class="card-top-badges">
              <span class="badge" :class="gallery.visibility === 'PUBLIC' ? 'badge-public' : 'badge-private'">
                <Icon :name="gallery.visibility === 'PUBLIC' ? 'globe' : 'lock'" :size="12" />
                <span>{{ gallery.visibility === 'PUBLIC' ? '公开' : '私密' }}</span>
              </span>
            </div>
          </div>
          <div class="card-body">
            <div class="card-info"><h3 class="gallery-title">{{ gallery.name }}</h3><code class="slug-tag">/g/{{ gallery.slug }}</code><p class="gallery-meta">点击进入空间管理照片</p></div>
          </div>
          <div class="card-footer" @click.stop>
            <button class="btn btn-primary card-enter-btn" type="button" @click="navigateToWorkspace(gallery.id)"><span>进入空间</span><Icon name="arrow-right" :size="15" /></button>
            <div class="card-actions">
              <button class="icon-action-btn" type="button" aria-label="配置 3D 空间" title="3D 空间配置" @click="navigateToConfig(gallery.id)"><Icon name="sliders" :size="16" /></button>
              <button class="icon-action-btn" type="button" aria-label="预览 3D 空间" title="在 3D Viewer 中预览" @click="openViewer(gallery.slug)"><Icon name="external" :size="16" /></button>
            </div>
          </div>
        </article>

        <button v-if="galleries.length" class="create-gallery-card" type="button" @click="showCreateModal = true">
          <span class="create-gallery-icon"><Icon name="plus" :size="22" /></span><strong>新建空间</strong><span>创建另一个 3D 相册空间</span>
        </button>
        <div v-if="!loading && !galleries.length && !loadError" class="empty-state">
          <div class="empty-icon-box"><Icon name="gallery" :size="32" /></div>
          <h3>还没有照片空间</h3><p>创建一个属于你的 3D 沉浸式相册，上传照片并选择你的展示风格。</p>
          <button class="btn btn-primary" type="button" @click="showCreateModal = true"><Icon name="plus" :size="16" /><span>创建第一个空间</span></button>
        </div>
      </div>
    </section>

    <Transition name="modal-fade">
      <div v-if="showCreateModal" class="modal-backdrop" @click.self="!creating && (showCreateModal = false)">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div class="modal-header-row">
            <div class="modal-title-box"><div class="modal-icon-bubble"><Icon name="plus" :size="20" /></div><div><h2 id="create-title">新建照片空间</h2><p>创建一个全新的相册空间并配置独特的视觉主题</p></div></div>
            <button class="modal-close" type="button" aria-label="关闭新建空间窗口" :disabled="creating" @click="showCreateModal = false"><Icon name="x" :size="18" /></button>
          </div>
          <div v-if="createError" class="form-error"><Icon name="alert-circle" :size="16" /><span>{{ createError }}</span></div>
          <form @submit.prevent="handleCreateGallery">
            <div class="form-group"><label class="form-label" for="input-gallery-name">空间名称</label><input id="input-gallery-name" v-model="createForm.name" placeholder="例如：自然风光与星空探索" class="form-input" required @input="handleNameInput" /></div>
            <div class="form-group"><label class="form-label" for="input-gallery-slug">标识符（Slug URL）</label><input id="input-gallery-slug" v-model="createForm.slug" placeholder="例如：nature-cosmos" class="form-input" required /><span class="field-hint">公开访问路径：<code>/g/{{ createForm.slug || 'slug' }}</code></span></div>
            <div class="form-group"><label class="form-label" for="select-gallery-visibility">访问权限</label><select id="select-gallery-visibility" v-model="createForm.visibility" class="select-input"><option value="PUBLIC">公开展示（所有人可通过链接访问）</option><option value="PRIVATE">私密相册（需凭专用分享 Token 访问）</option></select></div>
            <div class="modal-actions"><button type="button" class="btn btn-secondary" :disabled="creating" @click="showCreateModal = false">取消</button><button id="btn-create-submit" type="submit" class="btn btn-primary" :disabled="creating"><Icon v-if="creating" name="refresh" :size="16" class="spin" /><span>{{ creating ? '创建中…' : '立即创建' }}</span></button></div>
          </form>
        </div>
      </div>
    </Transition>
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

.gallery-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

.gallery-card:hover .gallery-cover-img {
  transform: scale(1.06);
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

/* ==========================================
   Workspace refresh: intentional hierarchy
   ========================================== */
.dashboard-root {
  width: min(100%, 1240px);
  margin: 0 auto;
  gap: 24px;
}

.page-intro {
  align-items: flex-end;
  padding: 14px 0 4px;
}

.page-eyebrow,
.section-kicker {
  display: block;
  margin-bottom: 8px;
  color: var(--brand-deep, #087a5c);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.page-title {
  font-size: clamp(28px, 3vw, 34px);
  letter-spacing: -0.04em;
}

.page-subtitle {
  margin-top: 7px;
  font-size: 14px;
  color: var(--text-secondary);
}

.workspace-toolbar {
  align-items: center;
  padding: 8px 0 16px;
  border-bottom-color: var(--border-subtle);
}

.workspace-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 650;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.filter-tab:hover,
.filter-tab:focus-visible {
  color: var(--brand-deep, #087a5c);
  background: var(--brand-accent-subtle);
}

.filter-tab.is-active {
  color: var(--brand-deep, #087a5c);
  background: var(--brand-accent-subtle);
  border-color: rgba(16, 185, 129, 0.2);
}

.filter-tab strong {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.8);
  font-size: 11px;
}

.refresh-btn {
  padding-inline: 8px;
  font-size: 12px;
}

.recent-workspace {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px;
  border: 1px solid rgba(16, 185, 129, 0.16);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(circle at 90% 20%, rgba(16, 185, 129, 0.14), transparent 34%),
    linear-gradient(120deg, #effaf4 0%, #ffffff 72%);
  box-shadow: var(--shadow-sm);
}

.recent-workspace-copy h2,
.section-heading-row h2 {
  color: var(--text-primary);
  font-size: 21px;
  font-weight: 750;
  letter-spacing: -0.03em;
}

.recent-workspace-copy p {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.recent-workspace-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.gallery-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-heading-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.section-heading-row .section-kicker {
  margin-bottom: 5px;
}

.section-count {
  color: var(--text-tertiary);
  font-size: 12px;
}

.gallery-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.gallery-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  background: var(--bg-surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.gallery-card:focus-visible {
  outline: 3px solid rgba(16, 185, 129, 0.26);
  outline-offset: 3px;
}

.gallery-card:hover {
  transform: translateY(-3px);
  border-color: rgba(16, 185, 129, 0.28);
  box-shadow: var(--shadow-lg);
}

.gallery-card.selected {
  border-color: rgba(16, 185, 129, 0.4);
  background: var(--bg-surface);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1), var(--shadow-md);
}

.card-visual {
  aspect-ratio: 16 / 10;
}

.card-body {
  align-items: flex-start;
  min-height: 112px;
  padding: 18px 18px 12px;
  background: var(--bg-surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.gallery-title {
  margin-bottom: 8px;
  line-height: 1.35;
}

.gallery-meta {
  margin-top: 9px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px 18px;
}

.card-enter-btn {
  flex: 1;
  min-height: 38px;
  padding: 8px 12px;
  font-size: 12.5px;
}

.card-actions {
  gap: 5px;
}

.icon-action-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  box-shadow: none;
}

.create-gallery-card {
  display: flex;
  min-height: 270px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgba(16, 185, 129, 0.34);
  border-radius: var(--radius-xl);
  color: var(--brand-deep, #087a5c);
  background: linear-gradient(145deg, rgba(236, 253, 245, 0.62), rgba(255, 255, 255, 0.8));
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.create-gallery-card:hover,
.create-gallery-card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--brand-accent);
  background: var(--brand-accent-subtle);
}

.create-gallery-card strong {
  font-size: 15px;
}

.create-gallery-card > span:last-child {
  color: var(--text-tertiary);
  font-size: 12px;
}

.create-gallery-icon {
  display: grid;
  width: 48px;
  height: 48px;
  margin-bottom: 4px;
  place-items: center;
  border: 1px solid rgba(16, 185, 129, 0.22);
  border-radius: 15px;
  background: #ffffff;
  box-shadow: var(--shadow-sm);
}

.empty-state {
  min-height: 300px;
  padding: 56px 24px;
  border: 1px dashed var(--border-strong);
  background: var(--bg-surface);
  box-shadow: none;
}

.photo-management-panel {
  scroll-margin-top: 88px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 28px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

@media (max-width: 1100px) {
  .gallery-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .dashboard-root {
    width: 100%;
    gap: 20px;
    overflow-x: hidden;
  }

  .page-intro,
  .workspace-toolbar,
  .recent-workspace,
  .section-heading-row,
  .panel-header {
    align-items: stretch;
  }

  .page-intro {
    display: block;
  }

  .header-right,
  .header-right .btn,
  .recent-workspace-actions,
  .panel-actions {
    width: 100%;
  }

  .header-right {
    margin-top: 16px;
  }

  .header-right .btn,
  .recent-workspace-actions .btn,
  .panel-actions .btn {
    width: 100%;
  }

  .workspace-toolbar,
  .recent-workspace,
  .section-heading-row {
    display: block;
  }

  .workspace-filters {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .workspace-filters::-webkit-scrollbar {
    display: none;
  }

  .refresh-btn {
    margin-top: 8px;
    padding-left: 0;
  }

  .recent-workspace {
    padding: 20px;
  }

  .recent-workspace-actions {
    display: grid;
    grid-template-columns: 1fr;
    margin-top: 18px;
  }

  .section-count {
    display: block;
    margin-top: 6px;
  }

  .gallery-grid,
  .photo-grid {
    grid-template-columns: 1fr;
  }

  .create-gallery-card {
    min-height: 180px;
  }

  .photo-management-panel {
    padding: 20px 16px;
  }

  .gallery-title-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .panel-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .panel-meta {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .panel-meta .divider {
    display: none;
  }

  .link-display-group {
    flex-direction: column;
  }

  .copy-btn {
    width: 100%;
  }

  .dropzone-text h4 {
    line-height: 1.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gallery-card,
  .create-gallery-card,
  .gallery-cover-img,
  .filter-tab,
  .icon-action-btn {
    transition: none;
  }

  .gallery-card:hover,
  .create-gallery-card:hover {
    transform: none;
  }

  .spin,
  .pulse-dot {
    animation: none;
  }
}
</style>
