import { defineConfig } from 'vite';

// 5391 — adjacent to SeedThree (5390), avoids common dev ports.
// gh-pages mode sets base for https://reed-soul.github.io/SeedOcean/
export default defineConfig(({ mode }) => ({
  base: mode === 'gh-pages' ? '/SeedOcean/' : '/',
  build: {
    target: 'esnext',
  },
  server: {
    port: 5391,
    strictPort: true,
  },
  preview: {
    port: 5391,
    strictPort: true,
  },
}));
