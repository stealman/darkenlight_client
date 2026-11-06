import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Checkbox from 'primevue/checkbox'
import GuiPreview from './GuiPreview.vue'
import 'primevue/resources/primevue.min.css'
import '../../public/styles/main.css'
import '../../public/styles/theme.css'
import '../../public/styles/icons.css'
import '../../public/styles/inventory.css'
import '../../public/styles/action-buttons.css'
import '../../public/styles/gui-buttons.css'
import '../../public/styles/mystatus.css'
import '../../public/styles/selected-target.css'
import '../../public/styles/party-status.css'
import '../../public/styles/range-slider.css'
import '../../public/styles/primevue/checkbox.css'
import '../../public/styles/gui-skin.css'

// Deliberately independent of GameManager and networking.
export function mountGuiPreview() {
    createApp(GuiPreview).use(PrimeVue, { unstyled: false }).component('Checkbox', Checkbox).mount('#appWrapper')
}
