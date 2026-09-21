import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Customer admin — deployed on the main domain.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env.local at the repo root serves every app.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          data: ['@neondatabase/neon-js', '@tanstack/react-query'],
        },
      },
    },
  },
  server: { port: Number(process.env.PORT) || 5174 },
});
