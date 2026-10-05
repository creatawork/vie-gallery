import type { ViewerConfig, ViewerQuality } from './viewerConfig'
export interface PreviewUpdate { type: 'VIE_CONFIG_UPDATE'; sequence: number; config: ViewerConfig }
export interface PreviewApplied { type: 'VIE_CONFIG_APPLIED'; sequence: number; effectiveQuality: ViewerQuality; reason: string | null; error?: string }
export function isTrustedPreviewMessage(event: MessageEvent, source: Window, origin: string): boolean {
  return origin !== 'null' && event.origin === origin && event.source === source
}
