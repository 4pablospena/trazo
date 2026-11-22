import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { excalidrawAssets } from './scripts/excalidraw-assets.ts';

export default defineConfig({
  plugins: [excalidrawAssets(), react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/.research/**', '**/docs/evidence/**', '**/public/fonts/**'] },
    fs: { allow: [searchForWorkspaceRoot(fileURLToPath(new URL('.', import.meta.url))), realpathSync(new URL('./node_modules', import.meta.url))] },
  },
  preview: { port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 2000, copyPublicDir: false },
});
