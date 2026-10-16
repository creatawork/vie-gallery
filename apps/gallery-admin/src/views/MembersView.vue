<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { MembershipRole, WorkspaceMember } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'
import Icon from '../components/Icon.vue'
import BrandMark from '../components/BrandMark.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import { useModalFocus } from '../composables/useModalFocus'

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
const rbacPanelRef = ref<HTMLElement | null>(null)
const { root: inviteModalRoot } = useModalFocus(showInviteModal, {
  onEscape: () => { if (!submitting.value) showInviteModal.value = false },
  disabled: submitting
})

const statusMessage = computed(() => {
  if (!isOwner.value) return '只有工作区所有者可以管理成员与指派权限。'
  if (error.value && !members.value.length) return error.value
  return ''
})

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function roleLabel(role: MembershipRole) {
  return role === 'OWNER' ? '所有者' : role === 'EDITOR' ? '编辑' : '查看者'
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function initials(member: WorkspaceMember) {
  const source = (member.displayName || member.email || '?').trim()
  if (/[\u4e00-\u9fff]/.test(source)) return source[0]
  const parts = source.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function isYou(member: WorkspaceMember) {
  const email = currentUser.value?.user?.email || currentUser.value?.email
  return !!email && member.email === email
}

function closeMenus(event?: Event) {
  const target = event?.target as HTMLElement | undefined
  if (target?.closest?.('.user-chip') || target?.closest?.('.row-menu')) return
  userMenuOpen.value = false
  rowMenuId.value = null
}

function closeMenuFromKeyboard(event: KeyboardEvent) {
  userMenuOpen.value = false
  rowMenuId.value = null
  ;(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('button')?.focus()
}

function requestMemberRemoval(member: WorkspaceMember, event: Event) {
  const container = (event.currentTarget as HTMLElement).closest('.row-menu')
  container?.querySelector<HTMLButtonElement>('button')?.focus()
  memberToRemove.value = member
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
  } catch (cause) {
    members.value = []
    error.value = cause instanceof Error ? cause.message : '成员列表加载失败，请稍后重试。'
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
      throw new Error(await readError(response, '添加成员失败，请稍后重试。'))
    }
    form.value = { email: '', role: 'EDITOR' }
    toast.success('成员已成功添加。')
    showInviteModal.value = false
    await loadMembers()
  } catch (cause) {
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
      throw new Error(await readError(response, '角色更新失败，请稍后重试。'))
    }
    member.role = role
    toast.success('成员角色已更新。')
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : '角色更新失败，请稍后重试。')
    await loadMembers()
  } finally {
    updatingId.value = ''
  }
}

async function removeMember() {
  if (updatingId.value) return
  const member = memberToRemove.value
  if (!member) return
  updatingId.value = member.id
  try {
    const response = await apiFetch(`/api/workspace/members/${member.id}`, { method: 'DELETE' })
    if (!response.ok) {
      throw new Error(await readError(response, '移除成员失败，请稍后重试。'))
    }
    toast.success('成员已移除。')
    memberToRemove.value = null
    await loadMembers()
  } catch (cause) {
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
        <BrandMark :size="28" />
        <span>阳光明媚</span>
      </RouterLink>

      <nav class="top-tabs" aria-label="主导航">
        <RouterLink to="/" class="top-tab">
          <Icon name="grid" :size="15" />
          <span>我的空间</span>
        </RouterLink>
        <RouterLink to="/members" class="top-tab is-active" aria-current="page">
          <Icon name="users" :size="15" />
          <span>成员管理</span>
        </RouterLink>
      </nav>

      <div class="user-chip" @keydown.esc.stop="closeMenuFromKeyboard">
        <button class="user-trigger" type="button" aria-label="账户菜单" :aria-expanded="userMenuOpen" @click.stop="userMenuOpen = !userMenuOpen" @keydown.esc="userMenuOpen = false">
        <span class="avatar">{{ userInitial }}</span>
        <span>{{ userDisplayName }}</span>
        <Icon name="chevron-down" :size="14" />
        </button>
        <div v-if="userMenuOpen" class="user-menu" @click.stop>
          <button type="button" @click="handleLogout">退出登录</button>
        </div>
      </div>
    </header>

    <div class="members-body">
      <section class="main-card">
        <div class="main-head">
          <div>
            <h1>成员管理</h1>
            <p>管理团队成员与角色权限</p>
          </div>
          <button v-if="isOwner" class="invite-btn" type="button" @click="showInviteModal = true">
            <Icon name="plus" :size="15" />
            <span>添加成员</span>
          </button>
        </div>

        <div v-if="statusMessage" class="alert" role="alert">
          <Icon name="lock" :size="16" />
          <span>{{ statusMessage }}</span>
          <button v-if="error" class="retry" type="button" @click="loadMembers">重试</button>
        </div>

        <div v-else-if="loading" class="empty" role="status">正在加载成员数据…</div>

        <div v-else-if="!members.length" class="empty">工作区内暂无其他成员，可以添加已注册的账户一起协作。</div>

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
                <div v-if="member.role !== 'OWNER'" class="row-menu" @keydown.esc.stop="closeMenuFromKeyboard">
                  <button type="button" :aria-label="`${member.displayName || member.email}的更多操作`" :aria-expanded="rowMenuId === member.id" @keydown.esc="rowMenuId = null" @click.stop="rowMenuId = rowMenuId === member.id ? null : member.id">
                    <Icon name="more" :size="16" />
                  </button>
                  <div v-if="rowMenuId === member.id" class="menu-pop">
                    <button type="button" :disabled="updatingId === member.id" @click="updateRole(member, 'EDITOR')">设为编辑</button>
                    <button type="button" :disabled="updatingId === member.id" @click="updateRole(member, 'VIEWER')">设为查看者</button>
                    <button type="button" class="danger" :disabled="!!updatingId" @click="requestMemberRemoval(member, $event)">移除成员</button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <p class="hint">
          <Icon name="shield" :size="14" />
          <span>通过电子邮箱添加已注册成员。对方加入后即可按角色协作。</span>
        </p>

        <section ref="rbacPanelRef" class="rbac-panel">
          <h2>权限说明</h2>
          <p>邀请时直接指定角色。只有所有者可以管理成员。</p>
          <ul>
            <li>
              <strong>所有者</strong>
              <span>管理成员、发布配置、全部相册权限</span>
            </li>
            <li>
              <strong>编辑</strong>
              <span>上传照片、修改展厅配置，不能管理成员</span>
            </li>
            <li>
              <strong>查看者</strong>
              <span>浏览相册，不能修改内容或配置</span>
            </li>
          </ul>
        </section>
      </section>
    </div>

    <Transition name="modal-fade">
      <div v-if="showInviteModal" class="modal-backdrop" @click.self="!submitting && (showInviteModal = false)">
        <div
          ref="inviteModalRoot"
          class="modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-title"
          tabindex="-1"
        >
          <div class="modal-head">
            <div>
              <h2 id="invite-title">添加成员</h2>
              <p>输入已注册账号的电子邮箱并指派角色</p>
            </div>
            <button type="button" aria-label="关闭" :disabled="submitting" @click="showInviteModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>
          <form @submit.prevent="addMember">
            <label for="invite-email">电子邮箱</label>
            <input id="invite-email" v-model="form.email" class="form-input" type="email" autocomplete="email" :disabled="submitting" placeholder="colleague@example.com" required />
            <label for="invite-role">协作角色</label>
            <select id="invite-role" v-model="form.role" class="select-input" :disabled="submitting">
              <option value="EDITOR">编辑</option>
              <option value="VIEWER">查看者</option>
            </select>
            <p v-if="error" class="alert" role="alert">{{ error }}</p>
            <div class="modal-actions">
              <button type="button" class="ghost" :disabled="submitting" @click="showInviteModal = false">取消</button>
              <button type="submit" class="invite-btn" :disabled="submitting">
                {{ submitting ? '添加中…' : '添加成员' }}
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

<style scoped src="../styles/members.css"></style>
