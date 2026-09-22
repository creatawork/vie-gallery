import { onMounted, onBeforeUnmount, watch } from 'vue'

/**
 * 批量增强页面中所有的滑块
 * 自动更新滑块进度 CSS 变量和数值弹跳动画
 */
export function useSliderEnhanceBatch(selector: string = '.range') {
  const cleanups: Array<() => void> = []

  function initSliders() {
    const sliders = document.querySelectorAll<HTMLInputElement>(selector)
    
    sliders.forEach(slider => {
      const updateProgress = () => {
        const min = Number(slider.min) || 0
        const max = Number(slider.max) || 100
        const value = Number(slider.value) || 0
        const percentage = ((value - min) / (max - min)) * 100

        slider.style.setProperty('--slider-progress', `${percentage}%`)
        slider.setAttribute('data-value', String(value))

        // 查找关联的数值标签并添加弹跳动画
        const row = slider.closest('.slider-row')
        if (row) {
          const valueLabel = row.querySelector('.slider-copy strong')
          if (valueLabel) {
            valueLabel.classList.remove('value-changing')
            void valueLabel.getBoundingClientRect()
            valueLabel.classList.add('value-changing')
            
            setTimeout(() => {
              valueLabel.classList.remove('value-changing')
            }, 300)
          }
        }
      }

      updateProgress()
      slider.addEventListener('input', updateProgress)
      slider.addEventListener('change', updateProgress)

      cleanups.push(() => {
        slider.removeEventListener('input', updateProgress)
        slider.removeEventListener('change', updateProgress)
      })
    })
  }

  onMounted(() => {
    initSliders()
  })

  onBeforeUnmount(() => {
    cleanups.forEach(cleanup => cleanup())
  })

  return { refresh: initSliders }
}
