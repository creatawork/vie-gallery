import { nextTick, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export function useModalFocus(
  active: MaybeRefOrGetter<boolean>,
  options: {
    onEscape?: () => void
    disabled?: MaybeRefOrGetter<boolean>
  } = {}
) {
  const root = ref<HTMLElement | null>(null)
  let previous: HTMLElement | null = null

  function focusables() {
    if (!root.value) return [] as HTMLElement[]
    return Array.from(root.value.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
  }

  function onKeydown(event: KeyboardEvent) {
    if (!toValue(active)) return
    if (event.key === 'Escape') {
      if (toValue(options.disabled)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      options.onEscape?.()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusables()
    if (!items.length) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const current = document.activeElement as HTMLElement | null
    if (event.shiftKey && (current === first || !root.value?.contains(current))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (current === last || !root.value?.contains(current))) {
      event.preventDefault()
      first.focus()
    }
  }

  watch(() => toValue(active), async (isOpen) => {
    window.removeEventListener('keydown', onKeydown, true)
    if (!isOpen) {
      previous?.focus()
      previous = null
      return
    }
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    window.addEventListener('keydown', onKeydown, true)
    const items = focusables()
    ;(items[0] || root.value)?.focus()
  }, { flush: 'post' })

  onUnmounted(() => window.removeEventListener('keydown', onKeydown, true))

  return { root }
}
