import { isTrustedPreviewMessage, serializeViewerConfig, type ViewerConfig, type PreviewApplied } from '@vie/gallery-contracts'
export { isTrustedPreviewMessage }
let nextSequence = 0
export function createViewerPreviewChannel(iframe: HTMLIFrameElement, onApplied: (message: PreviewApplied) => void, onReady?: () => void) {
  const source = iframe.contentWindow, origin = new URL(iframe.src).origin
  let disposed = false, ready = false, sequence = 0, sentSequence = 0
  let latest: ViewerConfig | null = null, timer: ReturnType<typeof setTimeout> | null = null
  function flush() {
    timer = null
    if (disposed || !ready || !latest || !source || source !== iframe.contentWindow) return
    sentSequence = sequence
    source.postMessage({ type: 'VIE_CONFIG_UPDATE', sequence, config: latest }, origin)
  }
  function send(config: ViewerConfig): number {
    if (disposed) return sequence
    latest = JSON.parse(serializeViewerConfig(config)); sequence = ++nextSequence
    if (ready && timer === null) timer = setTimeout(flush, 120)
    return sequence
  }
  function accept(event: MessageEvent) {
    if (disposed || !source || source !== iframe.contentWindow || !isTrustedPreviewMessage(event, source, origin)) return
    if (event.data?.type === 'VIE_PREVIEW_READY') {
      ready = true; onReady?.()
      if (timer !== null) clearTimeout(timer)
      flush()
    } else if (event.data?.type === 'VIE_CONFIG_APPLIED' && event.data.sequence === sequence && sequence === sentSequence
      && ['low', 'mid', 'high'].includes(event.data.effectiveQuality) && (event.data.reason === null || typeof event.data.reason === 'string')
      && (event.data.error === undefined || typeof event.data.error === 'string')) onApplied(event.data)
  }
  if (typeof window !== 'undefined') window.addEventListener('message', accept)
  return { send, accept, dispose() { disposed = true; latest = null; if (timer !== null) clearTimeout(timer); if (typeof window !== 'undefined') window.removeEventListener('message', accept) } }
}
