<div align="center">

# SeedOcean

**Open-source procedural ocean and water system for Three.js (WebGPU).**

Inspired by [SeedThree](https://github.com/SkyeShark/SeedThree) — live preset tuning, scene, one-click glTF export — for the scarce browser-ocean space.

</div>

> **Status: `v0.3.0-alpha`.** Infinite clipmap ocean, 3-cascade FFT/JONSWAP, subsurface scattering, Jacobian foam, and `.glb` export. Underwater rendering is next.

## What's in it

- **FFT / JONSWAP ocean** — GPU butterfly IFFT, Horvath directional spectrum (MIT, poseidon / FFT-Ocean)
- **3 cascades** — 128² grid each, length scales 200 m / 20 m / 3.5 m
- **Infinite clipmap** — 4 nested rings, camera-snapped, ~1.5 km extent
- **Subsurface scattering** — sun-lit crest glow with adjustable strength
- **Jacobian foam** — persistent turbulence on breaking crests
- **Three presets** — Calm Bay, Coastal Chop, Open Storm
- **glTF export** — GPU buffer readback → baked wave surface

## Roadmap

| Phase | Target |
|-------|--------|
| **1** ✅ | Scaffold, Gerstner, presets, export |
| **2** ✅ | WebGPU FFT/IFFT (JONSWAP) |
| **3** ✅ | Clipmap, SSS, 3rd cascade *(this release)* |
| **4** | Underwater rendering, caustics, buoyancy |

## Requirements

**WebGPU-capable browser** — Chrome/Edge 113+.

## Run it

```bash
npm install
npm run dev      # http://localhost:5391
```

Drag to orbit — the ocean follows the camera. Tune wind, SSS, foam, and export a `.glb`.

```bash
npm run build
npm run preview
```

## Layout

```
src/core/
  fft/           spectrum · IFFT · cascades · maps
  clipmap.js     nested-ring geometry + camera snap
  fft-ocean.js   integration
  export-glb.js  FFT-aware export
```

## Reference

- Product pattern: [SkyeShark/SeedThree](https://github.com/SkyeShark/SeedThree)
- FFT ocean: Tessendorf 2001, Horvath 2015, [poseidon](https://github.com/owenyuwono/poseidon) (MIT)

## License

[MIT](LICENSE) © lushiqiang
