#!/usr/bin/env node
/**
 * Capture a single preset thumbnail into docs/assets/presets/<id>.webp.
 * Usage: node scripts/capture-preset.mjs surf
 *        node scripts/capture-preset.mjs surf --cam=-20,8,30 --look=0,1,12
 *
 * Does NOT wipe sibling presets (unlike the full capture-media sweep).
 */
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'assets', 'presets');
const PORT = 5394;
const BASE = `http://localhost:${PORT}`;
const SETTLE_MS = 7000;

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/capture-preset.mjs <presetId> [--cam=x,y,z] [--look=x,y,z]');
  process.exit(1);
}

function parseVec(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (!arg) return fallback;
  return arg.slice(flag.length + 3).split(',').map(Number);
}

// Sensible per-preset framing; override with --cam / --look.
const FRAMES = {
  surf: { cam: [-22, 7, 28], look: [0, 1, 10] },
  lake: { cam: [18, 12, 42], look: [0, 2, 0] },
  river: { cam: [0, 14, 40], look: [20, 1, 0] },
  pool: { cam: [12, 10, 18], look: [0, 0, 0] },
  coastal: { cam: [-6, 5, 28], look: [-12, 1, 10] },
};
const frame = FRAMES[id] ?? { cam: [8, 8, 32], look: [0, 1, 0] };
const cam = parseVec('cam', frame.cam);
const look = parseVec('look', frame.look);

function waitForServer(ms = 25000) {
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

async function toWebp(pngPath, webpPath) {
  try {
    await run('cwebp', ['-q', '85', '-quiet', pngPath, '-o', webpPath]);
    return;
  } catch { /* fall through */ }
  // ffmpeg libwebp fallback when cwebp isn't installed.
  await run('ffmpeg', ['-y', '-i', pngPath, '-quality', '85', webpPath], { stdio: 'pipe' });
}

const preview = spawn(
  'pnpm',
  ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: 'pipe', env: { ...process.env } },
);
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

  // Boot directly into the preset so waterType mesh is correct from frame 0.
  await page.goto(`${BASE}/?preset=${encodeURIComponent(id)}`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForFunction(() => Boolean(window.__seedOcean), null, { timeout: 60000 });
  await page.evaluate(([c, l]) => {
    const o = window.__seedOcean;
    o.camera.position.set(c[0], c[1], c[2]);
    o.camera.lookAt(l[0], l[1], l[2]);
  }, [cam, look]);
  await page.waitForTimeout(SETTLE_MS);

  const webpPath = path.join(OUT, `${id}.webp`);
  const tmpPng = path.join(OUT, `${id}.png`);
  await page.screenshot({ path: tmpPng });
  await browser.close();
  await toWebp(tmpPng, webpPath);
  await rm(tmpPng, { force: true });
  console.log(`Wrote ${path.relative(ROOT, webpPath)}`);
} catch (e) {
  if (e?.message === '__NO_WEBGPU__') {
    console.warn('WebGPU unavailable — cannot capture live preset shot');
    process.exitCode = 2;
  } else {
    console.error(e?.message ?? e);
    process.exitCode = 1;
  }
} finally {
  preview.kill('SIGTERM');
}
