/**
 * 事件总线
 * 用于插件之间、插件与引擎之间的通信
 */
export class EventBus {
  private events: Map<string, Set<Function>> = new Map()

  /**
   * 订阅事件
   */
  on(event: string, handler: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event)!.add(handler)
  }

  /**
   * 取消订阅
   */
  off(event: string, handler: Function): void {
    const handlers = this.events.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.events.delete(event)
      }
    }
  }

  /**
   * 触发事件
   */
  emit(event: string, data?: any): void {
    const handlers = this.events.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error)
        }
      })
    }
  }

  /**
   * 一次性订阅
   */
  once(event: string, handler: Function): void {
    const wrapper = (data: any) => {
      handler(data)
      this.off(event, wrapper)
    }
    this.on(event, wrapper)
  }

  /**
   * 清空所有事件
   */
  clear(): void {
    this.events.clear()
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount(event: string): number {
    return this.events.get(event)?.size || 0
  }
}
