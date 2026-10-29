import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  // Relative asset paths, so the build works under https://<user>.github.io/<repo>/.
  base: './',
  server: {
    // IPv4 loopback: both http://localhost:5173 and http://127.0.0.1:5173 work,
    // and nothing is exposed to the network.
    host: '127.0.0.1',
    port: 5173,
    // For sharing the page through `ngrok http 5173`.
    allowedHosts: ['.ngrok-free.app'],
  },
});
