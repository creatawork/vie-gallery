<script setup lang="ts">
import { computed } from 'vue'
import { useSite } from '../siteContext'

const site = useSite()
const year = new Date().getFullYear()
const brandName = computed(() => site.config.content.brand.name)
</script>

<template>
  <footer>
    <div class="wrap foot-in">
      <span>© {{ year }} {{ brandName }}</span>
      <!-- 状态机标识槽位（§6.3）：TRIAL 显示「试用中」，ACTIVE 后自动消失；去水印权益不下发平台水印 -->
      <span v-if="site.status === 'TRIAL'" class="trial-badge">试用中 · TRIAL</span>
    </div>
  </footer>
</template>
