<script setup lang="ts">
import { onMounted } from 'vue'
import { useViewerState } from './composables/useViewerState'
import PasswordPrompt from './components/PasswordPrompt.vue'
import EmptyState from './components/EmptyState.vue'
import ErrorState from './components/ErrorState.vue'

// 从 URL 获取 slug
const slug = location.pathname.split('/').filter(Boolean).pop() || 'demo'

// 使用状态机
const viewer = useViewerState(slug)

onMounted(() => {
  viewer.initialize()
})

async function handleUnlock(password: string) {
  const success = await viewer.unlock(password)
  if (!success && viewer.error.value) {
    alert(viewer.error.value)
  }
}
</script>

<template>
  <div class="viewer-app">
    <!-- Loading -->
    <div v-if="viewer.state.value === 'loading'" class="loading-state">
      <div class="spinner"></div>
      <p>Loading gallery...</p>
    </div>

    <!-- Password Prompt -->
    <PasswordPrompt
      v-else-if="viewer.needsPassword.value"
      :is-unlocking="viewer.unlocking.value"
      @unlock="handleUnlock"
    />

    <!-- Empty State -->
    <EmptyState
      v-else-if="viewer.isEmpty.value"
      :message="viewer.gallery.value?.title ? `${viewer.gallery.value.title} is empty` : undefined"
    />

    <!-- Error States -->
    <ErrorState
      v-else-if="viewer.state.value === 'not_found'"
      title="Gallery Not Found"
      :message="viewer.error.value || 'The gallery you are looking for does not exist'"
      @retry="viewer.retry"
    />

    <ErrorState
      v-else-if="viewer.state.value === 'share_required'"
      title="Share Link Required"
      :message="viewer.error.value || 'This gallery requires a valid share link to access'"
      @retry="viewer.retry"
    />

    <ErrorState
      v-else-if="viewer.state.value === 'error'"
      title="Something Went Wrong"
      :message="viewer.error.value || 'An unexpected error occurred'"
      @retry="viewer.retry"
    />

    <!-- Ready: Photo Wall -->
    <main v-else-if="viewer.isReady.value" class="viewer">
      <header class="viewer-header">
        <span class="wordmark">VIE / GALLERY</span>
        <button class="share-button" aria-label="分享">↗</button>
      </header>

      <section class="intro">
        <p class="kicker">Public gallery</p>
        <h1>{{ viewer.gallery.value?.title || 'Moments in light' }}</h1>
        <p class="meta">{{ viewer.photos.value.length }} photographs</p>
      </section>

      <section class="photo-wall" aria-label="照片墙">
        <!-- Placeholder grid for now -->
        <div
          v-for="photo in viewer.photos.value"
          :key="photo.sortOrder"
          class="photo-tile"
        >
          <img :src="photo.thumbnailUrl" :alt="photo.title" loading="lazy" />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.viewer-app {
  min-height: 100vh;
  background: #F7F5F1;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 1.5rem;
}

.spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid #E7E3DA;
  border-top-color: #3C5A78;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p {
  color: #6B7077;
  font-size: 0.938rem;
}

.viewer {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3rem;
}

.wordmark {
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.05em;
  color: #1E2227;
}

.share-button {
  background: none;
  border: 1px solid #E7E3DA;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.125rem;
  transition: border-color 0.2s;
}

.share-button:hover {
  border-color: #3C5A78;
}

.intro {
  text-align: center;
  margin-bottom: 4rem;
}

.kicker {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6B7077;
  margin-bottom: 1rem;
}

h1 {
  font-family: 'Playfair Display', serif;
  font-size: 3rem;
  font-weight: 600;
  color: #1E2227;
  margin: 0 0 1rem;
  line-height: 1.2;
}

.meta {
  color: #6B7077;
  font-size: 1rem;
}

.photo-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.photo-tile {
  aspect-ratio: 4 / 3;
  background: white;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.photo-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 768px) {
  .viewer {
    padding: 1rem;
  }

  h1 {
    font-size: 2rem;
  }

  .photo-wall {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
