<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { useModalFocus } from '../composables/useModalFocus'

interface Props {
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
  loading: false
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const { root } = useModalFocus(computed(() => props.show), {
  onEscape: () => { if (!props.loading) emit('cancel') },
  disabled: computed(() => props.loading)
})
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-backdrop" @click.self="!loading && emit('cancel')">
      <div
        ref="root"
        class="modal-card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'confirm-title'"
        tabindex="-1"
      >
        <div class="modal-header">
          <div class="icon-bubble" :class="{ 'icon-danger': danger }">
            <Icon :name="danger ? 'trash' : 'alert-circle'" :size="20" />
          </div>
          <div class="header-text">
            <h3 id="confirm-title">{{ title }}</h3>
            <p>{{ message }}</p>
          </div>
        </div>

        <div class="modal-actions">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="loading"
            @click="emit('cancel')"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            :disabled="loading"
            @click="emit('confirm')"
          >
            {{ loading ? '处理中…' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 24px;
  width: min(440px, 100%);
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
  transform-origin: center;
}

.modal-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.icon-bubble {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #f1f5f9;
  color: #475569;
  flex-shrink: 0;
  animation: modal-icon-pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.1s both;
}

@keyframes modal-icon-pop {
  0% {
    transform: scale(0) rotate(-180deg);
    opacity: 0;
  }
  50% {
    transform: scale(1.15) rotate(10deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

.icon-bubble.icon-danger {
  background: #fee2e2;
  color: #dc2626;
  animation: modal-icon-pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.1s both,
             modal-icon-shake 0.5s ease 0.6s;
}

@keyframes modal-icon-shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px) rotate(-3deg);
  }
  75% {
    transform: translateX(4px) rotate(3deg);
  }
}

.header-text h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  color: #0f172a;
  animation: modal-text-slide 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both;
}

.header-text p {
  margin: 0;
  font-size: 13.5px;
  color: #64748b;
  line-height: 1.5;
  animation: modal-text-slide 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;
}

@keyframes modal-text-slide {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-actions .btn {
  animation: modal-button-slide 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.25s both;
}

.modal-actions .btn:last-child {
  animation-delay: 0.3s;
}

@keyframes modal-button-slide {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.btn {
  padding: 9px 18px;
  font-size: 13.5px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary {
  background: #f1f5f9;
  color: #334155;
}

.btn-secondary:hover:not(:disabled) {
  background: #e2e8f0;
  transform: translateY(-1px);
}

.btn-primary {
  background: #0f172a;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: #1e293b;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.3);
}

.btn-danger {
  background: #dc2626;
  color: #ffffff;
}

.btn-danger:hover:not(:disabled) {
  background: #b91c1c;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Enhanced Modal Transitions */
.modal-fade-enter-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.modal-fade-enter-active .modal-card {
  animation: modal-card-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-fade-leave-active .modal-card {
  animation: modal-card-leave 0.25s cubic-bezier(0.4, 0, 1, 1);
}

@keyframes modal-card-enter {
  0% {
    opacity: 0;
    transform: translateY(30px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes modal-card-leave {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-backdrop {
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  .icon-bubble,
  .header-text h3,
  .header-text p,
  .modal-actions .btn,
  .modal-card {
    animation: none !important;
  }
  
  .modal-fade-enter-active .modal-card,
  .modal-fade-leave-active .modal-card {
    animation: none !important;
  }
}
</style>
