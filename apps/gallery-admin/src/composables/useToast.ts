import { ref } from 'vue'

export interface ToastAction {
  label: string
  handler: () => void
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title?: string
  message: string
  duration: number
  action?: ToastAction
}

const toasts = ref<Toast[]>([])

export function useToast() {
  function show(toast: {
    type: 'success' | 'error' | 'info' | 'warning'
    title?: string
    message: string
    duration?: number
    action?: ToastAction
  }) {
    const id = Math.random().toString(36).substring(2, 9)
    const duration = toast.duration ?? 4000
    const newToast: Toast = {
      ...toast,
      id,
      duration
    }
    toasts.value.push(newToast)

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id)
      }, duration)
    }
    return id
  }

  function success(message: string, title = '操作成功') {
    return show({ type: 'success', title, message })
  }

  function error(message: string, title = '操作失败') {
    return show({ type: 'error', title, message, duration: 6000 })
  }

  function info(message: string, title = '提示') {
    return show({ type: 'info', title, message })
  }

  function warning(message: string, title = '注意') {
    return show({ type: 'warning', title, message })
  }

  /** 带操作按钮的提示（如「撤销」「重试」）。duration=0 时需用户手动关闭。 */
  function actionable(
    toast: {
      type: 'success' | 'error' | 'info' | 'warning'
      title?: string
      message: string
      duration?: number
      action: ToastAction
    }
  ) {
    return show({ ...toast, duration: toast.duration ?? 8000 })
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return {
    toasts,
    show,
    success,
    error,
    info,
    warning,
    actionable,
    dismiss
  }
}
