import { isTrustedPreviewMessage, serializeViewerConfig, type ViewerConfig, type PreviewApplied } from '@vie/gallery-contracts'
export { isTrustedPreviewMessage }
let nextSequence = 0
const APPLY_RETRY_MS = 1200
const MAX_APPLY_RETRIES = 2
export function createViewerPreviewChannel(iframe: HTMLIFrameElement, onApplied: (message: PreviewApplied) => void, onReady?: (bootstrapped: boolean) => void, onConnecting?: () => void, onProgress?: () => void) {
  const source = iframe.contentWindow, origin = new URL(iframe.src).origin
  let disposed = false, ready = false, sequence = 0, sentSequence = 0
  let bootstrapRequested = false, bootstrapSequence = -1, bootstrapAppliedSequence = -1
  let latest: ViewerConfig | null = null, latestSerialized: string | null = null
  let frame: number | null = null, appliedTimer: ReturnType<typeof setTimeout> | null = null, retries = 0
  function scheduleFlush() {
    if (frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      flush()
    })
  }
  function clearAppliedTimer() {
    if (appliedTimer !== null) clearTimeout(appliedTimer)
    appliedTimer = null
  }
  function scheduleApplyRetry() {
    clearAppliedTimer()
    appliedTimer = setTimeout(() => {
      appliedTimer = null
      if (disposed || !ready || !latest || sentSequence !== sequence) return
      if (retries >= MAX_APPLY_RETRIES) {
        sentSequence = -1
        onApplied({ type: 'VIE_CONFIG_APPLIED', sequence, effectiveQuality: 'low', reason: null, error: '预览响应超时，请重试。' })
        return
      }
      retries++
      sequence = ++nextSequence
      flush()
    }, APPLY_RETRY_MS)
  }
  function sendBootstrap() {
    if (disposed || !bootstrapRequested || bootstrapAppliedSequence >= 0 || ready || !source || source !== iframe.contentWindow || !latest) return
    bootstrapSequence = sequence
    source.postMessage({ type: 'VIE_PREVIEW_BOOTSTRAP', sequence, config: latest }, origin)
  }
  function flush() {
    if (disposed || !ready || !latest || !source || source !== iframe.contentWindow) return
    if (bootstrapAppliedSequence === sequence) return
    sentSequence = sequence
    source.postMessage({ type: 'VIE_CONFIG_UPDATE', sequence, config: latest }, origin)
    scheduleApplyRetry()
  }
  function send(config: ViewerConfig, options: { force?: boolean } = {}): number {
    if (disposed) return sequence
    const serialized = serializeViewerConfig(config)
    if (!options.force && serialized === latestSerialized) return sequence
    latest = JSON.parse(serialized); latestSerialized = serialized; sequence = ++nextSequence
    retries = 0
    clearAppliedTimer()
    if (bootstrapRequested && !ready && bootstrapAppliedSequence < 0) sendBootstrap()
    if (ready) scheduleFlush()
    return sequence
  }
  function accept(event: MessageEvent) {
    if (disposed || !source || source !== iframe.contentWindow || !isTrustedPreviewMessage(event, source, origin)) return
    if (event.data?.type === 'VIE_PREVIEW_READY') {
      ready = true; onReady?.(bootstrapAppliedSequence === sequence)
      flush()
    } else if (event.data?.type === 'VIE_PREVIEW_BOOTSTRAP_REQUEST') {
      // A new document keeps the same WindowProxy. Give it a fresh sequence so
      // old bootstrap/config receipts cannot acknowledge this document's draft.
      if (bootstrapRequested && latest) sequence = ++nextSequence
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      clearAppliedTimer()
      ready = false; sentSequence = 0
      bootstrapSequence = -1; bootstrapAppliedSequence = -1
      bootstrapRequested = true
      onConnecting?.()
      sendBootstrap()
    } else if (event.data?.type === 'VIE_PREVIEW_BOOTSTRAP_APPLIED' && event.data.sequence === bootstrapSequence) {
      bootstrapAppliedSequence = bootstrapSequence
      if (ready && bootstrapAppliedSequence !== sequence) scheduleFlush()
    } else if (event.data?.type === 'VIE_PREVIEW_PROGRESS') {
      onProgress?.()
    } else if (event.data?.type === 'VIE_CONFIG_APPLIED' && event.data.sequence === sequence && sequence === sentSequence
      && ['low', 'mid', 'high'].includes(event.data.effectiveQuality) && (event.data.reason === null || typeof event.data.reason === 'string')
      && (event.data.error === undefined || typeof event.data.error === 'string')) {
      clearAppliedTimer()
      retries = 0
      onApplied(event.data)
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('message', accept)
  return { send, accept, dispose() {
    disposed = true; latest = null; latestSerialized = null
    if (frame !== null) cancelAnimationFrame(frame)
    clearAppliedTimer()
    if (typeof window !== 'undefined') window.removeEventListener('message', accept)
  } }
}
