<div align="center">

# SeedOcean

**Open-source procedural ocean and water system for Three.js (WebGPU).**

Inspired by [SeedThree](https://github.com/SkyeShark/SeedThree) — live preset tuning, scene, one-click glTF export — for the scarce browser-ocean space.

</div>

> **Status: `v0.5.0-alpha`.** Full surface pipeline, screen-space refraction/reflection, wake interaction, multi-body buoyancy, and shared underwater caustics.

## What's in it

- **FFT / JONSWAP ocean** — GPU butterfly IFFT, 3 cascades (200 m / 20 m / 3.5 m)
- **Infinite clipmap** — camera-snapped nested rings (~1.5 km)
- **Subsurface scattering** — sun-lit crest glow
- **Jacobian foam** — breaking crest detection
- **Screen refraction / reflection** — viewport backdrop + planar reflector on the surface
- **Wake field** — boat stamps height + foam into a tiling CPU texture sampled on the GPU
- **Multi-body buoyancy** — spring-damper physics with pitch/roll from wave slope
- **Underwater rendering** — depth tint, Snell's window, god rays (post-process)
- **Shared caustics** — sea floor, buoy, boat hull, and floating crates
- **Optimized readback** — buoyancy samples cascade 0 only (~3× less GPU transfer)
- **Three presets** + **glTF export**

## Roadmap

| Phase | Target |
|-------|--------|
| 1 ✅ | Scaffold, presets, export |
| 2 ✅ | WebGPU FFT/IFFT (JONSWAP) |
| 3 ✅ | Clipmap, SSS, 3rd cascade |
| 4 ✅ | Underwater, caustics, buoyancy |
| 5 ✅ | Refraction/reflection, wake, multi-body physics *(this release)* |

## Requirements

**WebGPU-capable browser** — Chrome/Edge 113+.

## Run it

```bash
npm install
npm run dev      # http://localhost:5391
```

Orbit below the surface for underwater mode. A boat leaves a wake; the red buoy and wooden crates float on the live wave field.

```bash
npm run build
npm run preview
```

## Layout

```
src/core/
  fft/                spectrum · IFFT · cascades · surface material
  clipmap.js          infinite ocean mesh
  wake-field.js       CPU wake texture (boat interaction)
  caustics.js         shared underwater caustic pattern
  submerged-material.js  caustics on floating objects
  buoyancy-body.js    multi-body spring-damper physics
  underwater-post.js  Snell + fog + god rays
  seafloor.js         caustic sea floor
  buoyancy.js         throttled height readback
  wave-sampler.js     CPU/GPU displacement sampling
  boat.js             demo boat mesh
```

## Reference

- Product pattern: [SkyeShark/SeedThree](https://github.com/SkyeShark/SeedThree)
- FFT ocean: [poseidon](https://github.com/owenyuwono/poseidon) (MIT)

## License

[MIT](LICENSE) © lushiqiang
