<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import Icon from '../components/Icon.vue'
import BrandMark from '../components/BrandMark.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const token = computed(() => String(route.query.token || '').trim())
const manualToken = ref('')
const effectiveToken = computed(() => token.value || manualToken.value.trim())

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const resetSuccess = ref(false)
const successAction = ref<HTMLButtonElement | null>(null)

async function handleResetPassword() {
  if (loading.value) return
  error.value = ''
  if (!effectiveToken.value) {
    error.value = '缺少重置令牌，请通过邮件中的重置链接访问或输入令牌。'
    return
  }
  if (newPassword.value.length < 12) {
    error.value = '新密码长度至少需要 12 个字符。'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致，请重新确认。'
    return
  }

  loading.value = true
  try {
    const response = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: effectiveToken.value,
        newPassword: newPassword.value
      })
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { message?: string }
      throw new Error(data.message || '重置密码失败，重置令牌可能已过期或无效。')
    }

    resetSuccess.value = true
    toast.success('密码已成功重置！请使用新密码登录。')
    await nextTick()
    successAction.value?.focus()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '重置密码失败。'
  } finally {
    loading.value = false
  }
}

function goToLogin() {
  router.push('/')
}
</script>

<template>
  <div class="reset-page">
    <div class="reset-scene" aria-hidden="true"></div>

    <div class="reset-card">
      <div class="brand-badge">
        <BrandMark :size="32" />
        <h2>VIE Gallery</h2>
      </div>

      <div v-if="resetSuccess" class="reset-success-box">
        <div class="success-icon">
          <Icon name="check" :size="28" stroke-width="3" />
        </div>
        <h1>密码重置成功</h1>
        <p>您的账户密码已成功更新。现在可以使用新密码登录系统。</p>
        <button ref="successAction" class="btn btn-primary full-width" type="button" @click="goToLogin">
          立即前往登录
        </button>
      </div>

      <form v-else class="reset-form" @submit.prevent="handleResetPassword">
        <div class="form-header">
          <h1>设置新密码</h1>
          <p>请输入您的新登录密码（至少 12 个字符）</p>
        </div>

        <div v-if="!token" class="form-group">
          <label for="manual-token">邮件中的重置码</label>
          <input
            id="manual-token"
            v-model="manualToken"
            class="form-input"
            type="text"
            required
            placeholder="输入重置邮件中的完整重置码"
          />
        </div>

        <div class="form-group">
          <label for="new-password">新密码</label>
          <input
            id="new-password"
            v-model="newPassword"
            class="form-input"
            type="password"
            autocomplete="new-password"
            :disabled="loading"
            minlength="12"
            maxlength="128"
            required
            placeholder="输入新密码（至少 12 位）"
          />
        </div>

        <div class="form-group">
          <label for="confirm-password">确认新密码</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            class="form-input"
            type="password"
            autocomplete="new-password"
            :disabled="loading"
            minlength="12"
            maxlength="128"
            required
            placeholder="再次输入新密码"
          />
        </div>

        <div v-if="error" class="error-banner" role="alert">
          <Icon name="alert-circle" :size="14" />
          <span>{{ error }}</span>
        </div>

        <button class="btn btn-primary full-width submit-btn" type="submit" :disabled="loading">
          <Icon v-if="loading" name="refresh" :size="14" class="spin" />
          <span>{{ loading ? '正在重置…' : '确认重置密码' }}</span>
        </button>

        <div class="form-footer">
          <button class="link-btn" type="button" @click="goToLogin">
            想起密码了？返回登录
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.reset-page { position: relative; min-height: 100dvh; display: grid; place-items: center; padding: 32px 24px; background: var(--bg-app); }
.reset-scene { display: none; }
.reset-card { width: min(440px, 100%); padding: 40px 32px; background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border-strong); }
.brand-badge { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 36px; }
.brand-badge h2 { font-size: 20px; font-weight: 650; letter-spacing: -.025em; }
.form-header { margin-bottom: 28px; }
.form-header h1 { font-size: 26px; font-weight: 550; line-height: 1.4; }
.form-header p { margin-top: 10px; font-size: 13px; color: var(--text-secondary); }
.form-group { margin-bottom: 22px; }
.form-group label { font-size: 13px; font-weight: 600; }
.error-banner { display: flex; align-items: flex-start; gap: 8px; padding: 14px; margin-bottom: 20px; background: #faece8; color: #943d2c; border-radius: 8px; font-size: 13px; overflow-wrap: anywhere; }
.error-banner svg { flex-shrink: 0; margin-top: 2px; }
.full-width { width: 100%; min-height: 46px; }
.form-footer { margin-top: 24px; text-align: center; }
.link-btn { min-height: 40px; color: var(--brand-deep); font-size: 13px; }
.link-btn:hover { text-decoration: underline; text-underline-offset: 4px; }
.reset-success-box { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; }
.success-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; color: var(--brand-deep); background: var(--mint-soft); }
.reset-success-box h1 { font-size: 23px; font-weight: 550; }
.reset-success-box p { color: var(--text-secondary); font-size: 14px; line-height: 1.8; margin-bottom: 8px; }
@media (max-width: 520px) { .reset-page { background: var(--bg-surface); align-items: start; padding: 40px 24px; } .reset-card { padding: 0; border: 0; } .brand-badge { justify-content: flex-start; margin-bottom: 44px; } }
</style>
