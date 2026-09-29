import type { Directive } from 'vue'

/** prefers-reduced-motion：全站动效总开关（性能预算 §5.7） */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 滚动 reveal 指令：进入视口加 .in（opacity/transform 合成层属性）。
 * 用法：v-reveal 或 v-reveal="{ delay: 120 }"
 */
export const vReveal: Directive<HTMLElement, { delay?: number } | undefined> = {
  mounted(el, binding) {
    el.classList.add('reveal')
    if (prefersReducedMotion()) {
      el.classList.add('in')
      return
    }
    if (binding.value?.delay) el.style.transitionDelay = `${binding.value.delay}ms`
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('in')
            io.unobserve(el)
          }
        }
      },
      { threshold: 0.12 }
    )
    io.observe(el)
    ;(el as RevealElement).__revealObserver = io
  },
  unmounted(el) {
    ;(el as RevealElement).__revealObserver?.disconnect()
    delete (el as RevealElement).__revealObserver
  }
}

interface RevealElement extends HTMLElement {
  __revealObserver?: IntersectionObserver
}
