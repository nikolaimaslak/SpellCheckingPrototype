import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const { PORT = '8787' } = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [tailwindcss()],
    base: './',
    server: {
      host: '127.0.0.1',
      port: 5173,
      allowedHosts: ['.ngrok-free.app'],
      proxy: { '/api': `http://127.0.0.1:${PORT}` },
    },
  };
});
