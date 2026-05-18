import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index:     resolve(__dirname, 'index.html'),
        services:  resolve(__dirname, 'services.html'),
        contact:   resolve(__dirname, 'contact.html'),
        booking:   resolve(__dirname, 'booking.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        login:     resolve(__dirname, 'login.html'),
        setup:     resolve(__dirname, 'setup.html'),
      }
    }
  }
});
