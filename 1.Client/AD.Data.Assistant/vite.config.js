import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_APP_BASE || '/',
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5175,
      proxy: {
        // Solo se usa cuando VITE_DATA_MODE=api (fase 3). Sin buffer para no cortar el SSE.
        '/agent': {
          target: env.VITE_DATA_API_TARGET || 'https://workflow-agent-api.onrender.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/agent/, ''),
        },
      },
    },
    build: { chunkSizeWarningLimit: 4000 },
  };
});
