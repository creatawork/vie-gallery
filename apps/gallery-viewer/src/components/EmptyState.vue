<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  message?: string
}>()
</script>

<template>
  <div class="empty-state-root">
    <div class="empty-card">
      <div class="icon-circle">
        <Icon name="photo" :size="32" />
      </div>
      <h2>相册暂无照片</h2>
      <p>{{ message || '相册内暂未上传照片，请等待创作者添加内容。' }}</p>
    </div>
  </div>
</template>

<style scoped>
.empty-state-root {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: #090e11;
  color: #f1f5f9;
}

.empty-card {
  text-align: center;
  max-width: 420px;
  background: rgba(18, 25, 30, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 40px 32px;
}

.icon-circle {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  display: grid;
  place-items: center;
  margin: 0 auto 20px;
}

h2 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}

p {
  font-size: 13.5px;
  color: #94a3b8;
  line-height: 1.6;
}
</style>
