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
        <div class="toast-icon" :class="`toast-icon-${toast.type}`">
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
        <div class="toast-progress"></div>
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
  position: relative;
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
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.toast-card:hover {
  transform: translateY(-2px) scale(1.01);
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
  animation: toast-icon-pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* 图标弹出动画 */
@keyframes toast-icon-pop {
  0% {
    transform: scale(0) rotate(-180deg);
    opacity: 0;
  }
  50% {
    transform: scale(1.2) rotate(10deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

/* 成功图标旋转 */
.toast-icon-success {
  animation: toast-icon-pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55),
             toast-icon-pulse 2s ease-in-out 0.5s infinite;
}

@keyframes toast-icon-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(5, 150, 105, 0);
  }
}

/* 错误图标抖动 */
.toast-icon-error {
  animation: toast-icon-pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55),
             toast-icon-shake 0.5s ease-in-out 0.5s;
}

@keyframes toast-icon-shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-3px) rotate(-5deg);
  }
  75% {
    transform: translateX(3px) rotate(5deg);
  }
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
  transition: all 0.15s ease;
}

.toast-close:hover {
  color: #18181b;
  background: #f4f4f5;
  transform: scale(1.1);
}

/* 自动消失进度条 */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, 
    rgba(0, 0, 0, 0.1) 0%, 
    rgba(0, 0, 0, 0.15) 50%, 
    rgba(0, 0, 0, 0.1) 100%);
  transform-origin: left;
  animation: toast-progress-shrink 4s linear forwards;
}

@keyframes toast-progress-shrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.toast-success .toast-progress {
  background: linear-gradient(90deg, #10b981, #059669);
}

.toast-error .toast-progress {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

.toast-warning .toast-progress {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.toast-info .toast-progress {
  background: linear-gradient(90deg, #0ea5e9, #0284c7);
}

/* Animations */
.toast-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.85);
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.toast-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 移动端适配 */
@media (max-width: 640px) {
  .toast-container {
    top: 16px;
    right: 16px;
    left: 16px;
    max-width: none;
    width: auto;
  }
}
</style>
