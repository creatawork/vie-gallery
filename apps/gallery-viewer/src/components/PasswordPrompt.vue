<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import Icon from './Icon.vue'
import VisitorStateShell from './VisitorStateShell.vue'

const props = defineProps<{
  isUnlocking: boolean
  error?: string | null
  galleryTitle?: string | null
}>()

const emit = defineEmits<{
  unlock: [password: string]
}>()

const password = ref('')
const showPassword = ref(false)
const inputId = useId()
const helpId = useId()
const errorId = useId()
const localError = ref('')
const passwordInput = ref<HTMLInputElement | null>(null)

watch(() => props.isUnlocking, async (busy, wasBusy) => {
  if (wasBusy && !busy && props.error) {
    await nextTick()
    passwordInput.value?.focus({ preventScroll: true })
  }
})

function handleSubmit() {
  if (props.isUnlocking) return
  if (password.value.trim()) {
    emit('unlock', password.value)
  } else {
    localError.value = '请输入访问密码。'
  }
}
</script>

<template>
  <VisitorStateShell>
      <span class="state-icon"><Icon name="lock" :size="28" :stroke-width="1.5" /></span>
      <h1>{{ galleryTitle || '一场为你保留的影展' }}</h1>
      <p :id="helpId" class="state-description">这场影展设有访问密码。输入创作者提供的密码，即可进入欣赏。</p>
      <form @submit.prevent="handleSubmit" class="password-form" :aria-busy="isUnlocking">
        <label :for="inputId">访问密码</label>
        <div class="input-container">
          <input
            :id="inputId"
            ref="passwordInput"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="输入访问密码"
            :disabled="isUnlocking"
            :aria-invalid="!!(error || localError)"
            :aria-describedby="`${helpId} ${(error || localError) ? errorId : ''}`"
            autocomplete="current-password"
            autocapitalize="off"
            spellcheck="false"
            autofocus
            class="password-input"
            @input="localError = ''"
          />
          <button
            type="button"
            class="toggle-eye"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            :aria-pressed="showPassword"
            :disabled="isUnlocking"
            @click="showPassword = !showPassword"
          >
            <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="18" />
          </button>
        </div>
        <p v-if="error || localError" :id="errorId" class="prompt-error" role="alert">{{ error || localError }}</p>
        <button
          type="submit"
          class="state-action unlock-btn"
          :disabled="!password.trim() || isUnlocking"
        >
          <Icon v-if="isUnlocking" name="refresh" :size="16" class="spin" />
          <span>{{ isUnlocking ? '正在验证…' : '进入影展' }}</span>
          <Icon v-if="!isUnlocking" name="arrow-right" :size="16" />
        </button>
      </form>
  </VisitorStateShell>
</template>

<style scoped>
.password-form { margin-top: 32px; }
.password-form label { display: block; margin-bottom: 10px; font-size: 13px; font-weight: 500; }
.input-container { position: relative; }
.password-input { width: 100%; min-height: 50px; padding: 12px 54px 12px 14px; background: #fffefa; color: #202824; border: 1px solid #bfc8bc; border-radius: 6px; font-size: 16px; }
.password-input:focus { border-color: #26735d; }
.password-input[aria-invalid='true'] { border-color: #a24d41; }
.password-input:disabled { color: #626c65; background: #e9eae3; }
.toggle-eye { position: absolute; inset: 3px 3px 3px auto; display: grid; place-items: center; width: 44px; color: #626c65; border-radius: 4px; }
.toggle-eye:hover:not(:disabled) { color: #202824; background: #e8ede4; }
.prompt-error { margin-top: 12px; color: #9b453b; font-size: 13px; line-height: 1.6; }
.unlock-btn { width: 100%; }
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
