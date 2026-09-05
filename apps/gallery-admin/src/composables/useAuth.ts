import { ref, computed } from 'vue'
import { apiFetch } from '../api'

export interface User {
  id?: string
  email?: string
  displayName?: string
  role?: string
}

export interface Tenant {
  id?: string
  name?: string
  slug?: string
}

export interface AuthState {
  user?: User
  tenant?: Tenant
  displayName?: string
}

const currentUser = ref<AuthState | null>(null)
const loading = ref(false)

export function useAuth() {
  const isAuthenticated = computed(() => !!currentUser.value)
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
        currentUser.value = await res.json()
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
    currentUser.value = user
  }

  return {
    currentUser,
    loading,
    isAuthenticated,
    userDisplayName,
    tenantName,
    userInitial,
    checkAuth,
    logout,
    setUser
  }
}
