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

        <div v-if="$slots.default" class="modal-content">
          <slot />
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
.modal-backdrop { position: fixed; inset: 0; z-index: 2100; display: grid; place-items: center; padding: 24px; overflow-y: auto; background: rgba(20, 30, 24, .42); }
.modal-card { width: min(440px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; padding: 28px; border-radius: 16px; background: var(--bg-surface); box-shadow: var(--shadow-xl); }
.modal-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 28px; }
.icon-bubble { display: grid; place-items: center; flex-shrink: 0; width: 42px; height: 42px; border-radius: 10px; background: var(--mint-soft); color: var(--brand-deep); }
.icon-bubble.icon-danger { background: #faece8; color: var(--status-error); }
.header-text h3 { font-size: 20px; font-weight: 600; line-height: 1.4; margin-bottom: 8px; }
.header-text p { color: var(--text-secondary); font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.modal-content { margin: -4px 0 24px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 180ms; }
.modal-fade-enter-active .modal-card { animation: fade-in-up 220ms var(--ease-spring); }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
