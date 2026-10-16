<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Workspace } from '@vie/gallery-contracts'
import { apiFetch } from '../api'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'

const { currentUser, tenantName, switchWorkspace } = useAuth()
const toast = useToast()
const workspaces = ref<Workspace[]>([])
const loading = ref(false)
const switching = ref(false)
const error = ref('')
const activeId = computed(() => currentUser.value?.tenant?.id || '')
const roleLabels = { OWNER: '所有者', EDITOR: '编辑', VIEWER: '查看者' }
let requestVersion = 0

async function loadWorkspaces() {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/me/workspaces')
    if (!response.ok) throw new Error('工作区列表加载失败，请重试。')
    const list = await response.json() as Workspace[]
    if (!Array.isArray(list)) throw new Error('工作区列表加载失败，请重试。')
    if (version === requestVersion) workspaces.value = list
  } catch (cause) {
    if (version === requestVersion) error.value = cause instanceof Error ? cause.message : '工作区列表加载失败，请重试。'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function selectWorkspace(event: Event) {
  const select = event.target as HTMLSelectElement
  const id = select.value
  if (switching.value || id === activeId.value) return
  switching.value = true
  error.value = ''
  try {
    await switchWorkspace(id)
    toast.success(`已切换到“${tenantName.value}”`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '切换工作区失败，请稍后重试。'
  } finally {
    select.value = activeId.value
    switching.value = false
  }
}

watch(() => currentUser.value?.user?.id, () => {
  workspaces.value = []
  void loadWorkspaces()
}, { immediate: true })
</script>

<template>
  <div class="workspace-switcher" :aria-busy="loading || switching">
    <label for="active-workspace">当前工作区</label>
    <div class="workspace-picker">
      <select id="active-workspace" :value="activeId" :disabled="loading || switching" @change="selectWorkspace">
        <option v-if="!workspaces.some(workspace => workspace.id === activeId)" :value="activeId">{{ tenantName }}</option>
        <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">
          {{ workspace.name }} · {{ roleLabels[workspace.role] }}
        </option>
      </select>
      <button type="button" :disabled="loading || switching" @click="loadWorkspaces">刷新列表</button>
    </div>
    <p v-if="switching" role="status">正在切换工作区…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else>切换工作区，查看自己创建或受邀协作的空间。</p>
  </div>
</template>

<style scoped>
.workspace-switcher { margin-top: 24px; max-width: 520px; }
label { display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 13px; }
.workspace-picker { display: flex; align-items: center; gap: 12px; }
select { min-width: 0; flex: 1; min-height: 44px; padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font: inherit; font-size: 14px; }
button { flex-shrink: 0; min-height: 44px; color: var(--brand-deep); font-size: 13px; }
p { margin-top: 8px; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
p[role="alert"] { color: var(--status-error, #943d2c); }
</style>
