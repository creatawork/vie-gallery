<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import ToastContainer from './components/ToastContainer.vue'
import Icon from './components/Icon.vue'
import { useAuth } from './composables/useAuth'
import { useToast } from './composables/useToast'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const {
  currentUser,
  isAuthenticated,
  userDisplayName,
  tenantName,
  userInitial,
  isOwner,
  checkAuth,
  logout
} = useAuth()

const ownsOwnChrome = computed(() =>
  route.name === 'overview' ||
  route.name === 'gallery-workspace' ||
  route.name === 'gallery-config' ||
  route.name === 'members'
)
const showAppChrome = computed(() => isAuthenticated.value && !ownsOwnChrome.value)

async function handleLogout() {
  await logout()
  toast.info('已安全退出登录')
  router.push('/')
}

onMounted(() => {
  checkAuth()
})
</script>

<template>
  <div class="admin-shell">
    <ToastContainer />

    <!-- Shared chrome is hidden on login and on 我的空间, which owns its own full-bleed layout. -->
    <header v-if="showAppChrome" class="top-navbar">
      <div class="navbar-container">
        <!-- Left: Brand & Main Navigation -->
        <div class="nav-left">
          <RouterLink to="/" class="brand-link">
            <div class="brand-mark">
              <span class="mark-letter">V</span>
            </div>
            <div class="brand-text">
              <span class="brand-title">VIE Gallery</span>
              <span class="brand-badge">3D Studio</span>
            </div>
          </RouterLink>

          <div class="nav-divider"></div>

          <nav class="top-nav-links" aria-label="顶部导航">
            <RouterLink to="/" class="nav-tab" :class="{ active: route.path === '/' }">
              <Icon name="gallery" :size="16" />
              <span>相册空间</span>
            </RouterLink>
            <RouterLink v-if="isOwner" to="/members" class="nav-tab" :class="{ active: route.path === '/members' }">
              <Icon name="users" :size="16" />
              <span>成员管理</span>
            </RouterLink>
          </nav>
        </div>

        <div class="nav-right">
          <!-- Logged In User Profile Capsule -->
          <div v-if="isAuthenticated" class="user-profile-capsule">
            <div class="user-avatar-circle">
              {{ userInitial }}
            </div>
            <div class="user-details">
              <span class="user-name">{{ userDisplayName }}</span>
              <span class="user-tenant">{{ tenantName }}</span>
            </div>
            <button class="nav-logout-btn" title="退出登录" @click="handleLogout">
              <Icon name="logout" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Workspace Content Area -->
    <div class="main-wrapper">
      <main class="content-viewport">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg-app, #f3faf7);
  color: var(--text-primary, #121815);
}

.top-navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  padding: 12px 20px 0;
  background: transparent;
  border-bottom: none;
  box-shadow: none;
}

.navbar-container {
  max-width: 1720px;
  margin: 0 auto;
  padding: 0 22px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-radius: 18px;
  background: var(--glass-bg-strong, rgba(255, 255, 255, 0.78));
  backdrop-filter: var(--glass-blur, blur(18px) saturate(160%));
  -webkit-backdrop-filter: var(--glass-blur, blur(18px) saturate(160%));
  border: var(--border-glass, 1px solid rgba(255, 255, 255, 0.38));
  box-shadow: var(--shadow-glass, 0 8px 32px rgba(0, 0, 0, 0.05));
}

.nav-left { display: flex; align-items: center; gap: 18px; }
.brand-link { display: flex; align-items: center; gap: 12px; text-decoration: none; transition: transform 0.2s ease; }
.brand-link:hover { transform: scale(1.02); }
.brand-mark {
  display: grid; place-items: center; width: 36px; height: 36px;
  background: linear-gradient(135deg, var(--mint-400, #34d399) 0%, var(--brand-deep, #047857) 100%);
  border-radius: 11px; color: #ffffff; font-weight: 800; font-size: 19px;
  box-shadow: var(--shadow-mint, 0 8px 22px rgba(16, 185, 129, 0.28));
}
.brand-text { display: flex; align-items: center; gap: 8px; }
.brand-title { font-size: 17px; font-weight: 750; letter-spacing: -0.02em; color: var(--text-primary, #121815); }
.brand-badge {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: var(--mint-soft, rgba(16, 185, 129, 0.1)); color: var(--brand-deep, #047857); padding: 2px 7px; border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.nav-divider { width: 1px; height: 24px; background: rgba(18, 24, 21, 0.12); }
.top-nav-links { display: flex; align-items: center; gap: 4px; }
.nav-tab {
  position: relative; display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  border-radius: 999px; color: var(--text-secondary, #47554f); font-size: 13.5px; font-weight: 600;
  text-decoration: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-tab:hover { color: var(--brand-deep, #047857); background: var(--mint-soft, rgba(16, 185, 129, 0.1)); }
.nav-tab.active, .nav-tab.router-link-active {
  background: var(--mint-soft-strong, rgba(16, 185, 129, 0.18)); color: var(--brand-deep, #047857);
  border: 1px solid rgba(16, 185, 129, 0.35);
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(14, 41, 32, 0.05));
}
.nav-tab.active::after, .nav-tab.router-link-active::after {
  content: ""; position: absolute; left: 14px; right: 14px; bottom: 4px; height: 2px;
  border-radius: 999px; background: linear-gradient(90deg, var(--mint-500, #10b981), var(--brand-deep, #047857));
}
.nav-right { display: flex; align-items: center; gap: 12px; }
.user-profile-capsule {
  display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 5px;
  background: var(--glass-bg-strong, rgba(255, 255, 255, 0.78));
  border: 1px solid var(--border-strong, rgba(203, 215, 207, 0.9));
  border-radius: 30px;
  backdrop-filter: var(--glass-blur-sm, blur(10px) saturate(150%));
  -webkit-backdrop-filter: var(--glass-blur-sm, blur(10px) saturate(150%));
  transition: all 0.2s ease;
}
.user-profile-capsule:hover {
  border-color: rgba(16, 185, 129, 0.45); box-shadow: var(--shadow-sm, 0 2px 8px rgba(14, 41, 32, 0.05));
}
.user-avatar-circle {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, var(--mint-400, #34d399) 0%, var(--brand-deep, #047857) 100%);
  color: #ffffff; font-size: 13.5px; font-weight: 750; display: grid; place-items: center;
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(14, 41, 32, 0.05));
}
.user-details { display: flex; flex-direction: column; line-height: 1.25; padding-right: 4px; }
.user-name { font-size: 13px; font-weight: 650; color: var(--text-primary, #121815); }
.user-tenant { font-size: 11px; color: var(--text-tertiary, #788c82); }
.nav-logout-btn {
  width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  background: rgba(18, 24, 21, 0.05); border: 1px solid rgba(18, 24, 21, 0.12);
  color: var(--text-secondary, #47554f); cursor: pointer; transition: all 0.2s ease;
}
.nav-logout-btn:hover {
  background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: rgba(239, 68, 68, 0.4);
}
.main-wrapper { flex: 1; display: flex; flex-direction: column; width: 100%; }
.content-viewport { flex: 1; }
</style>
