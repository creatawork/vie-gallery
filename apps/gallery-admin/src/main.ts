import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
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

createApp(App).use(router).mount('#app')
