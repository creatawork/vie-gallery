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
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('./views/ResetPasswordView.vue')
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  if (!auth.authChecked.value) await auth.checkAuth()
  if (to.name !== 'overview' && to.name !== 'reset-password' && !auth.isAuthenticated.value) {
    return { name: 'overview' }
  }
  if (to.name === 'members' && !auth.isOwner.value) {
    return { name: 'overview' }
  }
  return true
})

createApp(App).use(router).mount('#app')
