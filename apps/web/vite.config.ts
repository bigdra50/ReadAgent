import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // ローカルサーバー（apps/server）へ中継する。CORS を開けないための構成。
    proxy: {
      '/api': 'http://127.0.0.1:5174',
    },
  },
});
