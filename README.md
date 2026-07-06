<div align="center">

# SeedOcean

**Open-source procedural ocean and water system for Three.js (WebGPU).**

Inspired by [SeedThree](https://github.com/SkyeShark/SeedThree) — live preset tuning, scene, one-click glTF export — for the scarce browser-ocean space.

</div>

> **Status: `v0.2.0-alpha`.** WebGPU FFT/JONSWAP ocean with Jacobian foam, multi-cascade displacement, and `.glb` export. Underwater path and clipmap LOD are next.

## What's in it

- **FFT / JONSWAP ocean** — GPU butterfly IFFT (Stockham), Horvath directional spectrum, Tessendorf-style displacement
- **Two cascades** — 128² grid per cascade, summed for wide wavelength coverage
- **Three presets** — Calm Bay, Coastal Chop, Open Storm (wind, seed, colors, sky)
- **Jacobian foam** — crest-breaking detection with persistent turbulence
- **Living sky** — `SkyMesh` atmosphere with sun + cloud controls
- **glTF export** — GPU buffer readback → baked wave surface `.glb`

Spectrum / FFT code adapted from [poseidon](https://github.com/owenyuwono/poseidon) and [gasgiant/FFT-Ocean](https://github.com/gasgiant/FFT-Ocean) (MIT).

## Roadmap

| Phase | Target |
|-------|--------|
| **1** ✅ | Scaffold, Gerstner ocean, presets, export |
| **2** ✅ | WebGPU FFT/IFFT (JONSWAP spectrum) *(this release)* |
| **3** | Infinite clipmap, subsurface scattering, 3rd cascade |
| **4** | Underwater rendering, caustics, buoyancy sampling |

## Requirements

**WebGPU-capable browser** — Chrome/Edge 113+.

## Run it

```bash
npm install
npm run dev      # http://localhost:5391
```

Drag to orbit. Use the panel to switch presets, reseed, tune wind and colors, export.

```bash
npm run build
npm run preview
```

## Layout

```
src/
  core/
    fft/           spectrum, butterfly IFFT, cascades, maps
    fft-ocean.js   simulator + mesh integration
    environment.js sky / sun
    export-glb.js  FFT-aware glb baking
  presets/         calm · coastal · storm
  ui/              lil-gui panel
```

## Reference

- Product pattern: [SkyeShark/SeedThree](https://github.com/SkyeShark/SeedThree)
- FFT ocean: Tessendorf 2001, Horvath 2015 JONSWAP spectrum

## License

[MIT](LICENSE) © lushiqiang
