<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">V</span><span>VIE Gallery</span></div>
      <nav aria-label="主导航">
        <RouterLink to="/" class="nav-item">照片空间</RouterLink>
      </nav>
      <div class="sidebar-foot">Tenant workspace</div>
    </aside>
    <main class="content"><RouterView /></main>
  </div>
</template>
