import { computed, ref } from 'vue'
import type { ViewerConfigVersionMetadata } from '@vie/gallery-contracts'

const EDGE_WHITESPACE = /^[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/g

function normalize(value: string): string | null {
  const clean = value.replace(EDGE_WHITESPACE, '')
  return clean.length ? clean : null
}

export function useConfigVersionMetadata() {
  const title = ref('')
  const note = ref('')
  const error = computed(() => {
    if (Array.from(normalize(title.value) ?? '').length > 60) return '版本名称最多 60 个字符。'
    if (Array.from(normalize(note.value) ?? '').length > 500) return '备注最多 500 个字符。'
    return ''
  })
  const valid = computed(() => !error.value)

  function toRequest(): ViewerConfigVersionMetadata {
    return { title: normalize(title.value), note: normalize(note.value) }
  }

  function reset(values: ViewerConfigVersionMetadata = { title: null, note: null }) {
    title.value = values.title ?? ''
    note.value = values.note ?? ''
  }

  return { title, note, error, valid, toRequest, reset }
}
