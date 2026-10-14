/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    // IPv4 loopback: both http://localhost:5173 and http://127.0.0.1:5173 work,
    // and nothing is exposed to the network.
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
