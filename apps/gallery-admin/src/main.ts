import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { useAuth } from './composables/useAuth'
import './styles.css'

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
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

router.beforeEach(async (to) => {
  if (to.name !== 'members') return true
  const auth = useAuth()
  if (!auth.currentUser.value && !auth.loading.value) await auth.checkAuth()
  return auth.isOwner.value ? true : { name: 'overview' }
})

createApp(App).use(router).mount('#app')
