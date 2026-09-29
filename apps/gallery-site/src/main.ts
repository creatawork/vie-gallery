import { createApp } from 'vue'
import App from './App.vue'
import { vReveal } from './brand/motion'

import './styles/base.css'
import './styles/templates/plain.css'
import './styles/templates/white-box.css'
import './styles/templates/darkroom.css'
import './styles/templates/field-notes.css'
import './styles/templates/lumen.css'

createApp(App).directive('reveal', vReveal).mount('#app')
