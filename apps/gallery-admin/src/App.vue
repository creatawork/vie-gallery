<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import ToastContainer from './components/ToastContainer.vue'
import Icon from './components/Icon.vue'

const route = useRoute()
const isSidebarOpen = ref(true)

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}
</script>

<template>
  <div class="admin-shell" :class="{ 'sidebar-collapsed': !isSidebarOpen }">
    <ToastContainer />

    <!-- Sidebar Navigation -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="brand">
          <div class="brand-mark">
            <span class="mark-letter">V</span>
            <div class="mark-glow"></div>
          </div>
          <div class="brand-text">
            <span class="brand-title">VIE Gallery</span>
            <span class="brand-subtitle">Studio Console</span>
          </div>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="主导航">
        <div class="nav-section-label">管理工作区</div>
        <RouterLink to="/" class="nav-item" :class="{ active: route.path === '/' }">
          <Icon name="gallery" :size="18" />
          <span>相册空间</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <div class="workspace-pill">
          <div class="pulse-dot"></div>
          <span>Cloud Storage Ready</span>
        </div>
        <div class="version-tag">v2.4.0 · Pro Studio</div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="main-wrapper">
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg-app);
}

.sidebar {
  width: 260px;
  background: #0d1a15;
  color: #f1f5f3;
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width 0.25s var(--ease-spring);
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 50;
}

.sidebar-header {
  margin-bottom: 32px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 10px;
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
  flex-direction: column;
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #ffffff;
}

.brand-subtitle {
  font-size: 11px;
  color: #6ee7b7;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-section-label {
  font-size: 11px;
  font-weight: 600;
  color: #4a6358;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 12px 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  color: #a7b9b1;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.18s var(--ease-spring);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
}

.nav-item.active,
.nav-item.router-link-active {
  background: rgba(16, 185, 129, 0.16);
  color: #34d399;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.25);
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 8px #10b981;
}

.version-tag {
  font-size: 11px;
  color: #526b60;
  padding-left: 2px;
}

.main-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
}

.content {
  flex: 1;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 36px 40px;
}

@media (max-width: 900px) {
  .sidebar {
    width: 76px;
    padding: 20px 12px;
    align-items: center;
  }

  .brand-text,
  .nav-section-label,
  .nav-item span,
  .sidebar-footer {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 12px;
  }

  .content {
    padding: 24px 16px;
  }
}
</style>
