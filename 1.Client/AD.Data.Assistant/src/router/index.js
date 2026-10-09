import { createRouter, createWebHistory } from 'vue-router';
import AssistantView from '@/views/AssistantView.vue';

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'assistant', component: AssistantView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
