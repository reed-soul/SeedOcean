<div align="center">

# SeedOcean

**Open-source procedural ocean and water system for Three.js (WebGPU).**

Inspired by [SeedThree](https://github.com/SkyeShark/SeedThree) — live preset tuning, scene, one-click glTF export — for the scarce browser-ocean space.

</div>

> **Status: `v0.4.0-alpha`.** Full surface pipeline plus underwater rendering, caustics, buoyancy sampling, and glTF export.

## What's in it

- **FFT / JONSWAP ocean** — GPU butterfly IFFT, 3 cascades (200 m / 20 m / 3.5 m)
- **Infinite clipmap** — camera-snapped nested rings (~1.5 km)
- **Subsurface scattering** — sun-lit crest glow
- **Jacobian foam** — breaking crest detection
- **Underwater rendering** — depth tint, Snell's window, god rays (post-process)
- **Sea floor caustics** — procedural animated light patterns
- **Buoyancy sampling** — GPU readback drives floating buoy + camera depth
- **Three presets** + **glTF export**

## Roadmap

| Phase | Target |
|-------|--------|
| 1 ✅ | Scaffold, Gerstner, presets, export |
| 2 ✅ | WebGPU FFT/IFFT (JONSWAP) |
| 3 ✅ | Clipmap, SSS, 3rd cascade |
| 4 ✅ | Underwater, caustics, buoyancy *(this release)* |

## Requirements

**WebGPU-capable browser** — Chrome/Edge 113+.

## Run it

```bash
npm install
npm run dev      # http://localhost:5391
```

Orbit below the surface to enter underwater mode. The red buoy floats on the live wave field.

```bash
npm run build
npm run preview
```

## Layout

```
src/core/
  fft/              spectrum · IFFT · cascades
  clipmap.js        infinite ocean mesh
  underwater-post.js  Snell + fog + god rays
  seafloor.js       caustic sea floor
  buoyancy.js       height sampling
  wave-sampler.js   shared CPU/GPU displacement readback
```

## Reference

- Product pattern: [SkyeShark/SeedThree](https://github.com/SkyeShark/SeedThree)
- FFT ocean: [poseidon](https://github.com/owenyuwono/poseidon) (MIT)

## License

[MIT](LICENSE) © lushiqiang
