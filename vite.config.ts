import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative paths so the site works on GitHub Pages (served under /moroccan-squad-clash/)
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
