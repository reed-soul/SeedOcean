import { defineConfig } from 'vite';

// 5391 — adjacent to SeedThree (5390), avoids common dev ports.
export default defineConfig({
  build: {
    // WebGPU + three.js r184 use top-level await in the WebGPU capability probe.
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
});
