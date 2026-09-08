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
const showInviteModal = ref(false)

// Filter & Search
const searchQuery = ref('')
const roleFilter = ref<'ALL' | 'OWNER' | 'EDITOR' | 'VIEWER'>('ALL')

const statusMessage = computed(() => {
  if (!isOwner.value) return '只有工作区所有者可以管理成员与指派权限。'
  if (error.value) return error.value
  return ''
})

const ownerCount = computed(() => members.value.filter(m => m.role === 'OWNER').length)
const editorCount = computed(() => members.value.filter(m => m.role === 'EDITOR').length)
const viewerCount = computed(() => members.value.filter(m => m.role === 'VIEWER').length)

const filteredMembers = computed(() => {
  return members.value.filter(m => {
    if (roleFilter.value !== 'ALL' && m.role !== roleFilter.value) return false
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      const matchName = (m.displayName || '').toLowerCase().includes(q)
      const matchEmail = (m.email || '').toLowerCase().includes(q)
      return matchName || matchEmail
    }
    return true
  })
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.value.email.trim(), role: form.value.role })
    })
    if (!response.ok) throw new Error(await readError(response, '添加成员失败，请稍后重试。'))
    form.value = { email: '', role: 'EDITOR' }
    toast.success('成员已成功添加。')
    showInviteModal.value = false
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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
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
  <div class="members-management-page">
    <!-- Top Hero Header -->
    <header class="members-hero">
      <div class="hero-copy">
        <div class="eyebrow-pill">
          <Icon name="shield" :size="13" />
          <span>WORKSPACE ACCESS & RBAC</span>
        </div>
        <h1 class="hero-title">团队成员与权限管理</h1>
        <p class="hero-subtitle">管理工作区成员角色，指派空间创建、照片管理及 3D 展厅发布权限</p>
      </div>

      <div class="hero-actions">
        <button class="btn btn-secondary" type="button" :disabled="loading" title="刷新成员列表" @click="loadMembers">
          <Icon name="refresh" :size="14" :class="{ spin: loading }" />
          <span>刷新</span>
        </button>
        <button v-if="isOwner" class="btn btn-primary invite-btn" type="button" @click="showInviteModal = true">
          <Icon name="plus" :size="16" />
          <span>邀请新成员</span>
        </button>
      </div>
    </header>

    <!-- Permission Restriction Alert (if not owner) -->
    <div v-if="statusMessage" class="members-permission-alert" role="alert">
      <Icon name="lock" :size="18" />
      <span>{{ statusMessage }}</span>
      <button v-if="error" class="btn btn-secondary btn-sm" type="button" @click="loadMembers">重试</button>
    </div>

    <template v-else>
      <!-- 3 Metrics Stats Cards (Matching image4.png prototype) -->
      <section class="member-stats-grid" aria-label="成员指标概览">
        <!-- Card 1: Total Members -->
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-label">团队成员总数</span>
            <div class="stat-icon-wrap icon-emerald">
              <Icon name="users" :size="18" />
            </div>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ members.length }} <span class="stat-unit">人</span></div>
            <div class="stat-desc text-emerald">
              <span class="dot-online"></span>
              <span>工作区协作正常运行中</span>
            </div>
          </div>
        </div>

        <!-- Card 2: Owners & Editors -->
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-label">管理员与编辑者</span>
            <div class="stat-icon-wrap icon-indigo">
              <Icon name="shield" :size="18" />
            </div>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ ownerCount + editorCount }} <span class="stat-unit">人</span></div>
            <div class="stat-desc">
              <span>{{ ownerCount }} 所有者 · {{ editorCount }} 编辑者</span>
            </div>
          </div>
        </div>

        <!-- Card 3: Viewers -->
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-label">只读查看者</span>
            <div class="stat-icon-wrap icon-teal">
              <Icon name="eye" :size="18" />
            </div>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ viewerCount }} <span class="stat-unit">人</span></div>
            <div class="stat-desc">
              <span>仅具备 3D 展厅与私密链接浏览权限</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Filter & Search Toolbar -->
      <section class="member-filter-toolbar">
        <div class="search-input-wrap">
          <Icon name="search" :size="16" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索成员姓名、电子邮箱..."
          />
          <button v-if="searchQuery" class="clear-btn" type="button" @click="searchQuery = ''">
            <Icon name="x" :size="14" />
          </button>
        </div>

        <div class="role-filter-pills" role="tablist">
          <button class="role-pill" :class="{ active: roleFilter === 'ALL' }" type="button" @click="roleFilter = 'ALL'">
            <span>全部成员</span>
            <span class="pill-count">{{ members.length }}</span>
          </button>
          <button class="role-pill" :class="{ active: roleFilter === 'OWNER' }" type="button" @click="roleFilter === 'OWNER'">
            <span>所有者</span>
            <span class="pill-count">{{ ownerCount }}</span>
          </button>
          <button class="role-pill" :class="{ active: roleFilter === 'EDITOR' }" type="button" @click="roleFilter === 'EDITOR'">
            <span>编辑者</span>
            <span class="pill-count">{{ editorCount }}</span>
          </button>
          <button class="role-pill" :class="{ active: roleFilter === 'VIEWER' }" type="button" @click="roleFilter === 'VIEWER'">
            <span>查看者</span>
            <span class="pill-count">{{ viewerCount }}</span>
          </button>
        </div>
      </section>

      <!-- Members Data Table Card -->
      <section class="members-table-container">
        <div v-if="loading" class="table-loading-state" role="status">
          <Icon name="refresh" :size="24" class="spin spin-emerald" />
          <span>正在加载成员数据…</span>
        </div>

        <div v-else-if="!filteredMembers.length" class="table-empty-state">
          <div class="empty-icon-box"><Icon name="users" :size="24" /></div>
          <h3>未找到匹配成员</h3>
          <p>{{ searchQuery ? '没有找到符合搜索条件的成员' : '工作区内暂无其他成员，点击右上角邀请成员加入协作。' }}</p>
        </div>

        <table v-else class="members-table">
          <thead>
            <tr>
              <th>成员信息</th>
              <th>工作区角色</th>
              <th>加入时间</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in filteredMembers" :key="member.id" class="member-table-row">
              <td class="member-profile-cell">
                <div class="member-avatar-gradient">
                  {{ (member.displayName || member.email || '?')[0].toUpperCase() }}
                </div>
                <div class="member-text-group">
                  <span class="member-name">{{ member.displayName || '未命名成员' }}</span>
                  <span class="member-email">{{ member.email }}</span>
                </div>
              </td>

              <td>
                <div class="role-cell-group">
                  <span class="role-badge" :class="`role-${member.role.toLowerCase()}`">
                    {{ roleLabel(member.role) }}
                  </span>
                  <!-- Role switch selector for non-owners -->
                  <select
                    v-if="member.role !== 'OWNER'"
                    class="select-input role-switch-select"
                    :value="member.role"
                    :disabled="updatingId === member.id"
                    :aria-label="`修改 ${member.email} 的角色`"
                    @change="updateRole(member, ($event.target as HTMLSelectElement).value as MembershipRole)"
                  >
                    <option value="EDITOR">编辑者 (可编辑)</option>
                    <option value="VIEWER">查看者 (只读)</option>
                  </select>
                </div>
              </td>

              <td class="joined-date-cell">
                <Icon name="clock" :size="13" class="clock-icon" />
                <span>{{ formatDate(member.joinedAt) }}</span>
              </td>

              <td class="text-right">
                <button
                  v-if="member.role !== 'OWNER'"
                  class="btn btn-ghost btn-xs text-danger"
                  type="button"
                  title="移除此成员"
                  :disabled="!!updatingId"
                  @click="memberToRemove = member"
                >
                  <Icon name="trash" :size="14" />
                  <span>移除</span>
                </button>
                <span v-else class="owner-immutable-tag">所有者不可移除</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- RBAC Permissions Matrix Reference Section (Matching image4.png bottom) -->
      <section class="rbac-matrix-card" aria-labelledby="rbac-title">
        <div class="rbac-card-header">
          <div class="rbac-icon-wrap">
            <Icon name="shield" :size="18" />
          </div>
          <div>
            <h2 id="rbac-title" class="rbac-title">角色权限对照说明</h2>
            <p class="rbac-subtitle">不同角色在相册空间、3D 配置和团队管理中的功能范围</p>
          </div>
        </div>

        <div class="rbac-matrix-table-wrap">
          <table class="rbac-matrix-table">
            <thead>
              <tr>
                <th>功能权限项</th>
                <th class="col-role">工作区所有者 (Owner)</th>
                <th class="col-role">编辑者 (Editor)</th>
                <th class="col-role">查看者 (Viewer)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>创建、编辑与删除相册空间</td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="x" :size="16" class="perm-no" /></td>
              </tr>
              <tr>
                <td>上传照片素材与大图分片切片</td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="x" :size="16" class="perm-no" /></td>
              </tr>
              <tr>
                <td>3D 几何排布、星空粒子与 Bloom 滤镜配置</td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="x" :size="16" class="perm-no" /></td>
              </tr>
              <tr>
                <td>发布相册到访客端与撤回发布</td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="x" :size="16" class="perm-no" /></td>
              </tr>
              <tr>
                <td>邀请新成员与管理团队 RBAC 角色</td>
                <td><Icon name="check" :size="16" class="perm-yes" /></td>
                <td><Icon name="x" :size="16" class="perm-no" /></td>
                <td><Icon name="x" :size="16" class="perm-no" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- Invite Member Modal -->
    <Transition name="modal-fade">
      <div v-if="showInviteModal" class="modal-backdrop" @click.self="!submitting && (showInviteModal = false)">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="invite-title">
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble">
                <Icon name="users" :size="20" />
              </div>
              <div>
                <h2 id="invite-title">邀请工作区成员</h2>
                <p>输入成员电子邮箱并指派初始协作角色</p>
              </div>
            </div>
            <button class="modal-close" type="button" aria-label="关闭邀请窗口" :disabled="submitting" @click="showInviteModal = false">
              <Icon name="x" :size="18" />
            </button>
          </div>

          <form @submit.prevent="addMember">
            <div class="form-group">
              <label class="form-label" for="invite-email">电子邮箱</label>
              <input
                id="invite-email"
                v-model="form.email"
                type="email"
                class="form-input"
                placeholder="colleague@example.com"
                required
              />
              <span class="field-hint">注意：该邮箱须为已在系统注册的账号。</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="invite-role">协作角色</label>
              <select id="invite-role" v-model="form.role" class="select-input">
                <option value="EDITOR">编辑者 (可上传照片、编辑 3D 配置并发布空间)</option>
                <option value="VIEWER">查看者 (仅具备 3D 展厅与私密链接浏览权限)</option>
              </select>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" :disabled="submitting" @click="showInviteModal = false">
                取消
              </button>
              <button id="btn-invite-submit" type="submit" class="btn btn-primary" :disabled="submitting">
                <Icon v-if="submitting" name="refresh" :size="16" class="spin" />
                <span>{{ submitting ? '邀请中…' : '发送邀请' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- Remove Member Modal -->
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
.members-management-page {
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(100%, 1280px);
  margin: 0 auto;
  padding: 8px 4px 64px;
}

/* Hero Header */
.members-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  padding-bottom: 4px;
}

.eyebrow-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  margin-bottom: 8px;
}

.hero-title {
  font-size: clamp(24px, 2.5vw, 30px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
}

.hero-subtitle {
  margin-top: 6px;
  font-size: 14px;
  color: #64748b;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.invite-btn {
  padding: 9px 18px;
  font-weight: 700;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.25);
}

/* Permission Alert */
.members-permission-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 14px;
  color: #dc2626;
  font-size: 14px;
}

/* 3 Stats Cards */
.member-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.stat-card {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.85);
  border-radius: 18px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
}

.stat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.stat-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}

.icon-emerald { background: rgba(16, 185, 129, 0.12); color: #059669; }
.icon-indigo { background: rgba(99, 102, 241, 0.12); color: #6366f1; }
.icon-teal { background: rgba(20, 184, 166, 0.12); color: #0d9488; }

.stat-value {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
}

.stat-unit {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  margin-left: 4px;
}

.stat-desc {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.text-emerald {
  color: #059669;
}

.dot-online {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
}

/* Filter Toolbar */
.member-filter-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding-bottom: 4px;
}

.search-input-wrap {
  position: relative;
  width: 320px;
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
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  font-size: 13.5px;
}

.search-input:focus {
  outline: none;
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.role-filter-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 12px;
}

.role-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  transition: all 0.2s ease;
}

.role-pill.active {
  background: #ffffff;
  color: #047857;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.pill-count {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.16);
}

.role-pill.active .pill-count {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

/* Data Table */
.members-table-container {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
}

.members-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13.5px;
}

.members-table th {
  background: #f8fafc;
  color: #64748b;
  font-weight: 650;
  padding: 14px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.members-table td {
  padding: 14px 20px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  vertical-align: middle;
}

.member-table-row:hover {
  background: #fbfdfc;
}

.member-profile-cell {
  display: flex;
  align-items: center;
  gap: 14px;
}

.member-avatar-gradient {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #10b981, #047857);
  color: #ffffff;
  display: grid;
  place-items: center;
  font-weight: 750;
  font-size: 15px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
  flex-shrink: 0;
}

.member-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-weight: 700;
  color: #0f172a;
}

.member-email {
  font-size: 12.5px;
  color: #64748b;
}

.role-cell-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.role-badge {
  display: inline-flex;
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 700;
}

.role-owner { background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; }
.role-editor { background: #ecfdf5; color: #047857; border: 1px solid rgba(16, 185, 129, 0.3); }
.role-viewer { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

.role-switch-select {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.joined-date-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
}

.clock-icon {
  color: #94a3b8;
}

.text-right {
  text-align: right;
}

.text-danger {
  color: #dc2626;
}

.owner-immutable-tag {
  font-size: 12px;
  color: #94a3b8;
}

.table-loading-state,
.table-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 56px 20px;
  text-align: center;
  color: #64748b;
}

.spin-emerald {
  color: #059669;
}

.empty-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #ecfdf5;
  color: #059669;
  display: grid;
  place-items: center;
}

/* RBAC Matrix Card */
.rbac-matrix-card {
  padding: 24px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rbac-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.rbac-icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #059669;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.rbac-title {
  font-size: 16px;
  font-weight: 750;
  color: #0f172a;
}

.rbac-subtitle {
  font-size: 12.5px;
  color: #64748b;
  margin-top: 2px;
}

.rbac-matrix-table-wrap {
  overflow-x: auto;
}

.rbac-matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.rbac-matrix-table th {
  background: #f8fafc;
  padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0;
  color: #475569;
  text-align: left;
}

.rbac-matrix-table th.col-role {
  text-align: center;
  width: 22%;
}

.rbac-matrix-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.rbac-matrix-table td:not(:first-child) {
  text-align: center;
}

.perm-yes { color: #10b981; }
.perm-no { color: #cbd5e1; }

/* Modal */
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
  border-radius: 20px;
  padding: 28px;
  width: min(480px, 100%);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.22);
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.modal-title-box {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon-bubble {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #ecfdf5;
  color: #059669;
  display: grid;
  place-items: center;
}

.modal-title-box h2 {
  font-size: 17px;
  font-weight: 750;
  color: #0f172a;
}

.modal-title-box p {
  font-size: 12.5px;
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

.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .member-stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
