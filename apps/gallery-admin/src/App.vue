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
  <div
    class="admin-shell"
    :class="{
      'overview-bleed': ownsOwnChrome
    }"
  >
    <ToastContainer />

    <!-- Shared chrome is hidden on login and on 我的空间, which owns its own full-bleed layout. -->
    <header v-if="showAppChrome" class="top-navbar">
      <div class="navbar-container">
        <!-- Left: Brand & Main Navigation -->
        <div class="nav-left">
          <RouterLink to="/" class="brand-link">
            <div class="brand-mark">
              <span class="mark-letter">V</span>
              <div class="mark-glow"></div>
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

          <div v-else class="guest-indicator">
            <span class="guest-tag">控制台访客模式</span>
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
  background-color: #070913;
  background-image:
    radial-gradient(ellipse 80% 50% at 10% -10%, rgba(0, 229, 255, 0.12), transparent 55%),
    radial-gradient(ellipse 70% 45% at 90% 0%, rgba(139, 92, 246, 0.14), transparent 50%),
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(16, 185, 129, 0.08), transparent 55%),
    linear-gradient(180deg, #0b0f19 0%, #070913 100%);
  background-attachment: fixed;
  color: #f8fafc;
}

.admin-shell.overview-bleed {
  background: #e8f0ea;
  color: #121815;
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
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    0 1px 0 rgba(255, 255, 255, 0.1) inset;
}

.nav-left { display: flex; align-items: center; gap: 18px; }
.brand-link { display: flex; align-items: center; gap: 12px; text-decoration: none; transition: transform 0.2s ease; }
.brand-link:hover { transform: scale(1.02); }
.brand-mark {
  position: relative; display: grid; place-items: center; width: 36px; height: 36px;
  background: linear-gradient(135deg, #00e5ff 0%, #059669 100%);
  border-radius: 11px; color: #03201d; font-weight: 800; font-size: 19px;
  box-shadow: 0 4px 14px rgba(0, 229, 255, 0.35);
}
.mark-glow {
  position: absolute; inset: -2px;
  background: radial-gradient(circle, rgba(0, 229, 255, 0.4) 0%, transparent 70%);
  border-radius: 12px; z-index: -1;
}
.brand-text { display: flex; align-items: center; gap: 8px; }
.brand-title { font-size: 17px; font-weight: 750; letter-spacing: -0.02em; color: #f8fafc; }
.brand-badge {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: rgba(0, 229, 255, 0.12); color: #00e5ff; padding: 2px 7px; border-radius: 6px;
  border: 1px solid rgba(0, 229, 255, 0.25);
}
.nav-divider { width: 1px; height: 24px; background: rgba(255, 255, 255, 0.12); }
.top-nav-links { display: flex; align-items: center; gap: 4px; }
.nav-tab {
  position: relative; display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  border-radius: 999px; color: #94a3b8; font-size: 13.5px; font-weight: 600;
  text-decoration: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-tab:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.06); }
.nav-tab.active, .nav-tab.router-link-active {
  background: rgba(0, 229, 255, 0.15); color: #00e5ff;
  border: 1px solid rgba(0, 229, 255, 0.35);
  box-shadow: 0 2px 10px rgba(0, 229, 255, 0.12);
}
.nav-tab.active::after, .nav-tab.router-link-active::after {
  content: ""; position: absolute; left: 14px; right: 14px; bottom: 4px; height: 2px;
  border-radius: 999px; background: linear-gradient(90deg, #00e5ff, #10b981);
}
.nav-center { display: flex; align-items: center; justify-content: center; }
.status-indicator-pill {
  display: flex; align-items: center; gap: 8px; padding: 5px 13px;
  background: rgba(2, 6, 23, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px; font-size: 12px; color: #94a3b8;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.pulse-dot {
  width: 7px; height: 7px; background: #00e5ff; border-radius: 50%;
  box-shadow: 0 0 8px #00e5ff; animation: pulse-glow 2s infinite ease-in-out;
}
@keyframes pulse-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.15); }
}
.status-text { font-weight: 600; color: #f1f5f9; }
.status-sub { color: #64748b; }
.nav-right { display: flex; align-items: center; gap: 12px; }
.user-profile-capsule {
  display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 5px;
  background: rgba(2, 6, 23, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 30px;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); transition: all 0.2s ease;
}
.user-profile-capsule:hover {
  border-color: rgba(0, 229, 255, 0.35); box-shadow: 0 4px 12px rgba(0, 229, 255, 0.1);
}
.user-avatar-circle {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, #00e5ff 0%, #059669 100%);
  color: #03201d; font-size: 13.5px; font-weight: 750; display: grid; place-items: center;
  box-shadow: 0 2px 6px rgba(0, 229, 255, 0.3);
}
.user-details { display: flex; flex-direction: column; line-height: 1.25; padding-right: 4px; }
.user-name { font-size: 13px; font-weight: 650; color: #f8fafc; }
.user-tenant { font-size: 11px; color: #94a3b8; }
.nav-logout-btn {
  width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8; cursor: pointer; transition: all 0.2s ease;
}
.nav-logout-btn:hover {
  background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: rgba(239, 68, 68, 0.4);
}
.guest-indicator {
  padding: 5px 12px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.08);
}
.guest-tag { font-size: 12px; color: #94a3b8; font-weight: 600; }
.main-wrapper { flex: 1; display: flex; flex-direction: column; width: 100%; }
.content-viewport { flex: 1; }
</style>
