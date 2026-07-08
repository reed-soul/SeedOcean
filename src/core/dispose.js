// Shared teardown for ocean meshes and scene enclosures.

/** Dispose geometries/materials on a seafloor / terrain / pool group. */
export function disposeSeafloor(seafloor) {
  if (!seafloor?.mesh) return;
  seafloor.mesh.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const { material } = child;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose());
    else material?.dispose();
  });
}

/** Dispose a demo object mesh and its buoyancy body. */
export function disposeDemoObject(scene, buoyancySystem, object) {
  if (!object) return;
  buoyancySystem?.remove?.(object);
  scene.remove(object);
  object.traverse?.((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const { material } = child;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose());
    else material?.dispose();
  });
}

/**
 * Tear down an FFT or Gerstner ocean handle returned by buildFFTOcean /
 * buildGerstnerOcean. Caller removes `ocean.root` from the scene.
 */
export function disposeOcean(ocean) {
  if (!ocean) return;

  const mesh = ocean.mesh;
  if (mesh) {
    mesh.geometry?.dispose();
    const { material } = mesh;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose());
    else material?.dispose();
  }

  ocean.detailTex?.dispose?.();
  ocean.wakeField?.texture?.dispose?.();
  ocean.flowMap?.dispose?.();

  const reflector = ocean.reflector;
  if (reflector) {
    reflector.target?.geometry?.dispose();
    reflector.getRenderTarget?.()?.dispose?.();
  }
}
