# Adding a preset

> **This doc is the contract.** If the code and this doc disagree, the doc wins — fix the code.
> Three steps. No more. An agent (or a human) following these steps must produce a working preset.

## Step 1 — Write the preset file

Create `src/presets/<id>.js`. Export a single named object that satisfies the `Preset` interface
(`src/seedocean.d.ts`). Minimum required fields:

```js
export const misty = {
  id: 'misty',                 // must match the filename stem
  name: 'Misty Cove',
  description: 'One-line signature — what makes this sea state identifiable.',
  seed: 1337,
  waveAmp: 0.6,
  waveSpeed: 0.8,
  windDirection: 120,
  waterColor: 0x0a5f7a,
  deepColor: 0x021a2b,
  scatterColor: 0x2e8f8f,
  foamColor: 0xd0ecff,
  foamStrength: 0.25,
  sssStrength: 0.8,
  roughness: 0.1,
  underwaterColor: 0x043a55,
  godRayStrength: 0.2,
  sky: { elevation: 12, azimuth: 120, exposure: 0.35, turbidity: 8, cloudCoverage: 0.55 },
  spectrum: {
    lambda: 1.0,
    local: { windSpeed: 6, scale: 0.7, swell: 0.15 },
    swell: { windSpeed: 2, scale: 0.5 },
  },
};
```

Do **not** put `format: 'seedocean-preset/1'` in the data file — `normalizePreset` stamps it at
registry construction so the on-disk files stay clean.

### Water-type extras

| `waterType` | Extra fields | Notes |
|---|---|---|
| *(omit / `'ocean'`)* | — | Infinite clipmap. Default. |
| `'pool'` | `pool?: {…}`, `patch?: {…}` | Rectangular patch + tiled enclosure. |
| `'lake'` | `patch`, `terrain: { basin: true, … }`, `flowmap?`, `fog?`, `scene?` | Circular disc in an fBm basin. Shore foam auto-bakes. |
| `'river'` | `flow`, `river: { points, width, … }`, `terrain: { channel: true, … }`, `flowmap?` | Ribbon mesh + directional current. |

See `docs/sea-states.md` for the Signature of every shipping preset, and
`src/core/flow-map.js` for the `seedocean-flowmap/1` channel contract.

## Step 2 — Register

Edit `src/presets/index.js`:

1. Add `export { misty } from './misty.js';` at the top.
2. `import { misty } from './misty.js';` in the import block.
3. Add `misty: normalizePreset(misty),` to the `PRESETS` object — place it in the narrative order
   (calm → storm, with bounded water after stylized).

That is the entire registration surface. `PRESET_LIST`, the Design API, the web component, and
the lil-gui dropdown all read from `PRESETS`.

## Step 3 — Verify

```bash
pnpm test:api          # headless: listPresets includes your id, design() returns stats
pnpm build:types       # Preset interface still type-checks
pnpm dev               # visual: pick the preset in the GUI, orbit, check underwater
```

For lake/river, also assert the FlowMap bake:

```js
import { design } from 'seedocean/api';
const { flowmap } = design({ preset: 'misty' });
// lake: shoreCoverage in ~0.03..0.15, flowCoverage ≈ 0
// river: flowCoverage > 0, shoreCoverage > 0
```

Optional: `pnpm capture` regenerates `docs/assets/presets/<id>.webp` once the look is locked.

## Checklist (copy into the PR)

- [ ] `src/presets/<id>.js` exports `{ id, name, … }` matching the filename
- [ ] Registered in `src/presets/index.js` (export + import + `PRESETS` entry)
- [ ] `pnpm test:api` green
- [ ] `pnpm build:types` green
- [ ] Signature added to `docs/sea-states.md`
- [ ] (visual) Screenshot or GIF attached / `docs/assets/presets/<id>.webp` updated
