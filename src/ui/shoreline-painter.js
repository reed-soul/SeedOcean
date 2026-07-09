// Shoreline painter — pointer strokes into the live FlowMap.
//
// Interaction: hold Shift and drag on the water plane. OrbitControls stays
// enabled for unmodified drags; Shift temporarily disables orbit so the stroke
// isn't fighting the camera. Modes (flow / shore / erase) are set by the GUI.
//
// Hit-testing is a pure math ray ∩ y=0 plane — no Mesh raycast needed, and it
// stays correct under FFT displacement (we paint in world XZ, which is what
// the FlowMap samples).

import * as THREE from 'three/webgpu';

/**
 * @typedef {'flow' | 'shore' | 'erase'} BrushMode
 *
 * @typedef {object} BrushState
 * @property {boolean} enabled
 * @property {BrushMode} mode
 * @property {number} radius       world meters
 * @property {number} strength    0..1 — flow speed or shore foam amount
 * @property {number} direction   degrees — flow heading (0 = +Z / north)
 */

/**
 * @param {object} opts
 * @param {import('../seedocean.js').SeedOcean} opts.ocean
 * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} [opts.controls]
 * @param {BrushState} [opts.brush]
 * @param {(info: { x: number, z: number, mode: BrushMode }) => void} [opts.onStroke]
 */
export function attachShorelinePainter({
  ocean,
  controls = null,
  brush = {
    enabled: true,
    mode: 'shore',
    radius: 6,
    strength: 0.85,
    direction: 0,
  },
  onStroke = null,
} = {}) {
  const dom = ocean.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  let painting = false;
  let lastX = 0;
  let lastZ = 0;
  let orbitWasEnabled = true;

  function flowMap() {
    return ocean.ocean?.flowMap ?? null;
  }

  function ndcFromEvent(e) {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** @returns {{ x: number, z: number } | null} */
  function hitWater(e) {
    ndcFromEvent(e);
    raycaster.setFromCamera(pointer, ocean.camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  function strokeAt(x, z, prevX, prevZ) {
    const map = flowMap();
    if (!map) return;

    let dirX;
    let dirZ;
    if (brush.mode === 'flow') {
      // Stroke direction from drag delta when moving; else brush.direction.
      const dx = x - prevX;
      const dz = z - prevZ;
      if (Math.hypot(dx, dz) > 0.05) {
        dirX = dx;
        dirZ = dz;
      } else {
        const rad = (brush.direction * Math.PI) / 180;
        dirX = Math.sin(rad);
        dirZ = Math.cos(rad);
      }
    } else {
      dirX = 0;
      dirZ = 1;
    }

    const speed = brush.mode === 'erase' ? 0 : brush.strength;
    const shore = brush.mode === 'shore' ? brush.strength : 0;
    const mode = brush.mode === 'erase' ? 'erase' : brush.mode === 'flow' ? 'flow' : 'shore';

    // Stamp along the segment so fast drags don't leave gaps.
    const dist = Math.hypot(x - prevX, z - prevZ);
    const step = Math.max(brush.radius * 0.35, 0.5);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = prevX + (x - prevX) * t;
      const pz = prevZ + (z - prevZ) * t;
      map.paint(px, pz, dirX, dirZ, speed, shore, brush.radius, mode);
    }
    map.upload();
    onStroke?.({ x, z, mode: brush.mode });
  }

  function onPointerDown(e) {
    if (!brush.enabled) return;
    if (!e.shiftKey || e.button !== 0) return;
    if (!flowMap()) return;

    const p = hitWater(e);
    if (!p) return;

    painting = true;
    lastX = p.x;
    lastZ = p.z;
    if (controls) {
      orbitWasEnabled = controls.enabled;
      controls.enabled = false;
    }
    dom.setPointerCapture?.(e.pointerId);
    strokeAt(p.x, p.z, p.x, p.z);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!painting) return;
    const p = hitWater(e);
    if (!p) return;
    strokeAt(p.x, p.z, lastX, lastZ);
    lastX = p.x;
    lastZ = p.z;
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!painting) return;
    painting = false;
    if (controls) controls.enabled = orbitWasEnabled;
    try { dom.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
  }

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  return {
    brush,
    /** Re-bake the preset FlowMap (wipes strokes). */
    reset() {
      ocean.resetFlowMap?.();
    },
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (controls && painting) controls.enabled = orbitWasEnabled;
      painting = false;
    },
  };
}
