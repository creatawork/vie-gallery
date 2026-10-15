<template>
  <main class="visitor-state">
    <div class="state-brand" aria-label="VIE 光影之间">vie<span>光影之间</span></div>
    <section class="state-content"><slot /></section>
    <p class="state-footer">每一帧，都值得被看见</p>
  </main>
</template>

<style scoped>
.visitor-state { display: grid; grid-template-rows: auto 1fr auto; align-items: center; min-height: 100svh; padding: 32px clamp(24px, 5vw, 72px); background: #f4f3ef; color: #202824; }
.state-brand { display: flex; align-items: center; gap: 16px; font: italic 42px/1 var(--font-serif); }
.state-brand span { padding-left: 16px; border-left: 1px solid #c8cec3; font: 11px/1.5 var(--font-sans); letter-spacing: .12em; color: #626c65; }
.state-content { width: min(400px, 100%); margin: 64px auto; }
.state-content :deep(.state-icon) { display: flex; color: #26735d; margin-bottom: 28px; }
.state-content :deep(h1) { margin-bottom: 16px; font: 400 clamp(28px, 4vw, 36px)/1.4 var(--font-serif); letter-spacing: .015em; overflow-wrap: anywhere; text-wrap: balance; }
.state-content :deep(.state-description) { color: #626c65; font-size: 14px; line-height: 1.9; }
.state-content :deep(.state-action) { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; margin-top: 28px; padding: 12px 22px; border-radius: 6px; background: #26735d; color: #fffefa; font-size: 14px; font-weight: 500; transition: background .18s; }
.state-content :deep(.state-action:hover:not(:disabled)) { background: #1b5746; }
.state-content :deep(.state-action:disabled) { opacity: .5; }
.state-footer { text-align: center; color: #626c65; font-size: 11px; letter-spacing: .08em; }
@media (max-width: 600px) { .visitor-state { padding-top: max(24px, env(safe-area-inset-top)); padding-bottom: max(24px, env(safe-area-inset-bottom)); }.state-brand { font-size: 36px; }.state-content { margin-block: 52px; } }
@media (prefers-reduced-motion: reduce) { .state-content :deep(.state-action) { transition: none; } }
</style>
