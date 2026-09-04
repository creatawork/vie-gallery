<script setup lang="ts">
defineProps<{
  title: string
  message: string
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="error-state">
    <div class="error-content">
      <div class="error-icon">⚠️</div>
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <button @click="emit('retry')" class="retry-button">
        Try Again
      </button>
    </div>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background: #F7F5F1;
}

.error-content {
  text-align: center;
  max-width: 420px;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

h2 {
  font-family: 'Playfair Display', serif;
  font-size: 1.75rem;
  font-weight: 600;
  color: #1E2227;
  margin: 0 0 0.75rem;
}

p {
  color: #6B7077;
  margin: 0 0 2rem;
  line-height: 1.6;
}

.retry-button {
  padding: 0.875rem 1.5rem;
  background: #3C5A78;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-button:hover {
  background: #2E4760;
}
</style>
