import { reactive } from 'vue'

export interface ToastItem {
  id: number
  msg: string
}

export const toasts = reactive<ToastItem[]>([])
let seq = 0

export function showToast(msg: string): void {
  const id = ++seq
  toasts.push({ id, msg })
  window.setTimeout(() => {
    const idx = toasts.findIndex((t) => t.id === id)
    if (idx >= 0) toasts.splice(idx, 1)
  }, 2600)
}
