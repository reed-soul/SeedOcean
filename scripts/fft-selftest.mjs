// Run GPU FFT self-test in headless Chromium (CI).

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.FFT_TEST_PORT) || 5392;
const BASE = `http://localhost:${PORT}`;
const URL = `${BASE}/test/fft-selftest.html`;

function waitForServer(ms = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(BASE);
        if (res.ok) return resolve();
      } catch { /* retry */ }
      if (Date.now() - start > ms) return reject(new Error('Vite server did not start'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const vite = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env, BROWSER: 'none' },
});

vite.stderr.on('data', (d) => process.stderr.write(d));
vite.stdout.on('data', (d) => process.stdout.write(d));

let exitCode = 1;

try {
  await waitForServer();

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=WebGPU',
      '--use-angle=swiftshader-webgl',
    ],
  });

  const page = await browser.newPage();
  const hasWebGPU = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
  if (!hasWebGPU) {
    console.warn('WebGPU adapter unavailable — skipping FFT self-test');
    await browser.close();
    exitCode = 0;
    throw new Error('__SKIP__');
  }
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(
    () => document.body.dataset.status !== undefined,
    { timeout: 120000 },
  );

  const status = await page.evaluate(() => document.body.dataset.status);
  const result = await page.evaluate(() => window.__FFT_RESULT__);
  const error = await page.evaluate(() => window.__FFT_ERROR__);

  await browser.close();

  if (status === 'pass') {
    console.log(`FFT self-test passed (impulse err=${result.err1}, freq err=${result.err2})`);
    exitCode = 0;
  } else if (status === 'fail') {
    console.error(`FFT self-test failed (impulse err=${result?.err1}, freq err=${result?.err2})`);
  } else {
    console.error(`FFT self-test error: ${error ?? 'unknown'}`);
  }
} catch (e) {
  if (e?.message === '__SKIP__') {
    exitCode = 0;
  } else {
    console.error(e?.message ?? e);
  }
} finally {
  vite.kill('SIGKILL');
  process.exit(exitCode);
}
