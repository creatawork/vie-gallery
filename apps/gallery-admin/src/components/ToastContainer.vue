<script setup lang="ts">
import { useToast } from '../composables/useToast'
import Icon from './Icon.vue'

const { toasts, dismiss } = useToast()
</script>

<template>
  <div class="toast-container" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card"
        :class="`toast-${toast.type}`"
        @click="dismiss(toast.id)"
      >
        <div class="toast-icon">
          <Icon v-if="toast.type === 'success'" name="check" :size="18" />
          <Icon v-else-if="toast.type === 'error'" name="alert-circle" :size="18" />
          <Icon v-else-if="toast.type === 'warning'" name="warning" :size="18" />
          <Icon v-else name="sparkles" :size="18" />
        </div>
        <div class="toast-body">
          <h4 v-if="toast.title" class="toast-title">{{ toast.title }}</h4>
          <p class="toast-message">{{ toast.message }}</p>
        </div>
        <button class="toast-close" aria-label="关闭" @click.stop="dismiss(toast.id)">
          <Icon name="x" :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 380px;
  width: calc(100vw - 48px);
  pointer-events: none;
}

.toast-card {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px -4px rgba(0, 0, 0, 0.16);
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
}

.toast-success .toast-icon {
  background: #ecfdf5;
  color: #059669;
}
.toast-success {
  border-left: 4px solid #10b981;
}

.toast-error .toast-icon {
  background: #fef2f2;
  color: #dc2626;
}
.toast-error {
  border-left: 4px solid #ef4444;
}

.toast-warning .toast-icon {
  background: #fffbeb;
  color: #d97706;
}
.toast-warning {
  border-left: 4px solid #f59e0b;
}

.toast-info .toast-icon {
  background: #f0f9ff;
  color: #0284c7;
}
.toast-info {
  border-left: 4px solid #0ea5e9;
}

.toast-body {
  flex: 1;
  min-width: 0;
}

.toast-title {
  margin: 0 0 2px;
  font-size: 13.5px;
  font-weight: 600;
  color: #18181b;
}

.toast-message {
  margin: 0;
  font-size: 12.5px;
  color: #52525b;
  line-height: 1.45;
  word-break: break-word;
}

.toast-close {
  background: none;
  border: none;
  padding: 2px;
  color: #a1a1aa;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-close:hover {
  color: #18181b;
  background: #f4f4f5;
}

/* Animations */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}
</style>
