<div align="center">

# SeedOcean

**Open-source procedural ocean and water system for Three.js (WebGPU).**

Inspired by [SeedThree](https://github.com/SkyeShark/SeedThree) — the same product shape (live preset tuning, scene, one-click glTF export), applied to the scarce browser-ocean space.

</div>

> **Status: `v0.1.0-alpha`.** Gerstner swell, sky, presets, and `.glb` export are in. FFT/IFFT compute, underwater path, and cascade foam are next.

## What's in it (Phase 1)

- **Three ocean presets** — Calm Bay, Coastal Chop, Open Storm
- **Gerstner wave stack** — 4-wave procedural displacement on a 256² ocean plane (TSL / WebGPU)
- **Living sky** — `SkyMesh` atmosphere with sun + cloud controls
- **Control panel** — seed, amplitude, speed, water colors, foam, exposure
- **glTF export** — bakes the current wave surface to a downloadable `.glb`

## Roadmap

| Phase | Target |
|-------|--------|
| **1** ✅ | Scaffold, Gerstner ocean, presets, export *(this release)* |
| **2** | WebGPU FFT/IFFT (JONSWAP spectrum) |
| **3** | Foam, subsurface scattering, infinite clipmap |
| **4** | Underwater rendering, caustics, buoyancy sampling |

## Requirements

**WebGPU-capable browser** — Chrome/Edge 113+. This project targets WebGPU only (no WebGL fallback yet).

## Run it

```bash
npm install
npm run dev      # http://localhost:5391
```

Drag to orbit. Use the panel to switch presets, reseed, tune waves, and export.

```bash
npm run build
npm run preview
```

## Layout

```
src/
  core/        gerstner waves, ocean mesh, sky, glb export
  presets/     one file per environment preset
  ui/          lil-gui panel + theme
```

## Reference

- Product pattern: [SkyeShark/SeedThree](https://github.com/SkyeShark/SeedThree)
- Ocean algorithms (planned): Tessendorf 2001, JONSWAP spectrum, WebGPU compute FFT

## License

[MIT](LICENSE) © lushiqiang
