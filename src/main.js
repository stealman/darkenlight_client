import { createApp } from 'vue'
import App from './App.vue'
import PrimeVue from 'primevue/config';

// PrimeVue CSS
import 'primevue/resources/primevue.min.css';
import 'primeicons/primeicons.css';

import './../public/styles/main.css';
import './../public/styles/theme.css';
import './../public/styles/gm.css';

// Custom PrimeVue component styles
import './../public/styles/primevue/checkbox.css';
import Checkbox from 'primevue/checkbox';

const app = createApp(App);

// PrimeVue
app.use(PrimeVue, {
    theme: 'none',
});

app.component('Checkbox', Checkbox);
app.mount('#appWrapper');
