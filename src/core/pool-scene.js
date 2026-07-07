// Swimming-pool enclosure — deck + pool walls + tiled floor + perimeter walls.
// Replaces the 2400m flat seafloor for the `pool` waterType so the bounded
// 25m water patch reads as a real pool in a room, not a patch floating in the
// sea. Returns a Group (added to the scene as `this.seafloor.mesh`) plus the
// same handle shape ({ mesh, updateUnderwater }) as buildSeafloor so the
// orchestrator is agnostic.
//
// Convention: water surface is at y=0. Pool floor sits at y = poolDepth (≈-4),
// deck tops at y≈+0.15 (just above waterline), perimeter walls rise to
// wallHeight (≈+4) so the horizon is occluded and the scene reads as enclosed.

import * as THREE from 'three/webgpu';
import { Fn, positionWorld, mix, uniform, time, float } from 'three/tsl';
import { causticsPattern, causticsSunLit } from './caustics.js';

/**
 * @param {object} preset
 * @param {import('three/tsl').UniformNode<THREE.Vector3>} [sunDir]
 */
export function buildPoolScene(preset, sunDir) {
  const patch = preset.patch ?? { width: 25, length: 25 };
  const poolW = patch.width;
  const poolL = patch.length;
  const poolDepth = Math.abs(preset.seafloorDepth ?? -4); // positive depth
  const deckWidth = preset.pool?.deckWidth ?? 6;          // deck strip width around the pool
  const wallHeight = preset.pool?.wallHeight ?? 4.5;      // perimeter wall height
  const tileColor = preset.pool?.tileColor ?? 0x2a6a78;   // pool interior tiles
  const deckColor = preset.pool?.deckColor ?? 0xdedede;   // deck / walkway
  const wallColor = preset.pool?.wallColor ?? 0x9a9a96;   // perimeter walls
  const groutColor = preset.pool?.groutColor ?? 0x1a3a44;

  const group = new THREE.Group();
  group.name = 'SeedOcean_PoolScene';

  // ---- Materials ----
  // Pool interior (walls + floor): caustic-aware, like the seafloor.
  const underwaterMix = uniform(0);
  const tileMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.0 });
  const tileUniform = uniform(new THREE.Color(tileColor));
  const causticUniform = uniform(new THREE.Color(preset.causticColor ?? 0xaaffff));
  const causticStrength = uniform(preset.causticStrength ?? 0.85);
  tileMat.colorNode = Fn(() => {
    const caustics = causticsPattern(positionWorld.xz, time);
    const sunLit = sunDir ? causticsSunLit(sunDir) : float(1);
    const lit = caustics.mul(causticStrength).mul(sunLit).mul(underwaterMix);
    return mix(tileUniform, causticUniform, lit);
  })();

  const deckMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(deckColor), roughness: 0.85, metalness: 0.0,
  });
  const wallMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(wallColor), roughness: 0.9, metalness: 0.0,
  });
  const groutMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(groutColor), roughness: 0.8, metalness: 0.0,
  });

  const halfW = poolW / 2;
  const halfL = poolL / 2;

  // ---- Pool floor (tiled, at y = -poolDepth) ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(poolW, poolL), tileMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -poolDepth;
  floor.name = 'PoolFloor';
  group.add(floor);

  // ---- Pool interior walls (4 sides, from y=0 down to y=-poolDepth) ----
  const wallH = poolDepth;
  // Long walls (along X axis, at z = ±halfL)
  const wallNS = new THREE.Mesh(new THREE.BoxGeometry(poolW, wallH, 0.2), tileMat);
  wallNS.position.set(0, -wallH / 2, -halfL);
  group.add(wallNS);
  const wallN2 = wallNS.clone(); wallN2.position.z = halfL; group.add(wallN2);
  // Short walls (along Z axis, at x = ±halfW)
  const wallEW = new THREE.Mesh(new THREE.BoxGeometry(0.2, wallH, poolL), tileMat);
  wallEW.position.set(-halfW, -wallH / 2, 0);
  group.add(wallEW);
  const wallE2 = wallEW.clone(); wallE2.position.x = halfW; group.add(wallE2);

  // ---- Deck: ring of walkway around the pool, top at y≈+0.15 ----
  // Built as 4 boxes (top ring). Outer extent = pool + 2*deckWidth.
  const deckY = 0.15;
  const deckThick = 0.4;
  const outerW = poolW + 2 * deckWidth;
  const outerL = poolL + 2 * deckWidth;
  // Four deck slabs framing the pool hole. Each is a box; together they ring the pool.
  // Top slabs (along X, at z = ±(halfL + deckWidth/2))
  const deckTop = new THREE.Mesh(
    new THREE.BoxGeometry(outerW, deckThick, deckWidth), deckMat,
  );
  deckTop.position.set(0, deckY - deckThick / 2, halfL + deckWidth / 2);
  group.add(deckTop);
  const deckBot = deckTop.clone(); deckBot.position.z = -(halfL + deckWidth / 2); group.add(deckBot);
  // Side slabs (along Z, at x = ±(halfW + deckWidth/2)), length = poolL (the gap between top/bot slabs)
  const deckSide = new THREE.Mesh(
    new THREE.BoxGeometry(deckWidth, deckThick, poolL), deckMat,
  );
  deckSide.position.set(halfW + deckWidth / 2, deckY - deckThick / 2, 0);
  group.add(deckSide);
  const deckSide2 = deckSide.clone(); deckSide2.position.x = -(halfW + deckWidth / 2); group.add(deckSide2);

  // ---- Deck edge curbs (a thin lip where deck meets the pool, grout-colored) ----
  // Gives the pool a visible rim at the waterline.
  const curbH = 0.12;
  const curb = (geo, x, z) => {
    const m = new THREE.Mesh(geo, groutMat);
    m.position.set(x, curbH / 2, z);
    group.add(m);
  };
  curb(new THREE.BoxGeometry(poolW, curbH, 0.15), 0, -halfL - 0.05);
  curb(new THREE.BoxGeometry(poolW, curbH, 0.15), 0, halfL + 0.05);
  curb(new THREE.BoxGeometry(0.15, curbH, poolL), -halfW - 0.05, 0);
  curb(new THREE.BoxGeometry(0.15, curbH, poolL), halfW + 0.05, 0);

  // ---- Perimeter enclosure walls (rise to wallHeight, occluding the horizon) ----
  // Set at the outer deck edge. These are what make the scene read as a pool
  // room rather than open sky down to an ocean horizon.
  const wallY = wallHeight / 2;
  const wallT = 0.4;
  const pWallN = new THREE.Mesh(
    new THREE.BoxGeometry(outerW + wallT, wallHeight, wallT), wallMat,
  );
  pWallN.position.set(0, wallY, -(outerL / 2));
  group.add(pWallN);
  const pWallS = pWallN.clone(); pWallS.position.z = outerL / 2; group.add(pWallS);
  const pWallW = new THREE.Mesh(
    new THREE.BoxGeometry(wallT, wallHeight, outerL + wallT), wallMat,
  );
  pWallW.position.set(-outerW / 2, wallY, 0); group.add(pWallW);
  const pWallE = pWallW.clone(); pWallE.position.x = outerW / 2; group.add(pWallE);

  // ---- Ground outside the deck (so the perimeter walls don't float) ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(outerW + wallT, outerL + wallT), deckMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = deckY - deckThick;
  group.add(ground);

  group.frustumCulled = false;
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  return {
    mesh: group,
    uniforms: { underwaterMix, causticStrength },
    /** @param {number} m */
    updateUnderwater(m) { underwaterMix.value = m; },
  };
}
