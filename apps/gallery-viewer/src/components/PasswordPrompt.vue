<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

defineProps<{
  isUnlocking: boolean
}>()

const emit = defineEmits<{
  unlock: [password: string]
}>()

const password = ref('')
const showPassword = ref(false)
const hasError = ref(false)

function handleSubmit() {
  if (password.value.trim()) {
    emit('unlock', password.value)
  } else {
    hasError.value = true
    setTimeout(() => hasError.value = false, 600)
  }
}
</script>

<template>
  <div class="password-prompt-root">
    <div class="glow-bg"></div>
    <div class="prompt-card" :class="{ shake: hasError }">
      <div class="lock-icon-box">
        <Icon name="lock" :size="24" />
      </div>

      <div class="prompt-header">
        <h2>私密相册已加密</h2>
        <p>此空间已被所有者设为密码保护，请输入访问密码以解锁沉浸式浏览体验。</p>
      </div>

      <form @submit.prevent="handleSubmit" class="password-form">
        <div class="input-container">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="请输入访问密钥或密码"
            :disabled="isUnlocking"
            autofocus
            class="password-input"
          />
          <button
            type="button"
            class="toggle-eye"
            :title="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword"
          >
            <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="18" />
          </button>
        </div>

        <button
          type="submit"
          class="unlock-btn"
          :disabled="!password.trim() || isUnlocking"
        >
          <Icon v-if="isUnlocking" name="refresh" :size="16" class="spin" />
          <span>{{ isUnlocking ? '解密验证中…' : '验证密码并进入' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.password-prompt-root {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: #090e11;
  color: #f1f5f9;
}

.glow-bg {
  position: absolute;
  width: 440px;
  height: 440px;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.18) 0%, transparent 70%);
  filter: blur(50px);
  pointer-events: none;
}

.prompt-card {
  position: relative;
  z-index: 1;
  width: min(420px, 100%);
  background: rgba(18, 25, 30, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 36px 32px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  text-align: center;
}

.lock-icon-box {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #34d399;
  display: grid;
  place-items: center;
  margin: 0 auto 20px;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
}

.prompt-header h2 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}

.prompt-header p {
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.5;
  margin-bottom: 24px;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input {
  width: 100%;
  padding: 12px 42px 12px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  font-size: 14px;
  color: #ffffff;
  outline: none;
  transition: all 0.2s ease;
}

.password-input:focus {
  border-color: #10b981;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.toggle-eye {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 4px;
}

.toggle-eye:hover {
  color: #ffffff;
}

.unlock-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
}

.unlock-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  transform: translateY(-1px);
}

.unlock-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.shake {
  animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
</style>
