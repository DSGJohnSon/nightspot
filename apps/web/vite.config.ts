import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Accessible depuis les téléphones du réseau local.
    host: true,
    port: 5173,
    proxy: {
      '/api': api,
      '/media': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
