/**
 * 转化埋点（§8）：微信复制 / 表单提交 / 项目卡点击。
 * 事件通道挂 WP-13 的 track-event 通道——端点未上线时 sendBeacon 静默失败，不阻塞交互。
 * 事件名对齐设计文档：site_contact_click / site_form_submit / site_project_open
 */
export type SiteTrackEvent = 'site_contact_click' | 'site_form_submit' | 'site_project_open'

let activeSubdomain = ''

export function configureTracking(subdomain: string | null | undefined): void {
  activeSubdomain = subdomain ?? ''
}

export function trackEvent(event: SiteTrackEvent, props?: Record<string, unknown>): void {
  if (!activeSubdomain) return
  try {
    const payload = JSON.stringify({ event, props: props ?? {}, ts: Date.now() })
    const url = `/api/public/sites/${encodeURIComponent(activeSubdomain)}/events`
    const blob = new Blob([payload], { type: 'application/json' })
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, blob)) return
    void fetch(url, { method: 'POST', body: payload, keepalive: true, headers: { 'Content-Type': 'application/json' } })
  } catch {
    /* 埋点永不阻塞访客交互 */
  }
}
