import { createRouter, createWebHistory } from 'vue-router';
import AssistantView from '@/views/AssistantView.vue';

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'assistant', component: AssistantView },
    // Reporte publicado: enlace con token, sin iniciar sesión.
    { path: '/p/:token', name: 'public-report', component: () => import('@/views/PublicReportView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
