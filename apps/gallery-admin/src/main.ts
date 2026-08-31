import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './styles.css'

const router = createRouter({
  history: createWebHistory('/app/'),
  routes: [{ path: '/', component: () => import('./views/OverviewView.vue') }]
})

createApp(App).use(router).mount('#app')
