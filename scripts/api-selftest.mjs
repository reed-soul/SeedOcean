#!/usr/bin/env node
/**
 * Headless Design API + FlowMap smoke tests — pure CPU, no WebGPU.
 * Run: pnpm test:api
 */
import assert from 'node:assert/strict';
import {
  describe,
  design,
  listPresets,
  getSchema,
  toPreset,
  fromPreset,
  PRESET_FORMAT,
  bakeFlowMapForPreset,
  normalizeFlowMapConfig,
  FLOWMAP_FORMAT,
} from '../src/api/seedocean.js';
import { PRESETS } from '../src/presets/index.js';

let passed = 0;
function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('Design API');

const presets = listPresets();
assert.equal(presets.length, 19);
assert.ok(presets.every((p) => p.key && p.name && p.waterType));
ok(`listPresets → ${presets.length}`);

const menu = describe();
assert.match(menu, /SeedOcean presets/);
assert.match(menu, /coastal/);
ok('describe() menu');

const coastalSchema = getSchema('coastal');
assert.equal(coastalSchema.preset, 'coastal');
assert.ok(coastalSchema.folders.spectrum.length >= 3);
ok('getSchema(coastal)');

assert.throws(() => getSchema('not-a-preset'), /unknown preset/);
ok('getSchema rejects unknown id');

const coastal = design({ preset: 'coastal', seed: 7 });
assert.ok(coastal.seaState.significantHeight > 1);
assert.ok(coastal.stats.triangles > 100);
assert.equal(coastal.terrain, null);
assert.equal(coastal.flowmap, null);
ok(`design(coastal) Hs=${coastal.seaState.significantHeight.toFixed(2)} tris=${coastal.stats.triangles}`);

const lake = design({ preset: 'lake' });
assert.ok(lake.terrain);
assert.ok(lake.terrain.maxHeight > lake.terrain.minHeight);
assert.ok(lake.flowmap);
assert.ok(lake.flowmap.shoreCoverage > 0.02 && lake.flowmap.shoreCoverage < 0.2);
assert.equal(lake.flowmap.flowCoverage, 0);
ok(`design(lake) shore=${lake.flowmap.shoreCoverage} terrain=[${lake.terrain.minHeight},${lake.terrain.maxHeight}]`);

const river = design({ preset: 'river' });
assert.ok(river.terrain);
assert.ok(river.flowmap);
assert.ok(river.flowmap.flowCoverage > 0.02);
assert.ok(river.flowmap.shoreCoverage > 0.01);
ok(`design(river) flow=${river.flowmap.flowCoverage} shore=${river.flowmap.shoreCoverage}`);

const json = toPreset({ preset: 'coastal', seed: 42, controls: { waveAmp: 1.5 } });
assert.equal(json.format, PRESET_FORMAT);
assert.equal(json.preset.waveAmp, 1.5);
assert.equal(json.preset.seed, 42);
const back = fromPreset(json);
assert.equal(back.preset.id, 'coastal');
assert.equal(back.seed, 42);
assert.equal(back.controls.waveAmp, 1.5);
ok('toPreset ↔ fromPreset round-trip');

const legacy = fromPreset({ id: 'storm', name: 'Storm', seed: 1, waveAmp: 2, waveSpeed: 1, windDirection: 0,
  waterColor: 0, deepColor: 0, scatterColor: 0, foamColor: 0, foamStrength: 1, sssStrength: 1,
  roughness: 0.1, underwaterColor: 0, godRayStrength: 0.2,
  sky: { elevation: 10, azimuth: 0, exposure: 0.3, cloudCoverage: 0.5 } });
assert.equal(legacy.preset.format, PRESET_FORMAT);
ok('fromPreset normalizes legacy (no format)');

console.log('\nFlowMap');

assert.equal(FLOWMAP_FORMAT, 'seedocean-flowmap/1');
assert.equal(normalizeFlowMapConfig(undefined, PRESETS.coastal), null);
assert.equal(normalizeFlowMapConfig(false, PRESETS.lake), null);
assert.ok(normalizeFlowMapConfig(undefined, PRESETS.lake));
ok('normalizeFlowMapConfig auto-enable / disable');

const lakeMap = bakeFlowMapForPreset(PRESETS.lake);
assert.ok(lakeMap);
const rim = lakeMap.sample(40, 0);
const center = lakeMap.sample(0, 0);
assert.ok(rim.shore > 0.5, `rim shore=${rim.shore}`);
assert.ok(center.shore < 0.05, `center shore=${center.shore}`);
lakeMap.dispose();
ok('lake shore ring peaks at disc edge');

const riverMap = bakeFlowMapForPreset(PRESETS.river);
const mid = riverMap.sample(0, -4.94);
assert.ok(mid.speed > 0.5, `mid speed=${mid.speed}`);
assert.ok(Math.hypot(mid.dirX, mid.dirZ) > 0.8);
const bank = riverMap.sample(0, -4.94 + 7);
assert.ok(bank.shore > 0.3, `bank shore=${bank.shore}`);
riverMap.dispose();
ok('river flow follows centerline + shore at channel edge');

assert.equal(bakeFlowMapForPreset(PRESETS.coastal), null);
assert.equal(bakeFlowMapForPreset(PRESETS.pool), null);
ok('ocean/pool skip FlowMap');

console.log(`\n${passed} assertions passed.`);
