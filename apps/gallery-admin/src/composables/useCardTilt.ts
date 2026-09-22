import { onMounted, onBeforeUnmount, type Ref } from 'vue'

/**
 * 照片卡片 3D 鼠标跟随倾斜效果
 * 
 * 使用方式：
 * ```vue
 * <script setup>
 * import { ref } from 'vue'
 * import { useCardTilt } from '../composables/useCardTilt'
 * 
 * const cardRef = ref<HTMLElement | null>(null)
 * useCardTilt(cardRef)
 * </script>
 * 
 * <template>
 *   <div ref="cardRef" class="photo-card">...</div>
 * </template>
 * ```
 */
export function useCardTilt(
  elementRef: Ref<HTMLElement | null>,
  options: {
    maxTilt?: number      // 最大倾斜角度（度）
    perspective?: number  // 透视距离（像素）
    scale?: number        // 悬浮时的缩放倍数
    speed?: number        // 过渡速度（毫秒）
    easing?: string       // 缓动函数
    glare?: boolean       // 是否启用光泽效果
    disabled?: boolean    // 是否禁用（用于响应式控制）
  } = {}
) {
  const {
    maxTilt = 8,
    perspective = 1000,
    scale = 1.02,
    speed = 300,
    easing = 'cubic-bezier(0.4, 0, 0.2, 1)',
    glare = false,
    disabled = false
  } = options

  let isHovering = false
  let glareElement: HTMLElement | null = null

  function handleMouseEnter() {
    if (disabled || !elementRef.value) return
    isHovering = true
    elementRef.value.classList.add('tilt-active')
  }

  function handleMouseMove(event: MouseEvent) {
    if (disabled || !isHovering || !elementRef.value) return

    const el = elementRef.value
    const rect = el.getBoundingClientRect()

    // 计算鼠标在卡片内的相对位置（-1 到 1）
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height

    // 转换为倾斜角度（中心为 0，边缘为 ±maxTilt）
    const tiltX = (y - 0.5) * maxTilt * 2  // Y 轴鼠标位置影响 X 轴旋转
    const tiltY = (0.5 - x) * maxTilt * 2  // X 轴鼠标位置影响 Y 轴旋转（反向）

    // 设置 CSS 变量
    el.style.setProperty('--tilt-x', tiltX.toFixed(2))
    el.style.setProperty('--tilt-y', tiltY.toFixed(2))

    // 如果启用光泽效果
    if (glare && glareElement) {
      const glareX = x * 100
      const glareY = y * 100
      glareElement.style.background = `
        radial-gradient(
          circle at ${glareX}% ${glareY}%,
          rgba(255, 255, 255, 0.2) 0%,
          transparent 50%
        )
      `
    }
  }

  function handleMouseLeave() {
    if (disabled || !elementRef.value) return
    isHovering = false
    
    const el = elementRef.value
    el.classList.remove('tilt-active')
    
    // 平滑重置倾斜角度
    el.style.setProperty('--tilt-x', '0')
    el.style.setProperty('--tilt-y', '0')

    // 重置光泽
    if (glare && glareElement) {
      glareElement.style.background = 'transparent'
    }
  }

  onMounted(() => {
    if (disabled || !elementRef.value) return

    const el = elementRef.value

    // 设置 transition
    el.style.transition = `transform ${speed}ms ${easing}`

    // 如果启用光泽效果，创建光泽层
    if (glare) {
      glareElement = document.createElement('div')
      glareElement.className = 'card-glare'
      glareElement.style.cssText = `
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 1;
        transition: background ${speed}ms ${easing};
      `
      el.style.position = 'relative'
      el.appendChild(glareElement)
    }

    // 绑定事件
    el.addEventListener('mouseenter', handleMouseEnter)
    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('mouseleave', handleMouseLeave)
  })

  onBeforeUnmount(() => {
    if (!elementRef.value) return

    const el = elementRef.value
    el.removeEventListener('mouseenter', handleMouseEnter)
    el.removeEventListener('mousemove', handleMouseMove)
    el.removeEventListener('mouseleave', handleMouseLeave)

    // 移除光泽层
    if (glareElement && el.contains(glareElement)) {
      el.removeChild(glareElement)
    }
  })

  return {
    isHovering: () => isHovering
  }
}

/**
 * 批量为网格中的所有卡片启用 3D 倾斜效果
 * 
 * 使用方式：
 * ```vue
 * <script setup>
 * import { ref, onMounted } from 'vue'
 * import { useCardTiltBatch } from '../composables/useCardTilt'
 * 
 * const gridRef = ref<HTMLElement | null>(null)
 * useCardTiltBatch(gridRef, '.photo-card')
 * </script>
 * 
 * <template>
 *   <div ref="gridRef" class="photo-grid">
 *     <div class="photo-card">...</div>
 *     <div class="photo-card">...</div>
 *   </div>
 * </template>
 * ```
 */
export function useCardTiltBatch(
  containerRef: Ref<HTMLElement | null>,
  selector: string,
  options: Parameters<typeof useCardTilt>[1] = {}
) {
  const cleanups: Array<() => void> = []

  function initCards() {
    if (!containerRef.value) return

    const cards = containerRef.value.querySelectorAll<HTMLElement>(selector)
    
    cards.forEach(card => {
      const cardRef: Ref<HTMLElement | null> = { value: card }
      
      // 手动实现 useCardTilt 的逻辑
      const tilt = createCardTilt(card, options)
      cleanups.push(tilt.destroy)
    })
  }

  onMounted(() => {
    initCards()
  })

  onBeforeUnmount(() => {
    cleanups.forEach(cleanup => cleanup())
    cleanups.length = 0
  })

  return {
    refresh: initCards
  }
}

/**
 * 创建单个卡片的倾斜效果（内部辅助函数）
 */
function createCardTilt(
  element: HTMLElement,
  options: Parameters<typeof useCardTilt>[1] = {}
) {
  const {
    maxTilt = 8,
    speed = 300,
    easing = 'cubic-bezier(0.4, 0, 0.2, 1)',
    glare = false,
    disabled = false
  } = options

  let isHovering = false
  let glareElement: HTMLElement | null = null

  function handleMouseEnter() {
    if (disabled) return
    isHovering = true
    element.classList.add('tilt-active')
  }

  function handleMouseMove(event: MouseEvent) {
    if (disabled || !isHovering) return

    const rect = element.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height

    const tiltX = (y - 0.5) * maxTilt * 2
    const tiltY = (0.5 - x) * maxTilt * 2

    element.style.setProperty('--tilt-x', tiltX.toFixed(2))
    element.style.setProperty('--tilt-y', tiltY.toFixed(2))

    if (glare && glareElement) {
      const glareX = x * 100
      const glareY = y * 100
      glareElement.style.background = `
        radial-gradient(
          circle at ${glareX}% ${glareY}%,
          rgba(255, 255, 255, 0.2) 0%,
          transparent 50%
        )
      `
    }
  }

  function handleMouseLeave() {
    if (disabled) return
    isHovering = false
    element.classList.remove('tilt-active')
    element.style.setProperty('--tilt-x', '0')
    element.style.setProperty('--tilt-y', '0')

    if (glare && glareElement) {
      glareElement.style.background = 'transparent'
    }
  }

  // 初始化
  element.style.transition = `transform ${speed}ms ${easing}`

  if (glare) {
    glareElement = document.createElement('div')
    glareElement.className = 'card-glare'
    glareElement.style.cssText = `
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      z-index: 1;
      transition: background ${speed}ms ${easing};
    `
    element.style.position = 'relative'
    element.appendChild(glareElement)
  }

  element.addEventListener('mouseenter', handleMouseEnter)
  element.addEventListener('mousemove', handleMouseMove)
  element.addEventListener('mouseleave', handleMouseLeave)

  return {
    destroy: () => {
      element.removeEventListener('mouseenter', handleMouseEnter)
      element.removeEventListener('mousemove', handleMouseMove)
      element.removeEventListener('mouseleave', handleMouseLeave)
      
      if (glareElement && element.contains(glareElement)) {
        element.removeChild(glareElement)
      }
    }
  }
}
