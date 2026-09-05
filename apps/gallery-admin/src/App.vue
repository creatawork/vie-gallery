<script setup lang="ts">
import { onMounted } from 'vue'
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
  checkAuth,
  logout
} = useAuth()

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

    <!-- Modern Top Navigation Bar (Frosted Glass & Fresh Emerald) -->
    <header class="top-navbar">
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

          <!-- Top Navigation Links -->
          <nav class="top-nav-links" aria-label="顶部导航">
            <RouterLink to="/" class="nav-tab" :class="{ active: route.path === '/' }">
              <Icon name="gallery" :size="16" />
              <span>相册空间</span>
            </RouterLink>
          </nav>
        </div>

        <!-- Center: System & Storage Status Pill -->
        <div class="nav-center">
          <div class="status-indicator-pill">
            <div class="pulse-dot"></div>
            <span class="status-text">Cloud Engine Active</span>
            <span class="status-sub">· WebGL 3D</span>
          </div>
        </div>

        <!-- Right: User Info & Actions -->
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
  background-color: #f8fafc;
  background-image: 
    radial-gradient(at 0% 0%, rgba(236, 253, 245, 0.6) 0px, transparent 50%),
    radial-gradient(at 100% 0%, rgba(240, 253, 244, 0.5) 0px, transparent 50%),
    radial-gradient(at 50% 100%, rgba(248, 250, 252, 0.8) 0px, transparent 50%);
  background-attachment: fixed;
}

/* ==========================================
   Modern Frosted Glass Top Navigation Bar
   ========================================== */
.top-navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
  box-shadow: 
    0 1px 2px rgba(15, 23, 42, 0.03),
    0 4px 16px -2px rgba(15, 23, 42, 0.02);
}

.navbar-container {
  max-width: 1680px;
  margin: 0 auto;
  padding: 0 28px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

/* Left Section: Brand & Nav Tabs */
.nav-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  transition: transform 0.2s ease;
}

.brand-link:hover {
  transform: scale(1.02);
}

.brand-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 11px;
  color: #ffffff;
  font-weight: 800;
  font-size: 19px;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
}

.mark-glow {
  position: absolute;
  inset: -2px;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, transparent 70%);
  border-radius: 12px;
  z-index: -1;
}

.brand-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-title {
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.brand-badge {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  color: #047857;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.nav-divider {
  width: 1px;
  height: 24px;
  background: rgba(226, 232, 240, 0.9);
}

.top-nav-links {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 9px;
  color: #64748b;
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-tab:hover {
  color: #0f172a;
  background: rgba(16, 185, 129, 0.06);
}

.nav-tab.active,
.nav-tab.router-link-active {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.9), rgba(209, 250, 229, 0.6));
  color: #047857;
  box-shadow: 0 1px 4px rgba(16, 185, 129, 0.12);
}

/* Center Section: Status Pill */
.nav-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-indicator-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 13px;
  background: rgba(248, 250, 252, 0.85);
  border: 1px solid rgba(226, 232, 240, 0.85);
  border-radius: 20px;
  font-size: 12px;
  color: #475569;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.pulse-dot {
  width: 7px;
  height: 7px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 8px #10b981;
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.15); }
}

.status-text {
  font-weight: 600;
  color: #0f172a;
}

.status-sub {
  color: #94a3b8;
}

/* Right Section: User Profile & Actions */
.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-profile-capsule {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 4px 5px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 30px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
  transition: all 0.2s ease;
}

.user-profile-capsule:hover {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);
}

.user-avatar-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981 0%, #047857 100%);
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 750;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
}

.user-details {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  padding-right: 4px;
}

.user-name {
  font-size: 13px;
  font-weight: 650;
  color: #0f172a;
}

.user-tenant {
  font-size: 11px;
  color: #64748b;
}

.nav-logout-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #94a3b8;
  background: transparent;
  transition: all 0.18s ease;
}

.nav-logout-btn:hover {
  color: #ef4444;
  background: #fee2e2;
}

.guest-tag {
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 6px;
}

/* ==========================================
   Main Content Layout
   ========================================== */
.main-wrapper {
  flex: 1;
  width: 100%;
}

.content-viewport {
  max-width: 1680px;
  margin: 0 auto;
  padding: 28px 28px 48px;
  width: 100%;
}

@media (max-width: 960px) {
  .nav-center {
    display: none;
  }
  .navbar-container {
    padding: 0 16px;
  }
  .content-viewport {
    padding: 20px 16px 36px;
  }
}
</style>
