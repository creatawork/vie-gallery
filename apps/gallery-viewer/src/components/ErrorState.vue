<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  title: string
  message: string
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="error-state-root">
    <div class="error-card">
      <div class="icon-circle">
        <Icon name="warning" :size="32" />
      </div>
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <button @click="emit('retry')" class="retry-btn">
        <Icon name="refresh" :size="16" />
        <span>重新尝试加载</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.error-state-root {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: #090e11;
  color: #f1f5f9;
}

.error-card {
  text-align: center;
  max-width: 440px;
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
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #f87171;
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
  margin-bottom: 24px;
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}
</style>
