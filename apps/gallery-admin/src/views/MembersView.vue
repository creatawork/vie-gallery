<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { MembershipRole, WorkspaceMember } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'

const { isOwner } = useAuth()
const toast = useToast()
const members = ref<WorkspaceMember[]>([])
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const form = ref<{ email: string; role: MembershipRole }>({ email: '', role: 'EDITOR' })
const memberToRemove = ref<WorkspaceMember | null>(null)
const updatingId = ref('')
const roles: MembershipRole[] = ['OWNER', 'EDITOR', 'VIEWER']

const statusMessage = computed(() => {
  if (!isOwner.value) return '只有工作区所有者可以管理成员。'
  if (error.value) return error.value
  return ''
})

function roleLabel(role: MembershipRole) {
  return role === 'OWNER' ? '所有者' : role === 'EDITOR' ? '编辑者' : '查看者'
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string }
  if (response.status === 401) return '登录已失效，请重新登录。'
  if (response.status === 403) return '你没有权限管理工作区成员。'
  if (response.status === 409) return body.message || '成员已存在，或该操作会移除最后一个所有者。'
  return body.message || fallback
}

async function loadMembers() {
  if (!isOwner.value) { loading.value = false; return }
  loading.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/workspace/members')
    if (!response.ok) throw new Error(await readError(response, '成员列表加载失败，请稍后重试。'))
    members.value = await response.json() as WorkspaceMember[]
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '成员列表加载失败，请稍后重试。'
  } finally { loading.value = false }
}

async function addMember() {
  if (!form.value.email.trim() || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/workspace/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.value.email.trim(), role: form.value.role })
    })
    if (!response.ok) throw new Error(await readError(response, '添加成员失败，请稍后重试。'))
    form.value = { email: '', role: 'EDITOR' }
    toast.success('成员已添加。')
    await loadMembers()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '添加成员失败，请稍后重试。'
    toast.error(error.value)
  } finally { submitting.value = false }
}

async function updateRole(member: WorkspaceMember, role: MembershipRole) {
  if (member.role === role || updatingId.value) return
  updatingId.value = member.id
  try {
    const response = await apiFetch(`/api/workspace/members/${member.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role })
    })
    if (!response.ok) throw new Error(await readError(response, '角色更新失败，请稍后重试。'))
    member.role = role
    toast.success('成员角色已更新。')
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : '角色更新失败，请稍后重试。')
    await loadMembers()
  } finally { updatingId.value = '' }
}

async function removeMember() {
  const member = memberToRemove.value
  if (!member) return
  updatingId.value = member.id
  try {
    const response = await apiFetch(`/api/workspace/members/${member.id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await readError(response, '移除成员失败，请稍后重试。'))
    toast.success('成员已移除。')
    memberToRemove.value = null
    await loadMembers()
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : '移除成员失败，请稍后重试。')
  } finally { updatingId.value = '' }
}

onMounted(loadMembers)
</script>

<template>
  <div class="members-page">
    <header class="page-header page-intro">
      <div class="header-left"><span class="page-eyebrow">WORKSPACE ACCESS</span><h1 class="page-title">成员管理</h1><p class="page-subtitle">管理默认工作区中的成员与访问角色。</p></div>
    </header>

    <div v-if="statusMessage" class="members-alert" role="alert"><Icon name="alert-circle" :size="17" /><span>{{ statusMessage }}</span><button v-if="error" class="btn btn-secondary" type="button" @click="loadMembers">重试</button></div>
    <template v-else>
      <section class="member-add-card" aria-labelledby="add-member-title">
        <div><span class="section-kicker">ADD MEMBER</span><h2 id="add-member-title">添加工作区成员</h2><p>仅支持添加已经注册的账户。</p></div>
        <form class="member-form" @submit.prevent="addMember">
          <input v-model="form.email" class="form-input" type="email" placeholder="成员邮箱" aria-label="成员邮箱" required />
          <select v-model="form.role" class="select-input" aria-label="成员角色"><option value="EDITOR">编辑者</option><option value="VIEWER">查看者</option></select>
          <button class="btn btn-primary" type="submit" :disabled="submitting"><Icon v-if="submitting" name="refresh" :size="16" class="spin" /><span>{{ submitting ? '添加中…' : '添加成员' }}</span></button>
        </form>
      </section>

      <section class="members-card" aria-labelledby="members-title">
        <div class="section-heading-row"><div><span class="section-kicker">MEMBERS</span><h2 id="members-title">工作区成员</h2></div><button class="btn btn-ghost" type="button" :disabled="loading" @click="loadMembers"><Icon name="refresh" :size="15" :class="{ spin: loading }" />刷新</button></div>
        <div v-if="loading" class="members-state" role="status"><Icon name="refresh" :size="22" class="spin" />正在加载成员…</div>
        <div v-else-if="!members.length" class="members-state"><Icon name="users" :size="28" /><h3>暂无成员</h3><p>添加一位编辑者或查看者开始协作。</p></div>
        <div v-else class="member-list">
          <div v-for="member in members" :key="member.id" class="member-row">
            <div class="member-avatar">{{ (member.displayName || member.email || '?')[0].toUpperCase() }}</div><div class="member-identity"><strong>{{ member.displayName || '未命名成员' }}</strong><span>{{ member.email }}</span><small>加入于 {{ formatDate(member.joinedAt) }}</small></div>
            <span class="role-badge" :class="`role-${member.role.toLowerCase()}`">{{ roleLabel(member.role) }}</span>
            <select v-if="member.role !== 'OWNER'" class="select-input role-select" :value="member.role" :disabled="updatingId === member.id" :aria-label="`修改 ${member.email} 的角色`" @change="updateRole(member, ($event.target as HTMLSelectElement).value as MembershipRole)"><option value="EDITOR">编辑者</option><option value="VIEWER">查看者</option></select>
            <button v-if="member.role !== 'OWNER'" class="icon-action-btn remove-btn" type="button" aria-label="移除成员" title="移除成员" :disabled="!!updatingId" @click="memberToRemove = member"><Icon name="trash" :size="16" /></button>
          </div>
        </div>
      </section>
    </template>

    <ConfirmModal :show="!!memberToRemove" title="移除成员" :message="`确定要移除 ${memberToRemove?.email || '该成员'} 吗？对方将无法继续访问此工作区。`" confirm-text="确认移除" :danger="true" :loading="!!updatingId" @confirm="removeMember" @cancel="memberToRemove = null" />
  </div>
</template>

<style scoped>
.members-page { width: min(100%, 1120px); margin: 0 auto; padding: 18px 0 56px; }
.member-add-card, .members-card { margin-top: 22px; padding: 24px; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: rgba(255,255,255,.88); box-shadow: var(--shadow-sm); }
.member-add-card { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; }
.member-add-card h2, .members-card h2 { margin-top:6px; color:var(--text-primary); font-size:20px; }
.member-add-card p { margin-top:5px; color:var(--text-secondary); font-size:13px; }
.member-form { display:flex; gap:8px; min-width:min(100%, 600px); }
.member-form .form-input { min-width:220px; flex:1; }
.member-list { margin-top:16px; border-top:1px solid var(--border-subtle); }
.member-row { display:flex; align-items:center; gap:14px; padding:16px 4px; border-bottom:1px solid var(--border-subtle); }
.member-avatar { display:grid; place-items:center; width:40px; height:40px; flex:none; border-radius:50%; color:#fff; background:linear-gradient(135deg,#10b981,#047857); font-weight:750; }
.member-identity { display:flex; min-width:0; flex:1; flex-direction:column; gap:3px; }.member-identity strong { color:var(--text-primary); }.member-identity span, .member-identity small { color:var(--text-secondary); font-size:12px; }.member-identity strong, .member-identity span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.role-badge { padding:5px 10px; border-radius:999px; font-size:12px; font-weight:700; }.role-owner { color:#047857; background:#ecfdf5; }.role-editor { color:#1d4ed8; background:#eff6ff; }.role-viewer { color:#64748b; background:#f1f5f9; }.role-select { width:110px; }.remove-btn { color:#b91c1c; }.members-state { display:flex; min-height:180px; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:var(--text-tertiary); text-align:center; }.members-state h3 { color:var(--text-secondary); }.members-state p { font-size:13px; }.members-alert { display:flex; align-items:center; gap:10px; margin-top:22px; padding:14px 16px; border:1px solid #fecaca; border-radius:var(--radius-md); color:#991b1b; background:#fff1f2; }.members-alert span { flex:1; }
@media(max-width:767px){.member-add-card{display:block}.member-form{display:grid;grid-template-columns:1fr;margin-top:18px}.member-form .form-input{min-width:0}.member-row{flex-wrap:wrap}.member-identity{width:calc(100% - 56px);flex:none}.role-badge{margin-left:54px}.role-select{margin-left:auto}.remove-btn{margin-left:0}}
</style>
