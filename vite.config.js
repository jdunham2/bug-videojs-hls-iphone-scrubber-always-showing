import { defineConfig } from 'vite';

// Relative asset paths so the build works under any subpath,
// e.g. https://<user>.github.io/<repo>/ on GitHub Pages.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
