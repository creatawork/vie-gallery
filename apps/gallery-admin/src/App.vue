<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastContainer from './components/ToastContainer.vue'
import BrandMark from './components/BrandMark.vue'
</script>

<template>
  <div class="admin-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <ToastContainer />
    <main id="main-content" class="content-viewport" tabindex="-1">
      <RouterView v-slot="{ Component }">
        <component :is="Component" v-if="Component" />
        <div v-else class="route-loading" role="status"><BrandMark :size="32" /><span>正在打开你的空间…</span></div>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.admin-shell { min-height: 100dvh; background: var(--bg-app); color: var(--text-primary); }
.skip-link { position: fixed; left: 20px; top: 12px; z-index: 2000; padding: 12px 18px; border-radius: 8px; background: var(--brand-deep); color: white; transform: translateY(-200%); opacity: 0; pointer-events: none; }
.skip-link:focus { transform: translateY(0); opacity: 1; pointer-events: auto; }
.content-viewport:focus { outline: none; }
.route-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 100dvh; color: var(--text-secondary); font-size: 14px; }
</style>
