import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Listen on the local network too, so the dev server can be opened from a phone.
  server: { host: true },
});
