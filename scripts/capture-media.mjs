// Capture README hero, preset matrix, and feature shots from the live demo.
//
// v0.6 layout:
//   docs/assets/hero.webp           — big top-of-README hero (storm, low angle)
//   docs/assets/presets/<id>.webp   — one thumbnail per showcase preset
//   docs/assets/wake.webp           — boat + wake close-up (coastal)
//   docs/assets/underwater.webp     — below-surface (coastal)
//   docs/assets/demo.gif            — animated loop (coastal → storm sweep)
//
// Screenshots are captured as PNG (playwright output) then transcoded to WebP
// q85 via cwebp — ~85% smaller than PNG with no visible banding on the smooth
// gradients of sky and water. Each preset shot waits SETTLE_MS for persistent
// foam / rain / spray to reach steady state before capturing.

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'assets');
const PORT = 5393;
const BASE = `http://localhost:${PORT}`;
const SETTLE_MS = 7000;

// Showcases that read distinctly in a thumbnail row.
const PRESET_SHOTS = [
  { id: 'dawn', cam: [4, 6, 30], look: [0, 1, 0] },
  { id: 'coastal', cam: [-6, 5, 28], look: [-12, 1, 10] },
  { id: 'swell', cam: [10, 8, 36], look: [0, 0, 0] },
  { id: 'sunset', cam: [-8, 5, 26], look: [0, 1, -6] },
  { id: 'storm', cam: [6, 9, 34], look: [0, 1, 0] },
  { id: 'tempest', cam: [0, 10, 38], look: [0, 0, -8] },
];

function waitForServer(ms = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(BASE);
        if (res.ok) return resolve();
      } catch { /* retry */ }
      if (Date.now() - start > ms) return reject(new Error('Preview server did not start'));
      setTimeout(tick, 300);
    };
    tick();
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/** Capture via playwright as PNG, then transcode to WebP q85 (no banding). */
async function shot(page, webpPath) {
  const tmpPng = webpPath.replace(/\.webp$/, '.png');
  await page.screenshot({ path: tmpPng });
  await run('cwebp', ['-q', '85', '-quiet', tmpPng, '-o', webpPath]);
  await rm(tmpPng, { force: true });
}

async function setCamera(page, cam, look) {
  await page.evaluate(([c, l]) => {
    const o = window.__seedOcean;
    if (!o?.camera) return;
    o.camera.position.set(c[0], c[1], c[2]);
    o.camera.lookAt(l[0], l[1], l[2]);
  }, [cam, look]);
}

async function applyPreset(page, id) {
  await page.evaluate((p) => window.__seedOcean?.applyPreset(p), id);
}

const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env },
});

preview.stderr.on('data', (d) => process.stderr.write(d));

try {
  await run('pnpm', ['run', 'build'], { cwd: ROOT });
  await waitForServer();
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=swiftshader-webgl'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const hasWebGPU = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
  if (!hasWebGPU) {
    await browser.close();
    throw new Error('__NO_WEBGPU__');
  }

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(SETTLE_MS);

  // ---- Hero: storm at a dramatic low-wide angle ----
  await applyPreset(page, 'storm');
  await setCamera(page, [4, 7, 30], [0, 1, -4]);
  await page.waitForTimeout(SETTLE_MS);
  await shot(page, path.join(OUT, 'hero.webp'));
  console.log('Wrote docs/assets/hero.png');

  // ---- Preset matrix ----
  const presetDir = path.join(OUT, 'presets');
  await rm(presetDir, { recursive: true, force: true });
  await mkdir(presetDir, { recursive: true });
  for (const { id, cam, look } of PRESET_SHOTS) {
    await applyPreset(page, id);
    await setCamera(page, cam, look);
    await page.waitForTimeout(SETTLE_MS);
    await shot(page, path.join(presetDir, `${id}.webp`));
    console.log(`Wrote docs/assets/presets/${id}.png`);
  }

  // ---- Feature shots (coastal) ----
  await applyPreset(page, 'coastal');
  await setCamera(page, [-6, 5, 28], [-12, 1, 10]);
  await page.waitForTimeout(SETTLE_MS);
  await shot(page, path.join(OUT, 'wake.webp'));
  console.log('Wrote docs/assets/wake.png');

  await page.evaluate(() => {
    const cam = window.__seedOcean?.camera;
    if (cam) {
      cam.position.set(2, -8, 16);
      cam.lookAt(0, -4, 0);
    }
  });
  await page.waitForTimeout(SETTLE_MS);
  await shot(page, path.join(OUT, 'underwater.webp'));
  console.log('Wrote docs/assets/underwater.png');

  // ---- GIF: slow preset sweep (coastal → swell → gale → storm) ----
  const sweep = ['coastal', 'swell', 'gale', 'storm'];
  const frames = [];
  for (const id of sweep) {
    await applyPreset(page, id);
    await setCamera(page, [6, 7, 32], [0, 1, -2]);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 5; i++) {
      frames.push(await page.screenshot({ type: 'png' }));
      await page.waitForTimeout(220);
    }
  }
  await browser.close();

  const frameDir = path.join(OUT, 'frames');
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  for (let i = 0; i < frames.length; i++) {
    await writeFile(path.join(frameDir, `frame-${String(i).padStart(2, '0')}.png`), frames[i]);
  }

  try {
    await run('ffmpeg', [
      '-y', '-framerate', '10',
      '-i', path.join(frameDir, 'frame-%02d.png'),
      '-vf', 'scale=960:-1:flags=lanczos',
      path.join(OUT, 'demo.gif'),
    ]);
    console.log('Wrote docs/assets/demo.gif');
  } catch {
    console.warn('ffmpeg not available — GIF skipped (PNG frames saved in docs/assets/frames/)');
  }
} catch (e) {
  if (e?.message === '__NO_WEBGPU__') {
    console.warn('WebGPU unavailable — generating placeholder media');
    await import('./generate-placeholder-media.mjs');
  } else {
    console.error(e?.message ?? e);
    process.exitCode = 1;
  }
} finally {
  preview.kill('SIGTERM');
}
