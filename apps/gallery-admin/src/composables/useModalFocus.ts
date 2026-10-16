import { nextTick, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const modalStack: symbol[] = []
let previousBodyOverflow = ''
let previousBodyPadding = ''

function lockPageScroll() {
  if (modalStack.length) return
  previousBodyOverflow = document.body.style.overflow
  previousBodyPadding = document.body.style.paddingRight
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  if (scrollbarWidth > 0) {
    const padding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0
    document.body.style.paddingRight = `${padding + scrollbarWidth}px`
  }
  document.body.style.overflow = 'hidden'
}

export function useModalFocus(
  active: MaybeRefOrGetter<boolean>,
  options: {
    focusContainer?: boolean
    onEscape?: () => void
    disabled?: MaybeRefOrGetter<boolean>
  } = {}
) {
  const root = ref<HTMLElement | null>(null)
  let previous: HTMLElement | null = null
  const token = Symbol('modal')

  function release() {
    window.removeEventListener('keydown', onKeydown, true)
    const index = modalStack.indexOf(token)
    if (index !== -1) {
      modalStack.splice(index, 1)
      if (!modalStack.length) {
        document.body.style.overflow = previousBodyOverflow
        document.body.style.paddingRight = previousBodyPadding
      }
    }
  }

  function focusables() {
    if (!root.value) return [] as HTMLElement[]
    return Array.from(root.value.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0)
  }

  function onKeydown(event: KeyboardEvent) {
    if (!toValue(active) || modalStack.at(-1) !== token || event.isComposing) return
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
    if (event.shiftKey && (current === first || current === root.value || !root.value?.contains(current))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (current === last || !root.value?.contains(current))) {
      event.preventDefault()
      first.focus()
    }
  }

  watch(() => toValue(active), async (isOpen, _previous, onCleanup) => {
    release()
    let cancelled = false
    onCleanup(() => {
      cancelled = true
      release()
    })
    if (!isOpen) {
      if (previous?.isConnected) previous.focus()
      previous = null
      return
    }
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockPageScroll()
    modalStack.push(token)
    await nextTick()
    if (cancelled) return
    window.addEventListener('keydown', onKeydown, true)
    if (modalStack.at(-1) !== token) return
    const items = focusables()
    ;(options.focusContainer ? root.value : items[0] || root.value)?.focus()
  }, { immediate: true, flush: 'post' })

  onUnmounted(() => {
    release()
    if (previous?.isConnected) previous.focus()
  })

  return { root }
}
