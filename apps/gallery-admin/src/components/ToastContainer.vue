<script setup lang="ts">
import { useToast } from '../composables/useToast'
import Icon from './Icon.vue'

const { toasts, dismiss } = useToast()

function handleAction(toast: { id: string; action?: { handler: () => void } }) {
  if (!toast.action) return
  toast.action.handler()
  dismiss(toast.id)
}
</script>

<template>
  <div class="toast-container" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card"
        :class="`toast-${toast.type}`"
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
          <button
            v-if="toast.action"
            class="toast-action"
            type="button"
            @click.stop="handleAction(toast)"
          >{{ toast.action.label }}</button>
        </div>
        <button class="toast-close" type="button" aria-label="关闭" @click.stop="dismiss(toast.id)">
          <Icon name="x" :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container { position: fixed; top: 20px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; width: min(400px, calc(100vw - 48px)); pointer-events: none; }
.toast-card { pointer-events: auto; display: flex; align-items: flex-start; gap: 12px; padding: 18px; border-radius: 12px; background: var(--bg-surface); box-shadow: var(--shadow-lg); }
.toast-icon { display: grid; place-items: center; flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; }
.toast-success .toast-icon { color: var(--brand-deep); background: var(--mint-soft); }
.toast-error .toast-icon { color: var(--status-error); background: #faece8; }
.toast-warning .toast-icon { color: var(--status-warning); background: #f8edda; }
.toast-info .toast-icon { color: var(--status-info); background: #e7eef0; }
.toast-body { flex: 1; min-width: 0; }
.toast-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.toast-message { color: var(--text-secondary); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.toast-close { display: grid; place-items: center; flex-shrink: 0; min-width: 44px; min-height: 44px; margin: -5px -6px 0 0; border-radius: 6px; color: var(--text-secondary); }
.toast-close:hover { background: var(--bg-surface-subtle); }
.toast-action { min-height: 40px; padding: 8px 12px; margin-top: 10px; border-radius: 6px; color: var(--brand-deep); background: var(--mint-soft); font-size: 13px; font-weight: 600; }
.toast-enter-active, .toast-leave-active { transition: opacity 200ms, transform 240ms var(--ease-spring); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
.toast-move { transition: transform 240ms var(--ease-spring); }
@media (max-width: 640px) { .toast-container { top: max(12px, env(safe-area-inset-top)); left: 16px; right: 16px; width: auto; } }
</style>
