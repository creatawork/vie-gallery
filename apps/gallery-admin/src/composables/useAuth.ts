import { ref, computed } from 'vue'
import type { AuthCapabilities, Capability, MembershipRole } from '@vie/gallery-contracts'
import { apiFetch, getActiveWorkspaceId, setActiveWorkspaceId } from '../api'

export interface User {
  id?: string
  email?: string
  displayName?: string
}

export interface Tenant {
  id?: string
  name?: string
  slug?: string
}

export interface AuthState extends AuthCapabilities {
  user?: User
  tenant?: Tenant
  displayName?: string
  email?: string
}

const roles: MembershipRole[] = ['OWNER', 'EDITOR', 'VIEWER']
const capabilities: Capability[] = [
  'GALLERY_READ', 'GALLERY_CREATE', 'PHOTO_READ', 'PHOTO_WRITE',
  'CONFIG_READ', 'CONFIG_WRITE', 'PUBLISH', 'SHARE_MANAGE', 'MEMBER_MANAGE'
]

function normalizeAuth(value: unknown): AuthState {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const role = roles.includes(raw.role as MembershipRole) ? raw.role as MembershipRole : 'VIEWER'
  const allowed = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter((item): item is Capability => capabilities.includes(item as Capability))
    : []
  return { ...raw, role, capabilities: [...new Set(allowed)] } as AuthState
}

const currentUser = ref<AuthState | null>(null)
const loading = ref(false)
const authChecked = ref(false)
let inflight: Promise<void> | null = null

export function useAuth() {
  const isAuthenticated = computed(() => !!currentUser.value)
  const role = computed<MembershipRole>(() => currentUser.value?.role || 'VIEWER')
  const can = (capability: Capability) => computed(() => !!currentUser.value?.capabilities?.includes(capability))
  const isOwner = computed(() => role.value === 'OWNER')
  const isEditor = computed(() => role.value === 'EDITOR')
  const isViewer = computed(() => role.value === 'VIEWER')
  const userDisplayName = computed(() => {
    return currentUser.value?.user?.displayName || currentUser.value?.displayName || '创作者'
  })
  const tenantName = computed(() => {
    return currentUser.value?.tenant?.name || '工作区'
  })
  const userInitial = computed(() => {
    return (userDisplayName.value[0] || '创').toUpperCase()
  })

  async function checkAuth(force = false) {
    if (inflight && !force) return inflight
    inflight = (async () => {
      loading.value = true
      try {
        let res = await apiFetch('/api/me')
        if (getActiveWorkspaceId() && [400, 403].includes(res.status)) {
          const error = await res.clone().json().catch(() => ({})) as { code?: string }
          if (error.code === 'AUTH_TENANT_NOT_FOUND' || error.code === 'VALIDATION_FAILED') {
            setActiveWorkspaceId(null)
            res = await apiFetch('/api/me')
          }
        }
        if (res.ok) {
          setUser(await res.json())
        } else {
          clearUser()
        }
      } catch {
        currentUser.value = null
      } finally {
        loading.value = false
        authChecked.value = true
        inflight = null
      }
    })()
    return inflight
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } finally {
      clearUser()
      authChecked.value = true
    }
  }

  function setUser(user: AuthState | null) {
    currentUser.value = user ? normalizeAuth(user) : null
    setActiveWorkspaceId(currentUser.value?.tenant?.id || null)
    authChecked.value = true
  }

  function clearUser() {
    currentUser.value = null
    setActiveWorkspaceId(null)
    authChecked.value = true
  }

  async function switchWorkspace(id: string) {
    if (id === currentUser.value?.tenant?.id) return
    const response = await apiFetch('/api/me', { headers: { 'X-Workspace-Id': id } })
    if (!response.ok) {
      throw new Error(response.status === 403 ? '你已无法访问这个工作区，请刷新工作区列表。' : '切换工作区失败，请稍后重试。')
    }
    setUser(await response.json())
  }

  return {
    currentUser,
    loading,
    authChecked,
    isAuthenticated,
    userDisplayName,
    tenantName,
    userInitial,
    role,
    can,
    isOwner,
    isEditor,
    isViewer,
    checkAuth,
    logout,
    setUser,
    switchWorkspace,
    clearUser
  }
}
