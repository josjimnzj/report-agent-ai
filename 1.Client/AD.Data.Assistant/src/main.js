import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import { locale, loadMessages } from 'devextreme/localization';
import esMessages from 'devextreme/localization/messages/es.json';

import 'devextreme/dist/css/dx.light.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './style.css';

import App from './App.vue';
import router from './router';
import { $notify } from './shared/notify';

loadMessages(esMessages);
locale('es-MX');

const pinia = createPinia();
pinia.use(piniaPersistedState);

const app = createApp(App);
app.config.globalProperties.$notify = $notify;
app.config.errorHandler = (err) => $notify.handleError(err);
app.use(pinia).use(router).mount('#app');
