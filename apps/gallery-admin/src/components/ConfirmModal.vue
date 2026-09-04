<script setup lang="ts">
import Icon from './Icon.vue'

interface Props {
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
  loading: false
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-backdrop" @click.self="!loading && emit('cancel')">
      <div class="modal-card">
        <div class="modal-header">
          <div class="icon-bubble" :class="{ 'icon-danger': danger }">
            <Icon :name="danger ? 'trash' : 'alert-circle'" :size="20" />
          </div>
          <div class="header-text">
            <h3>{{ title }}</h3>
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
}

.icon-bubble.icon-danger {
  background: #fee2e2;
  color: #dc2626;
}

.header-text h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  color: #0f172a;
}

.header-text p {
  margin: 0;
  font-size: 13.5px;
  color: #64748b;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
}

.btn-primary {
  background: #0f172a;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: #1e293b;
}

.btn-danger {
  background: #dc2626;
  color: #ffffff;
}

.btn-danger:hover:not(:disabled) {
  background: #b91c1c;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
