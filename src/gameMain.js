import { createApp } from 'vue'
import App from './App.vue'
import PrimeVue from 'primevue/config'
import Checkbox from 'primevue/checkbox'

import 'primevue/resources/primevue.min.css'
import 'primeicons/primeicons.css'

import './../public/styles/main.css'
import './../public/styles/theme.css'
import './../public/styles/icons.css'
import './../public/styles/range-slider.css'
import './../public/styles/onscreen-messages.css'
import './../public/styles/selected-target.css'
import './../public/styles/mystatus.css'
import './../public/styles/action-buttons.css'
import './../public/styles/gui-buttons.css'
import './../public/styles/inventory.css'
import './../public/styles/tooltip-overlay.css'
import './../public/styles/gm.css'
import './../public/styles/primevue/checkbox.css'

export function mountGame() {
    const app = createApp(App)

    app.use(PrimeVue, {
        theme: 'none',
    })

    app.component('Checkbox', Checkbox)
    app.mount('#appWrapper')
}
