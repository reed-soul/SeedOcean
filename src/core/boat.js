// Simple procedural boat mesh for wake / buoyancy demo.

import * as THREE from 'three/webgpu';

/**
 * @param {THREE.Material} [hullMaterial] — optional caustic-aware hull material
 */
export function buildBoat(hullMaterial = null) {
  const group = new THREE.Group();
  group.name = 'Boat';

  const hullMat = hullMaterial ?? new THREE.MeshStandardNodeMaterial({
    color: 0xc8d4dc,
    roughness: 0.45,
    metalness: 0.12,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.9, 2.2), hullMat);
  hull.position.y = -0.15;
  hull.name = 'Hull';
  group.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 4), hullMat);
  bow.rotation.x = Math.PI * 0.5;
  bow.rotation.y = Math.PI * 0.25;
  bow.position.set(3.6, -0.05, 0);
  group.add(bow);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.1, 1.6),
    new THREE.MeshStandardNodeMaterial({ color: 0xf2f6fa, roughness: 0.35 }),
  );
  cabin.position.set(-0.6, 0.55, 0);
  group.add(cabin);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6),
    new THREE.MeshStandardNodeMaterial({ color: 0x8a6a4a, roughness: 0.7 }),
  );
  mast.position.set(0.8, 1.6, 0);
  group.add(mast);

  group.position.set(-14, 0, 10);
  group.rotation.y = Math.PI * 0.15;
  return group;
}
