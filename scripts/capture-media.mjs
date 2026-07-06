// Capture README screenshots and animated GIF from the live demo.

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'assets');
const PORT = 5393;
const BASE = `http://localhost:${PORT}`;

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

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env },
});

preview.stderr.on('data', (d) => process.stderr.write(d));

try {
  await run('npm', ['run', 'build'], { cwd: ROOT });
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

  // Let waves settle
  await page.waitForTimeout(4000);

  await page.screenshot({ path: path.join(OUT, 'surface.png') });
  console.log('Wrote docs/assets/surface.png');

  // Surface close-up — boat and wake
  await page.evaluate(() => {
    const cam = window.__seedOcean?.camera;
    if (cam) {
      cam.position.set(-6, 5, 28);
      cam.lookAt(-12, 1, 10);
    }
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'wake.png') });
  console.log('Wrote docs/assets/wake.png');

  // Underwater
  await page.evaluate(() => {
    const cam = window.__seedOcean?.camera;
    if (cam) {
      cam.position.set(2, -8, 16);
      cam.lookAt(0, -4, 0);
    }
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'underwater.png') });
  console.log('Wrote docs/assets/underwater.png');

  // GIF frames
  const frames = [];
  for (let i = 0; i < 16; i++) {
    const buf = await page.screenshot({ type: 'png' });
    frames.push(buf);
    await page.waitForTimeout(200);
  }
  await browser.close();

  // Write frame sequence for ffmpeg
  const frameDir = path.join(OUT, 'frames');
  await mkdir(frameDir, { recursive: true });
  for (let i = 0; i < frames.length; i++) {
    await writeFile(path.join(frameDir, `frame-${String(i).padStart(2, '0')}.png`), frames[i]);
  }

  try {
    await run('ffmpeg', [
      '-y', '-framerate', '8',
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
