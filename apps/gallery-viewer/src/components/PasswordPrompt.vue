<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  isUnlocking: boolean
}>()

const emit = defineEmits<{
  unlock: [password: string]
}>()

const password = ref('')
const showPassword = ref(false)

function handleSubmit() {
  if (password.value.trim()) {
    emit('unlock', password.value)
  }
}
</script>

<template>
  <div class="password-prompt">
    <div class="prompt-content">
      <h2>Password Required</h2>
      <p class="hint">This gallery is password protected</p>

      <form @submit.prevent="handleSubmit" class="password-form">
        <div class="input-group">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Enter password"
            :disabled="isUnlocking"
            autofocus
            class="password-input"
          />
          <button
            type="button"
            @click="showPassword = !showPassword"
            class="toggle-visibility"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
          >
            {{ showPassword ? '👁️' : '👁️‍🗨️' }}
          </button>
        </div>

        <button
          type="submit"
          :disabled="!password.trim() || isUnlocking"
          class="unlock-button"
        >
          {{ isUnlocking ? 'Unlocking...' : 'Unlock' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.password-prompt {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background: #F7F5F1;
}

.prompt-content {
  width: 100%;
  max-width: 420px;
  padding: 3rem 2.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

h2 {
  font-family: 'Playfair Display', serif;
  font-size: 2rem;
  font-weight: 600;
  color: #1E2227;
  margin: 0 0 0.5rem;
}

.hint {
  color: #6B7077;
  margin: 0 0 2rem;
  font-size: 0.938rem;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-group {
  position: relative;
  display: flex;
}

.password-input {
  flex: 1;
  padding: 0.75rem 3rem 0.75rem 1rem;
  border: 1px solid #E7E3DA;
  border-radius: 4px;
  font-size: 1rem;
  font-family: Inter, sans-serif;
  transition: border-color 0.2s;
}

.password-input:focus {
  outline: none;
  border-color: #3C5A78;
}

.password-input:disabled {
  background: #F7F5F1;
  cursor: not-allowed;
}

.toggle-visibility {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  font-size: 1.25rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.toggle-visibility:hover {
  opacity: 1;
}

.unlock-button {
  padding: 0.875rem 1.5rem;
  background: #3C5A78;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.unlock-button:hover:not(:disabled) {
  background: #2E4760;
}

.unlock-button:disabled {
  background: #E7E3DA;
  color: #6B7077;
  cursor: not-allowed;
}
</style>
