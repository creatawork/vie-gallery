<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  note: string
  disabled?: boolean
  error?: string
}>(), { disabled: false, error: '' })

const emit = defineEmits<{
  (event: 'update:title', value: string): void
  (event: 'update:note', value: string): void
}>()

function count(value: string) { return Array.from(value).length }
</script>

<template>
  <div class="version-metadata">
    <label class="field-label" for="config-version-title">版本名称（选填）</label>
    <input
      id="config-version-title"
      class="text-field"
      :value="props.title"
      :disabled="props.disabled"
      :aria-invalid="!!props.error"
      aria-describedby="config-version-help config-version-error"
      maxlength="120"
      placeholder="例如：春季展览"
      @input="emit('update:title', ($event.target as HTMLInputElement).value)"
    />
    <div class="field-meta"><span>名称和备注不会影响照片</span><span>{{ count(props.title) }}/60</span></div>

    <label class="field-label" for="config-version-note">备注（选填）</label>
    <textarea
      id="config-version-note"
      class="text-field note-field"
      :value="props.note"
      :disabled="props.disabled"
      :aria-invalid="!!props.error"
      aria-describedby="config-version-help config-version-error"
      maxlength="1000"
      rows="3"
      placeholder="记录这次调整的内容"
      @input="emit('update:note', ($event.target as HTMLTextAreaElement).value)"
    />
    <div id="config-version-help" class="field-meta"><span>按字符数计数，支持换行</span><span>{{ count(props.note) }}/500</span></div>
    <p v-if="props.error" id="config-version-error" class="field-error" role="alert">{{ props.error }}</p>
  </div>
</template>

<style scoped>
.version-metadata { display: grid; gap: 6px; min-width: 0; }
.field-label { margin-top: 8px; color: #475569; font-size: 12px; font-weight: 650; }
.text-field { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid #d7e1dc; border-radius: 8px; background: #fff; color: #18372a; font: inherit; font-size: 13px; }
.text-field:focus-visible { outline: 2px solid #19815c; outline-offset: 2px; }
.text-field:disabled { background: #f4f6f5; }
.note-field { resize: vertical; white-space: pre-wrap; }
.field-meta { display: flex; justify-content: space-between; gap: 8px; color: #74827b; font-size: 11px; }
.field-error { margin: 0; color: #b91c1c; font-size: 12px; }
</style>
