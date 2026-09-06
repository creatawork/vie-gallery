import { ref, computed } from 'vue'
import type { AuthCapabilities, Capability, MembershipRole } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

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

export function useAuth() {
  const isAuthenticated = computed(() => !!currentUser.value)
  const role = computed<MembershipRole>(() => currentUser.value?.role || 'VIEWER')
  const can = (capability: Capability) => computed(() => !!currentUser.value?.capabilities?.includes(capability))
  const isOwner = computed(() => role.value === 'OWNER')
  const isEditor = computed(() => role.value === 'EDITOR')
  const isViewer = computed(() => role.value === 'VIEWER')
  const userDisplayName = computed(() => {
    return currentUser.value?.user?.displayName || currentUser.value?.displayName || 'Creator'
  })
  const tenantName = computed(() => {
    return currentUser.value?.tenant?.name || 'Studio Space'
  })
  const userInitial = computed(() => {
    return (userDisplayName.value[0] || 'C').toUpperCase()
  })

  async function checkAuth() {
    loading.value = true
    try {
      const res = await apiFetch('/api/me')
      if (res.ok) {
        currentUser.value = normalizeAuth(await res.json())
      } else {
        currentUser.value = null
      }
    } catch {
      currentUser.value = null
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } finally {
      currentUser.value = null
    }
  }

  function setUser(user: AuthState | null) {
    currentUser.value = user ? normalizeAuth(user) : null
  }

  return {
    currentUser,
    loading,
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
    setUser
  }
}
