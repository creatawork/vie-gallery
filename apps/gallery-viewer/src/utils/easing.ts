/**
 * 动画缓动函数库
 * 提供各种缓动曲线用于平滑动画过渡
 */

/**
 * 缓动函数类型
 */
export type EasingFunction = (t: number) => number

/**
 * Linear - 线性插值
 */
export const linear: EasingFunction = (t) => t

/**
 * Cubic Ease-In-Out - 平滑的加速和减速
 */
export const easeInOutCubic: EasingFunction = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Cubic Ease-Out - 快速开始，平滑减速
 */
export const easeOutCubic: EasingFunction = (t) => {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Quartic Ease-Out - 更强的减速效果，适合相机运动
 */
export const easeOutQuart: EasingFunction = (t) => {
  return 1 - Math.pow(1 - t, 4)
}

/**
 * Quintic Ease-In-Out - 非常平滑的加速和减速
 */
export const easeInOutQuint: EasingFunction = (t) => {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2
}

/**
 * Exponential Ease-Out - 快速开始，极度平滑的减速
 */
export const easeOutExpo: EasingFunction = (t) => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

/**
 * Back Ease-Out - 带有轻微回弹效果
 */
export const easeOutBack: EasingFunction = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * Elastic Ease-Out - 弹性效果
 */
export const easeOutElastic: EasingFunction = (t) => {
  const c4 = (2 * Math.PI) / 3
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

/**
 * 获取推荐的缓动函数
 */
export const easingPresets = {
  /** 相机运动 - 电影感的平滑飞行 */
  cameraFly: easeOutQuart,
  
  /** 照片淡入淡出 - 柔和的过渡 */
  photoFade: easeOutCubic,
  
  /** UI 元素 - 快速响应 */
  uiElement: easeInOutCubic,
  
  /** 光照过渡 - 非常平滑 */
  lighting: easeOutCubic
}

/**
 * 动画控制器类
 * 用于管理基于时间的动画
 */
export class AnimationController {
  private startTime: number = 0
  private duration: number = 1000
  private easing: EasingFunction = linear
  private onUpdate: (progress: number, easedProgress: number) => void = () => {}
  private onComplete: () => void = () => {}
  private animationId: number | null = null
  private isRunning: boolean = false

  constructor(config: {
    duration: number
    easing?: EasingFunction
    onUpdate: (progress: number, easedProgress: number) => void
    onComplete?: () => void
  }) {
    this.duration = config.duration
    this.easing = config.easing || linear
    this.onUpdate = config.onUpdate
    this.onComplete = config.onComplete || (() => {})
  }

  /**
   * 启动动画
   */
  start(): void {
    if (this.isRunning) return
    
    this.isRunning = true
    this.startTime = performance.now()
    this.animate()
  }

  /**
   * 停止动画
   */
  stop(): void {
    if (!this.isRunning) return
    
    this.isRunning = false
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /**
   * 动画循环
   */
  private animate = (): void => {
    if (!this.isRunning) return

    const now = performance.now()
    const elapsed = now - this.startTime
    const progress = Math.min(1, elapsed / this.duration)
    const easedProgress = this.easing(progress)

    this.onUpdate(progress, easedProgress)

    if (progress < 1) {
      this.animationId = requestAnimationFrame(this.animate)
    } else {
      this.isRunning = false
      this.onComplete()
    }
  }
}
