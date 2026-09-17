<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import Icon from '../components/Icon.vue'

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

async function handleResetPassword() {
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
        <span class="fold-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M6 9.2 16 4l10 5.2v6.1L16 21.6 6 15.3V9.2Z" fill="#12B981" />
            <path d="M16 4v17.6l10-6.3V9.2L16 4Z" fill="#059669" />
            <path d="M6 15.3 16 21.6 26 15.3 16 28 6 15.3Z" fill="#047857" />
          </svg>
        </span>
        <h2>VIE Gallery</h2>
      </div>

      <div v-if="resetSuccess" class="reset-success-box">
        <div class="success-icon">
          <Icon name="check" :size="28" stroke-width="3" />
        </div>
        <h3>密码重置成功</h3>
        <p>您的账户密码已成功更新。现在可以使用新密码登录系统。</p>
        <button class="btn btn-primary full-width" type="button" @click="goToLogin">
          立即前往登录
        </button>
      </div>

      <form v-else class="reset-form" @submit.prevent="handleResetPassword">
        <div class="form-header">
          <h3>设置新密码</h3>
          <p>请输入您的新登录密码（至少 12 个字符）</p>
        </div>

        <div v-if="!token" class="form-group">
          <label for="manual-token">重置令牌 (Token)</label>
          <input
            id="manual-token"
            v-model="manualToken"
            class="form-input"
            type="text"
            required
            placeholder="输入邮件或日志中的重置令牌"
          />
        </div>

        <div class="form-group">
          <label for="new-password">新密码</label>
          <input
            id="new-password"
            v-model="newPassword"
            class="form-input"
            type="password"
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
            minlength="12"
            maxlength="128"
            required
            placeholder="再次输入新密码"
          />
        </div>

        <div v-if="error" class="error-banner">
          <Icon name="alert-circle" :size="14" />
          <span>{{ error }}</span>
        </div>

        <button class="btn btn-primary full-width submit-btn" type="submit" :disabled="loading">
          <Icon v-if="loading" name="refresh" :size="14" />
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
.reset-page {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  font-family: var(--font-family, 'Plus Jakarta Sans', system-ui, sans-serif);
}

.reset-scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-color: #eef6f1;
  background-image: url('/hall-bg.png');
  background-size: cover;
  background-position: center;
}

.reset-card {
  position: relative;
  z-index: 1;
  width: min(440px, 100%);
  padding: 36px 32px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(15, 40, 28, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.brand-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 24px;
}

.fold-mark svg {
  width: 32px;
  height: 32px;
}

.brand-badge h2 {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}

.form-header {
  text-align: center;
  margin-bottom: 22px;
}

.form-header h3 {
  font-size: 18px;
  font-weight: 750;
  color: #0f172a;
  margin: 0 0 6px;
}

.form-header p {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.reset-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12.5px;
  font-weight: 650;
  color: #334155;
}

.form-input {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-size: 13.5px;
  color: #0f172a;
  outline: none;
  transition: all 0.15s ease;
}

.form-input:focus {
  border-color: var(--brand-accent, #10b981);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 12.5px;
}

.full-width {
  width: 100%;
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  background: var(--brand-accent, #10b981);
  color: #ffffff;
  border: none;
  cursor: pointer;
  margin-top: 6px;
}

.submit-btn:hover {
  background: var(--brand-deep, #047857);
}

.form-footer {
  text-align: center;
  margin-top: 12px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--brand-accent, #10b981);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

/* Success state */
.reset-success-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 12px 0;
  gap: 12px;
}

.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #ecfdf5;
  color: #047857;
  display: grid;
  place-items: center;
}

.reset-success-box h3 {
  font-size: 18px;
  font-weight: 750;
  color: #0f172a;
  margin: 0;
}

.reset-success-box p {
  font-size: 13.5px;
  color: #64748b;
  margin: 0 0 12px;
  line-height: 1.5;
}
</style>
