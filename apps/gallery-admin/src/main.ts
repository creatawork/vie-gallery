import { createApp, watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { useAuth } from './composables/useAuth'
import './styles.css'
import './styles/animations.css'
import './styles/buttons.css'

const router = createRouter({
  history: createWebHistory('/app/'),
  routes: [
    {
      path: '/',
      name: 'overview',
      component: () => import('./views/OverviewView.vue')
    },
    {
      path: '/galleries/:id',
      name: 'gallery-workspace',
      component: () => import('./views/GalleryWorkspaceView.vue')
    },
    {
      path: '/members',
      name: 'members',
      component: () => import('./views/MembersView.vue')
    },
    {
      path: '/galleries/:id/config',
      name: 'gallery-config',
      component: () => import('./views/GalleryConfigPanel.vue')
    },
    {
      path: '/reset-password',
      redirect: { name: 'overview', query: {}, hash: '' }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

const auth = useAuth()
watch([() => router.currentRoute.value.name, auth.currentUser], ([name, user]) => {
  const pageTitle = name === 'overview' ? (user ? '我的空间' : '登录')
    : name === 'members' ? '成员管理'
    : name === 'gallery-workspace' ? '作品工作区'
    : name === 'gallery-config' ? '展示设计' : ''
  document.title = pageTitle ? `${pageTitle} · 阳光明媚` : '阳光明媚'
}, { immediate: true })

router.beforeEach(async (to) => {
  const auth = useAuth()
  if (!auth.authChecked.value) await auth.checkAuth()
  if (to.name !== 'overview' && !auth.isAuthenticated.value) {
    return { name: 'overview' }
  }
  if (to.name === 'members' && !auth.isOwner.value) {
    return { name: 'overview' }
  }
  return true
})

createApp(App).use(router).mount('#app')
