// Fallback promo images when WebGPU capture is unavailable (CI / headless).

import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'assets');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderScene(w, h, variant) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = y / h;
      const wave = Math.sin(x * 0.02 + y * 0.015) * 0.08;
      if (variant === 'underwater') {
        buf[i] = 4 + t * 18;
        buf[i + 1] = 40 + t * 55;
        buf[i + 2] = 70 + t * 40;
      } else if (variant === 'wake') {
        buf[i] = 10 + t * 35 + wave * 40;
        buf[i + 1] = 80 + t * 70;
        buf[i + 2] = 120 + t * 50;
      } else {
        buf[i] = 8 + t * 45 + wave * 30;
        buf[i + 1] = 70 + t * 90;
        buf[i + 2] = 110 + t * 60;
      }
      buf[i + 3] = 255;
      if (variant === 'wake' && x > w * 0.35 && x < w * 0.75) {
        const foam = Math.sin((x + y) * 0.08) * 0.5 + 0.5;
        if (t < 0.55 && foam > 0.65) {
          buf[i] = 210; buf[i + 1] = 235; buf[i + 2] = 245;
        }
      }
    }
  }
  return buf;
}

await mkdir(OUT, { recursive: true });
const W = 1280;
const H = 720;

for (const [name, variant] of [['surface', 'surface'], ['wake', 'wake'], ['underwater', 'underwater']]) {
  const file = path.join(OUT, `${name}.png`);
  await writeFile(file, png(W, H, renderScene(W, H, variant)));
  console.log(`Wrote placeholder ${file}`);
}

// Minimal animated GIF (2-frame ping-pong gradient)
const gifPath = path.join(OUT, 'demo.gif');
const frames = [renderScene(960, 540, 'surface'), renderScene(960, 540, 'wake')];
try {
  const { spawnSync } = await import('node:child_process');
  const frameDir = path.join(OUT, 'frames');
  await mkdir(frameDir, { recursive: true });
  for (let i = 0; i < frames.length; i++) {
    await writeFile(path.join(frameDir, `frame-0${i}.png`), png(960, 540, frames[i]));
  }
  const ff = spawnSync('ffmpeg', [
    '-y', '-framerate', '2', '-i', path.join(frameDir, 'frame-0%d.png'),
    '-vf', 'scale=960:-1', gifPath,
  ], { stdio: 'inherit' });
  if (ff.status === 0) console.log(`Wrote placeholder ${gifPath}`);
} catch {
  console.warn('ffmpeg unavailable — demo.gif skipped');
}
