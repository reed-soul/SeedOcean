# Sea states — morphology archive

> Cross-checked signatures for every shipping preset. Analogous to SeedThree's
> `docs/morphology.md`: each entry records what makes the look identifiable, the
> physical / artistic basis, and the knobs that carry that identity.
>
> If a preset's code drifts from its Signature, **fix the code** (or update this
> doc in the same PR with a reason).

## How to read an entry

- **Signature** — the one-sentence identification test. If you removed the name
  label, would a viewer still recognize this sea state?
- **Basis** — physical reference (Beaufort / fetch / depth) or artistic reference.
- **Carriers** — the preset fields that actually deliver the Signature. Changing
  these breaks identity; other fields are free to tune.

---

## Open ocean

### Calm Bay (`calm`)
- **Signature:** Glass-flat morning water; barely a ripple, long mirror reflections.
- **Basis:** Beaufort 0–1, sheltered fetch.
- **Carriers:** `waveAmp ≈ 0.25`, `spectrum.local.windSpeed ≈ 2`, high `reflectionStrength`.

### Dawn Glass (`dawn`)
- **Signature:** Warm low sun, peach specular, still surface with soft SSS glow.
- **Basis:** Civil dawn, low elevation sun over calm water.
- **Carriers:** `sky.elevation` low + warm, muted `waveAmp`, elevated `sssStrength`.

### Sea Mist (`mist`)
- **Signature:** Soft haze, desaturated teal, horizon dissolves into fog.
- **Basis:** Advection fog over cool water.
- **Carriers:** Higher `cloudCoverage`, cooler `waterColor`/`deepColor`, moderate chop.

### Light Breeze (`breeze`)
- **Signature:** Gentle wind-sea texture without breaking foam.
- **Basis:** Beaufort 2–3.
- **Carriers:** `windSpeed ≈ 5–7`, low `foamStrength`, short local cascade energy.

### Coastal Chop (`coastal`) — default
- **Signature:** Lively short-period chop, visible foam streaks, working harbour sea.
- **Basis:** Beaufort 4–5, moderate fetch.
- **Carriers:** `windSpeed ≈ 12`, `foamThreshold ≈ 0.42`, dual local+swell bands.

### Long Swell (`swell`)
- **Signature:** Long-period rolling hills; troughs feel deep, crests rarely break.
- **Basis:** Distant storm swell, low local wind.
- **Carriers:** Dominant `spectrum.swell`, suppressed `local.scale`, longer peak wavelength.

### Tropical Reef (`tropical`)
- **Signature:** Turquoise shallows, bright caustics, light trade-wind chop.
- **Basis:** Clear tropical lagoon over pale sand.
- **Carriers:** Warm `waterColor`/`causticColor`, shallow `seafloorDepth`, modest wind.

### Golden Sunset (`sunset`)
- **Signature:** Low amber sun, long glitter path, warm scatter in crests.
- **Basis:** Golden hour over open water.
- **Carriers:** Low `sky.elevation`, warm `scatterColor`, elevated exposure.

### Moonlit (`moonlit`)
- **Signature:** Night water under a cool moon; star field visible, silver specular.
- **Basis:** Clear night, moon as primary light.
- **Carriers:** Negative/near-zero elevation, `starsDensity > 0`, cool palette, low exposure.

### Arctic (`arctic`)
- **Signature:** Ice-cold cyan, hard specular, sparse foam, polar clarity.
- **Basis:** High-latitude open water, low biological turbidity.
- **Carriers:** Cold `waterColor`/`deepColor`, high metalness/roughness contrast, low foam.

### Bioluminescent (`bioluminescent`)
- **Signature:** Night crests glow electric cyan/green; dark troughs, living light.
- **Basis:** Dinoflagellate bloom (artistic exaggeration).
- **Carriers:** Night sky + emissive-leaning `scatterColor`/`foamColor`, high SSS on crests.

### Gale (`gale`)
- **Signature:** Steep wind-sea, frequent whitecaps, spray starting to lift.
- **Basis:** Beaufort 7–8.
- **Carriers:** High `windSpeed`, elevated `foamStrength`, `sprayIntensity > 0`.

### Open Storm (`storm`)
- **Signature:** Heavy JONSWAP sea, breaking crest foam, dark sky.
- **Basis:** Beaufort 9–10, fully developed sea.
- **Carriers:** `windSpeed` high, `foamPersistence` up, dark `deepColor`, rain optional.

### Tempest (`tempest`)
- **Signature:** Extreme sea — towering crests, dense spray + rain, near-whiteout foam.
- **Basis:** Beaufort 11–12 (capped for realtime stability — see storm crest soft-cap).
- **Carriers:** Max spectrum energy with lambda/chop attenuation, `sprayIntensity` + `rainIntensity`.

---

## Stylized

### Cartoon (`cartoon`)
- **Signature:** Cel-banded fresnel and depth; flat colour regions, hard foam edges.
- **Basis:** Wind Waker / Genshin water read (artistic).
- **Carriers:** `renderMode: 'stylized'`, `celBands ≈ 4`, suppressed refraction/reflection.

### Ink Wash (`ink`)
- **Signature:** Desaturated ink washes, soft bands, calligraphic foam.
- **Basis:** Sumi-e / brush-and-ink water.
- **Carriers:** `renderMode: 'stylized'`, muted palette, fewer/softer cel bands.

---

## Bounded water

### Swimming Pool (`pool`)
- **Signature:** Chlorine-blue rectangle in a tiled enclosure — not floating in an ocean.
- **Basis:** Outdoor swimming pool.
- **Carriers:** `waterType: 'pool'`, `pool` enclosure colors, tiny `waveAmp`, no sky dome.

### Mountain Lake (`lake`)
- **Signature:** Still emerald disc ringed by procedural hills; wet foam at the shore.
- **Basis:** Alpine tarn in a terrain basin.
- **Carriers:** `waterType: 'lake'`, `terrain.basin`, `flowmap.shore` ring, valley fog.

### River (`river`)
- **Signature:** Meandering ribbon; waves scroll downstream; objects drift with current;
  foam along the banks.
- **Basis:** Moderate mountain river.
- **Carriers:** `waterType: 'river'`, `flow`, `river.points`, `terrain.channel`,
  FlowMap river-tangent bake + shore channel.

### Coastal Surf (`surf`)
- **Signature:** Open sea meeting a sandy beach; white-water break in the shallows;
  wet foam on the swash; dunes inland.
- **Basis:** Fetch-limited coastal wind-sea over a sloping beach (Issue #10 / Phase 11c).
- **Carriers:** `waterType: 'coast'`, `terrain.beach` (crosses y=0), `flowmap.surf`
  (depth-based break + onshore rush), clipmap water + sky kept on.

---

## Capability boundary

| | Ocean | Pool | Lake | River | Coast |
|---|---|---|---|---|---|
| Mesh | Clipmap (∞) | Rect patch | Circle patch | Catmull-Rom ribbon | Clipmap (∞) |
| Enclosure | Flat seafloor | Deck/walls/tiles | fBm basin | Channel gorge | Beach slope |
| Flow | Uniform wind-sea | None | None (shore foam only) | Directional + FlowMap | Onshore rush in surf zone |
| FlowMap | Off | Off | Shore ring | Tangents + shore | Depth break + swash |
| Demo boat/crates | Yes | Buoy only | Buoy only | Buoy only | Yes |

**Not yet:** — Phase 11 complete. Next: demo-object factory decoupling, Coastal Surf media capture.

## Shoreline brush (demo)

Hold **Shift** and drag on the water plane to paint. Modes in the lil-gui **Shoreline brush** folder:

| Mode | Effect |
|------|--------|
| `shore` | Wet-foam (FlowMap.A) |
| `flow` | Directional current (RG+B) — heading follows the stroke |
| `erase` | Soft-clear toward neutral |

**Reset map** re-bakes the preset FlowMap. **Save preset JSON** downloads a `seedocean-preset/1` file with the painted pixels embedded under `flowmap.pixels` for round-trip.

---

## Adding a sea state

Follow [`docs/adding-a-preset.md`](./adding-a-preset.md). Update this file in the
same PR with a Signature / Basis / Carriers block.
