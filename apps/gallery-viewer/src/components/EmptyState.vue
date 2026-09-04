<script setup lang="ts">
defineProps<{
  message?: string
}>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-content">
      <div class="empty-icon">📷</div>
      <h2>No Photos Yet</h2>
      <p>{{ message || 'This gallery is empty' }}</p>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background: #F7F5F1;
}

.empty-content {
  text-align: center;
  max-width: 420px;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.4;
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
  line-height: 1.6;
}
</style>
