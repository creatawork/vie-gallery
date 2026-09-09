<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { MembershipRole, WorkspaceMember } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'

const router = useRouter()
const { isOwner, userDisplayName, userInitial, currentUser, logout } = useAuth()
const toast = useToast()
const members = ref<WorkspaceMember[]>([])
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const form = ref<{ email: string; role: MembershipRole }>({ email: '', role: 'EDITOR' })
const memberToRemove = ref<WorkspaceMember | null>(null)
const updatingId = ref('')
const showInviteModal = ref(false)
const userMenuOpen = ref(false)
const rowMenuId = ref<string | null>(null)
const usedDemo = ref(false)
const rbacPanelRef = ref<HTMLElement | null>(null)

const DEMO_MEMBERS: WorkspaceMember[] = [
  { id: 'm-owner', displayName: 'VIE Gallery', email: 'hello@viegallery.com', role: 'OWNER', joinedAt: '2024-03-12T00:00:00.000Z' },
  { id: 'm-yx', displayName: '杨晓', email: 'yx@viegallery.com', role: 'EDITOR', joinedAt: '2024-04-08T00:00:00.000Z' },
  { id: 'm-lq', displayName: '林栖', email: 'lq@viegallery.com', role: 'EDITOR', joinedAt: '2024-05-18T00:00:00.000Z' },
  { id: 'm-cz', displayName: '陈舟', email: 'cz@viegallery.com', role: 'EDITOR', joinedAt: '2024-06-21T00:00:00.000Z' }
]

const statusMessage = computed(() => {
  if (!isOwner.value) return '只有工作区所有者可以管理成员与指派权限。'
  if (error.value && !members.value.length) return error.value
  return ''
})

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function roleLabel(role: MembershipRole) {
  return role === 'OWNER' ? 'Owner' : role === 'EDITOR' ? 'Editor' : 'Viewer'
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function initials(member: WorkspaceMember) {
  if (member.email === 'hello@viegallery.com') return 'VL'
  const source = (member.displayName || member.email || '?').trim()
  if (/[\u4e00-\u9fff]/.test(source)) return source[0]
  const parts = source.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function isYou(member: WorkspaceMember) {
  const email = currentUser.value?.user?.email || currentUser.value?.email
  if (email && member.email === email) return true
  return usedDemo.value && member.role === 'OWNER'
}

function comingSoon(name: string) {
  toast.info(`${name}即将开放`)
}

function goToOverview() {
  router.push('/')
}

function scrollToRbac() {
  rbacPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function closeMenus(event?: Event) {
  const target = event?.target as HTMLElement | undefined
  if (target?.closest?.('.user-chip') || target?.closest?.('.row-menu')) return
  userMenuOpen.value = false
  rowMenuId.value = null
}

async function handleLogout() {
  await logout()
  toast.info('已安全退出登录')
  router.push('/')
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string }
  if (response.status === 401) return '登录已失效，请重新登录。'
  if (response.status === 403) return '你没有权限管理工作区成员。'
  if (response.status === 409) return body.message || '成员已存在，或该操作会移除最后一个所有者。'
  return body.message || fallback
}

function applyDemoMembers() {
  members.value = DEMO_MEMBERS
  usedDemo.value = true
  error.value = ''
}

async function loadMembers() {
  if (!isOwner.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/workspace/members')
    if (!response.ok) throw new Error(await readError(response, '成员列表加载失败，请稍后重试。'))
    members.value = await response.json() as WorkspaceMember[]
    usedDemo.value = false
  } catch (cause) {
    if (import.meta.env.DEV) {
      applyDemoMembers()
    } else {
      error.value = cause instanceof Error ? cause.message : '成员列表加载失败，请稍后重试。'
    }
  } finally {
    loading.value = false
  }
}

async function addMember() {
  if (!form.value.email.trim() || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/workspace/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.value.email.trim(), role: form.value.role })
    })
    if (!response.ok) {
      if (import.meta.env.DEV) {
        members.value = [
          ...members.value,
          {
            id: `demo-${Date.now()}`,
            displayName: form.value.email.trim().split('@')[0],
            email: form.value.email.trim(),
            role: form.value.role,
            joinedAt: new Date().toISOString()
          }
        ]
        form.value = { email: '', role: 'EDITOR' }
        showInviteModal.value = false
        toast.success('成员已成功添加。')
        return
      }
      throw new Error(await readError(response, '添加成员失败，请稍后重试。'))
    }
    form.value = { email: '', role: 'EDITOR' }
    toast.success('成员已成功添加。')
    showInviteModal.value = false
    await loadMembers()
  } catch (cause) {
    if (import.meta.env.DEV) {
      members.value = [
        ...members.value,
        {
          id: `demo-${Date.now()}`,
          displayName: form.value.email.trim().split('@')[0],
          email: form.value.email.trim(),
          role: form.value.role,
          joinedAt: new Date().toISOString()
        }
      ]
      form.value = { email: '', role: 'EDITOR' }
      showInviteModal.value = false
      toast.success('成员已成功添加。')
      return
    }
    error.value = cause instanceof Error ? cause.message : '添加成员失败，请稍后重试。'
    toast.error(error.value)
  } finally {
    submitting.value = false
  }
}

async function updateRole(member: WorkspaceMember, role: MembershipRole) {
  if (member.role === role || updatingId.value) return
  updatingId.value = member.id
  rowMenuId.value = null
  try {
    const response = await apiFetch(`/api/workspace/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    })
    if (!response.ok) {
      if (import.meta.env.DEV) {
        member.role = role
        toast.success('成员角色已更新。')
        return
      }
      throw new Error(await readError(response, '角色更新失败，请稍后重试。'))
    }
    member.role = role
    toast.success('成员角色已更新。')
  } catch (cause) {
    if (import.meta.env.DEV) {
      member.role = role
      toast.success('成员角色已更新。')
      return
    }
    toast.error(cause instanceof Error ? cause.message : '角色更新失败，请稍后重试。')
    await loadMembers()
  } finally {
    updatingId.value = ''
  }
}

async function removeMember() {
  const member = memberToRemove.value
  if (!member) return
  updatingId.value = member.id
  try {
    const response = await apiFetch(`/api/workspace/members/${member.id}`, { method: 'DELETE' })
    if (!response.ok) {
      if (import.meta.env.DEV) {
        members.value = members.value.filter(item => item.id !== member.id)
        toast.success('成员已移除。')
        memberToRemove.value = null
        return
      }
      throw new Error(await readError(response, '移除成员失败，请稍后重试。'))
    }
    toast.success('成员已移除。')
    memberToRemove.value = null
    await loadMembers()
  } catch (cause) {
    if (import.meta.env.DEV) {
      members.value = members.value.filter(item => item.id !== member.id)
      toast.success('成员已移除。')
      memberToRemove.value = null
      return
    }
    toast.error(cause instanceof Error ? cause.message : '移除成员失败，请稍后重试。')
  } finally {
    updatingId.value = ''
  }
}

onMounted(() => {
  loadMembers()
  window.addEventListener('click', closeMenus)
})

onUnmounted(() => {
  window.removeEventListener('click', closeMenus)
})
</script>

<template>
  <div class="members-page">
    <div class="members-scene" aria-hidden="true"></div>

    <header class="members-nav">
      <RouterLink to="/" class="brand">
        <span class="fold-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M6 9.2 16 4l10 5.2v6.1L16 21.6 6 15.3V9.2Z" fill="#12B981" />
            <path d="M16 4v17.6l10-6.3V9.2L16 4Z" fill="#059669" />
            <path d="M6 15.3 16 21.6 26 15.3 16 28 6 15.3Z" fill="#047857" />
          </svg>
        </span>
        <span>VIE Gallery</span>
      </RouterLink>

      <nav class="top-tabs">
        <RouterLink to="/" class="top-tab">
          <Icon name="grid" :size="15" />
          <span>概览</span>
        </RouterLink>
        <button class="top-tab" type="button" @click="comingSoon('作品')">
          <Icon name="image" :size="15" />
          <span>作品</span>
        </button>
        <button class="top-tab" type="button" @click="comingSoon('展览')">
          <Icon name="calendar" :size="15" />
          <span>展览</span>
        </button>
        <button class="top-tab" type="button" @click="comingSoon('收藏')">
          <Icon name="heart" :size="15" />
          <span>收藏</span>
        </button>
        <button class="top-tab" type="button" @click="comingSoon('设置')">
          <Icon name="settings" :size="15" />
          <span>设置</span>
        </button>
      </nav>

      <div class="user-chip" @click.stop="userMenuOpen = !userMenuOpen">
        <span class="avatar">{{ userInitial }}</span>
        <span>{{ userDisplayName }}</span>
        <Icon name="chevron-down" :size="14" />
        <div v-if="userMenuOpen" class="user-menu" @click.stop>
          <button type="button" @click="handleLogout">退出登录</button>
        </div>
      </div>
    </header>

    <div class="members-body">
      <aside class="side-card">
        <RouterLink to="/" class="home-btn" aria-label="回到概览">
          <Icon name="home" :size="16" />
        </RouterLink>

        <p class="side-label">内容管理</p>
        <button class="side-item" type="button" @click="goToOverview">
          <Icon name="image" :size="15" />
          <span>作品管理</span>
        </button>
        <button class="side-item" type="button" @click="goToOverview">
          <Icon name="calendar" :size="15" />
          <span>展览管理</span>
        </button>
        <button class="side-item" type="button" @click="comingSoon('收藏管理')">
          <Icon name="heart" :size="15" />
          <span>收藏管理</span>
        </button>

        <p class="side-label">团队管理</p>
        <span class="side-item is-active">
          <Icon name="users" :size="15" />
          <span>成员管理</span>
        </span>

        <p class="side-label">系统设置</p>
        <button class="side-item" type="button" @click="comingSoon('系统设置')">
          <Icon name="settings" :size="15" />
          <span>系统设置</span>
        </button>
        <button class="side-item" type="button" @click="scrollToRbac">
          <Icon name="shield" :size="15" />
          <span>权限与安全</span>
        </button>

        <div class="side-brand">
          <span class="fold-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M6 9.2 16 4l10 5.2v6.1L16 21.6 6 15.3V9.2Z" fill="#12B981" />
              <path d="M16 4v17.6l10-6.3V9.2L16 4Z" fill="#059669" />
              <path d="M6 15.3 16 21.6 26 15.3 16 28 6 15.3Z" fill="#047857" />
            </svg>
          </span>
          <div>
            <strong>VIE Gallery</strong>
            <small>艺术收藏 · 灵感分享</small>
          </div>
        </div>
      </aside>

      <section class="main-card">
        <div class="main-head">
          <div>
            <h1>成员管理</h1>
            <p>管理团队成员与角色权限</p>
          </div>
          <button v-if="isOwner" class="invite-btn" type="button" @click="showInviteModal = true">
            <Icon name="plus" :size="15" />
            <span>邀请成员</span>
          </button>
        </div>

        <div v-if="statusMessage" class="alert" role="alert">
          <Icon name="lock" :size="16" />
          <span>{{ statusMessage }}</span>
          <button v-if="error" class="retry" type="button" @click="loadMembers">重试</button>
        </div>

        <div v-else-if="loading" class="empty">正在加载成员数据…</div>

        <div v-else-if="!members.length" class="empty">工作区内暂无其他成员，点击右上角邀请成员加入协作。</div>

        <table v-else class="member-table">
          <thead>
            <tr>
              <th>成员</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>加入时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.id">
              <td>
                <div class="who">
                  <span class="avatar">{{ initials(member) }}</span>
                  <strong>{{ member.displayName || '未命名成员' }}</strong>
                  <em v-if="isYou(member)">您</em>
                </div>
              </td>
              <td class="email">{{ member.email }}</td>
              <td>
                <span class="role" :class="`role-${member.role.toLowerCase()}`">{{ roleLabel(member.role) }}</span>
              </td>
              <td class="date">{{ formatDate(member.joinedAt) }}</td>
              <td class="ops">
                <div v-if="member.role !== 'OWNER'" class="row-menu">
                  <button type="button" aria-label="更多操作" @click.stop="rowMenuId = rowMenuId === member.id ? null : member.id">
                    <Icon name="more" :size="16" />
                  </button>
                  <div v-if="rowMenuId === member.id" class="menu-pop">
                    <button type="button" :disabled="updatingId === member.id" @click="updateRole(member, 'EDITOR')">设为 Editor</button>
                    <button type="button" :disabled="updatingId === member.id" @click="updateRole(member, 'VIEWER')">设为 Viewer</button>
                    <button type="button" class="danger" :disabled="!!updatingId" @click="memberToRemove = member; rowMenuId = null">移除成员</button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <p class="hint">
          <Icon name="shield" :size="14" />
          <span>所有成员邀请链接的权限有效期为 7 天</span>
        </p>

        <section ref="rbacPanelRef" class="rbac-panel">
          <h2>权限与安全</h2>
          <p>工作区角色对照。邀请链接 7 天内有效，过期后需重新发送。</p>
          <ul>
            <li>
              <strong>Owner</strong>
              <span>所有者：管理成员、发布配置、全部相册权限</span>
            </li>
            <li>
              <strong>Editor</strong>
              <span>编辑：上传照片、修改展厅配置，不能管理成员</span>
            </li>
            <li>
              <strong>Viewer</strong>
              <span>查看者：浏览相册，不能修改内容或配置</span>
            </li>
          </ul>
        </section>
      </section>
    </div>

    <Transition name="modal-fade">
      <div v-if="showInviteModal" class="modal-backdrop" @click.self="!submitting && (showInviteModal = false)">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="invite-title">
          <div class="modal-head">
            <div>
              <h2 id="invite-title">邀请成员</h2>
              <p>输入成员电子邮箱并指派初始协作角色</p>
            </div>
            <button type="button" aria-label="关闭" :disabled="submitting" @click="showInviteModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>
          <form @submit.prevent="addMember">
            <label for="invite-email">电子邮箱</label>
            <input id="invite-email" v-model="form.email" type="email" placeholder="colleague@example.com" required />
            <label for="invite-role">协作角色</label>
            <select id="invite-role" v-model="form.role">
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <div class="modal-actions">
              <button type="button" class="ghost" :disabled="submitting" @click="showInviteModal = false">取消</button>
              <button type="submit" class="invite-btn" :disabled="submitting">
                {{ submitting ? '邀请中…' : '发送邀请' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <ConfirmModal
      :show="!!memberToRemove"
      title="确认移除成员"
      :message="`确定要将 ${memberToRemove?.email || '该成员'} 从当前工作区移除吗？移除后对方将失去对所有相册的访问权限。`"
      confirm-text="确认移除"
      danger
      :loading="!!updatingId"
      @confirm="removeMember"
      @cancel="memberToRemove = null"
    />
  </div>
</template>

<style scoped>
.members-page {
  position: relative;
  min-height: 100dvh;
  color: #111827;
}

.members-scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-color: #eef6f1;
  background-image: url('/overview-bg.png');
  background-size: cover;
  background-position: center;
}

.members-nav,
.members-body {
  position: relative;
  z-index: 1;
}

.members-nav {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  width: min(1280px, calc(100% - 40px));
  height: 64px;
  margin: 16px auto 0;
  padding: 0 22px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 20px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
  backdrop-filter: blur(18px);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 750;
  color: #0f766e;
}

.fold-mark svg {
  width: 28px;
  height: 28px;
}

.top-tabs {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.top-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  color: #6b7280;
  font-size: 13px;
  font-weight: 650;
  background: transparent;
}

.top-tab:hover {
  color: #0f766e;
  background: rgba(16, 185, 129, 0.08);
}

.user-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #111827;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.avatar {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #0f766e;
  color: #fff;
  font-size: 11px;
  font-weight: 750;
}

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 132px;
  padding: 6px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.user-menu button {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
}

.members-body {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 18px;
  width: min(1280px, calc(100% - 40px));
  margin: 18px auto 28px;
  align-items: start;
}

.side-card,
.main-card {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 22px;
  box-shadow: 0 12px 32px rgba(15, 40, 28, 0.06);
  backdrop-filter: blur(18px);
}

.side-card {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 130px);
  padding: 16px 14px 18px;
}

.home-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  margin-bottom: 10px;
  border-radius: 10px;
  color: #0f766e;
  background: rgba(16, 185, 129, 0.1);
}

.side-label {
  margin: 14px 8px 6px;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.side-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 12px;
  color: #6b7280;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
}

.side-item.is-active,
.side-item:hover {
  color: #0f766e;
  background: rgba(16, 185, 129, 0.12);
}

.side-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding: 12px 10px;
  border-radius: 14px;
  background: rgba(240, 253, 250, 0.9);
}

.side-brand strong {
  display: block;
  font-size: 13px;
}

.side-brand small {
  color: #9ca3af;
  font-size: 11px;
}

.main-card {
  padding: 22px 24px 20px;
}

.main-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.main-head h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.main-head p {
  margin-top: 4px;
  color: #9ca3af;
  font-size: 13px;
}

.invite-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  background: #0f766e;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.alert,
.empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px;
  color: #6b7280;
}

.retry {
  color: #0f766e;
  font-weight: 650;
}

.member-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.member-table th {
  padding: 10px 8px 12px;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 650;
  border-bottom: 1px solid #eef2f0;
}

.member-table td {
  padding: 14px 8px;
  border-bottom: 1px solid #f3f6f4;
  font-size: 13px;
  vertical-align: middle;
}

.who {
  display: flex;
  align-items: center;
  gap: 10px;
}

.who .avatar {
  width: 36px;
  height: 36px;
}

.who em {
  padding: 1px 7px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 11px;
  font-style: normal;
  font-weight: 650;
}

.email,
.date {
  color: #6b7280;
}

.role {
  display: inline-flex;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.role-owner {
  background: #ecfdf5;
  color: #047857;
}

.role-editor {
  background: #e6f7f3;
  color: #0f766e;
}

.role-viewer {
  background: #f3f4f6;
  color: #6b7280;
}

.ops {
  text-align: right;
}

.row-menu {
  position: relative;
  display: inline-block;
}

.row-menu > button {
  width: 32px;
  height: 32px;
  color: #9ca3af;
}

.menu-pop {
  position: absolute;
  top: 34px;
  right: 0;
  z-index: 3;
  min-width: 132px;
  padding: 6px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.menu-pop button {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  font-size: 12px;
}

.menu-pop .danger {
  color: #dc2626;
}

.hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: #0f766e;
  font-size: 12px;
}

.rbac-panel {
  margin-top: 22px;
  padding: 16px 16px 14px;
  border-radius: 16px;
  background: #ecfdf5;
  border: 1px solid #d1fae5;
}

.rbac-panel h2 {
  font-size: 14px;
  font-weight: 750;
  color: #065f46;
}

.rbac-panel p {
  margin: 4px 0 12px;
  color: #6b7280;
  font-size: 12px;
}

.rbac-panel ul {
  display: grid;
  gap: 8px;
}

.rbac-panel li {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
}

.rbac-panel strong {
  color: #047857;
  font-size: 12px;
}

.rbac-panel span {
  color: #4b5563;
  font-size: 12px;
  line-height: 1.5;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.35);
}

.modal-card {
  width: min(440px, calc(100% - 32px));
  padding: 22px;
  background: #fff;
  border-radius: 18px;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-card label {
  display: block;
  margin: 12px 0 6px;
  color: #6b7280;
  font-size: 12px;
}

.modal-card input,
.modal-card select {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.ghost {
  height: 38px;
  padding: 0 14px;
  color: #6b7280;
}

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }

@media (max-width: 960px) {
  .members-body {
    grid-template-columns: 1fr;
  }
  .side-card {
    min-height: auto;
  }
  .top-tabs span {
    display: none;
  }
}
</style>
