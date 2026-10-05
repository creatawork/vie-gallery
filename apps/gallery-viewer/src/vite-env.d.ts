/// <reference types="vite/client" />

interface Window {
  __VIE_VIEWER_DIAGNOSTICS__?: import('./core/types').ViewerDiagnosticApi
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
