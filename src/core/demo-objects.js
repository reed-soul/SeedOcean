// Demo buoyancy props — buoy / boat / crates.
//
// Decoupled from SeedOcean so integrators can:
//   • pass `demoObjects: false` (nothing)
//   • pass `demoObjects: true` / omit → default factory (waterType-aware)
//   • pass a config object `{ buoy?, boat?, crates? }` to toggle pieces
//   • pass a factory `(ctx) => DemoObjectsHandle` for full control
//
// The default factory still encodes the scale rule: enclosed basins
// (pool/lake/river) get only the buoy; open water + coast get the full set.

import * as THREE from 'three/webgpu';
import { BuoyancyBody } from './buoyancy-body.js';
import { buildBoat } from './boat.js';
import { createSubmergedMaterial } from './submerged-material.js';
import { waterTypeOf, isEnclosed } from './water-types.js';

/**
 * @typedef {object} DemoObjectsContext
 * @property {object} preset
 * @property {import('three').Scene} scene
 * @property {object} ocean — FFT/Gerstner handle (needs shading.sunDir)
 * @property {import('./buoyancy-body.js').BuoyancySystem} [buoyancySystem]
 * @property {import('three/tsl').UniformNode<number>} submergedMix
 */

/**
 * @typedef {object} DemoObjectsHandle
 * @property {import('three').Object3D | null} [buoy]
 * @property {import('three').Object3D | null} [boat]
 * @property {import('three').Object3D[]} [crates]
 */

/**
 * @typedef {object} DemoObjectsConfig
 * @property {boolean} [buoy=true]
 * @property {boolean} [boat] — default: !enclosed
 * @property {boolean} [crates] — default: !enclosed
 * @property {[number, number, number]} [buoyPosition]
 * @property {Array<[number, number]>} [cratePositions]
 */

/**
 * Resolve the `demoObjects` option into a concrete handle (or null).
 *
 * @param {boolean | DemoObjectsConfig | ((ctx: DemoObjectsContext) => DemoObjectsHandle) | undefined} option
 * @param {DemoObjectsContext} ctx
 * @returns {DemoObjectsHandle | null}
 */
export function resolveDemoObjects(option, ctx) {
  if (option === false || option == null) return null;
  if (typeof option === 'function') return option(ctx) ?? null;
  if (option === true) return buildDefaultDemoObjects(ctx);
  // Config object — merge onto waterType defaults.
  return buildDefaultDemoObjects(ctx, option);
}

/**
 * Default demo set. Enclosed water → buoy only; open/coast → buoy+boat+crates.
 *
 * @param {DemoObjectsContext} ctx
 * @param {DemoObjectsConfig} [cfg]
 * @returns {DemoObjectsHandle}
 */
export function buildDefaultDemoObjects(ctx, cfg = {}) {
  const { preset, scene, ocean, buoyancySystem, submergedMix } = ctx;
  const enclosed = isEnclosed(waterTypeOf(preset));
  const wantBuoy = cfg.buoy !== false;
  const wantBoat = cfg.boat ?? !enclosed;
  const wantCrates = cfg.crates ?? !enclosed;
  const buoyPos = cfg.buoyPosition ?? defaultBuoyPosition(waterTypeOf(preset));
  const cratePositions = cfg.cratePositions ?? [[12, -8], [-10, 14], [18, 6]];

  /** @type {DemoObjectsHandle} */
  const handle = { buoy: null, boat: null, crates: [] };
  const caustic = preset.causticColor ?? 0x3a8a9a;
  const sunDir = ocean.shading.sunDir;

  if (wantBuoy) {
    const buoyMat = createSubmergedMaterial(
      0xff5533, caustic, sunDir, submergedMix, { causticStrength: 0.65 },
    );
    const buoy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 1.2, 12),
      buoyMat.material,
    );
    buoy.position.set(buoyPos[0], buoyPos[1], buoyPos[2]);
    buoy.name = 'Buoy';
    scene.add(buoy);
    buoyancySystem?.add(new BuoyancyBody(buoy, {
      buoyancyOffset: 0.75,
      samples: [[0, 0]],
      springK: 28,
      damping: 6,
    }));
    handle.buoy = buoy;
  }

  if (wantBoat) {
    const boatHullMat = createSubmergedMaterial(
      0xc8d4dc, caustic, sunDir, submergedMix,
      { causticStrength: 0.48, roughness: 0.45, metalness: 0.12 },
    );
    const boat = buildBoat(boatHullMat.material);
    scene.add(boat);
    buoyancySystem?.add(new BuoyancyBody(boat, {
      buoyancyOffset: 0.35,
      samples: [[0, 0], [2.2, 0], [-2.2, 0], [0, 0.9], [0, -0.9]],
      springK: 14,
      damping: 4.5,
      maxTilt: 0.22,
    }));
    handle.boat = boat;
  }

  if (wantCrates) {
    for (const [cx, cz] of cratePositions) {
      const crateMat = createSubmergedMaterial(
        0xc49a6c, caustic, sunDir, submergedMix,
        { causticStrength: 0.5, roughness: 0.75 },
      );
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat.material);
      crate.position.set(cx, 0.7, cz);
      crate.name = 'Crate';
      scene.add(crate);
      handle.crates.push(crate);
      buoyancySystem?.add(new BuoyancyBody(crate, {
        buoyancyOffset: 0.7,
        samples: [[0, 0]],
        springK: 32,
        damping: 7,
        maxTilt: 0.12,
      }));
    }
  }

  return handle;
}

/** Coast puts the buoy nearer the surf line; open ocean keeps the classic offset. */
function defaultBuoyPosition(waterType) {
  if (waterType === 'coast') return [4, 0.6, -18];
  if (waterType === 'lake') return [8, 0.6, 4];
  if (waterType === 'river') return [0, 0.6, 0];
  if (waterType === 'pool') return [2, 0.6, 2];
  return [6, 0.6, -4];
}
