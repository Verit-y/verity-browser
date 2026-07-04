// Generates build/icon.ico (Windows) and build/icon.png (Linux) from
// assets/icon.svg - rendered by Electron itself, no extra dependencies.
// Run: npx electron scripts/make-icon.mjs
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Wraps PNG buffers into an ICO container (PNG-compressed entries). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

app.whenReady().then(async () => {
  const svg = readFileSync(join(root, 'assets', 'icon.svg'), 'utf8');
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true, sandbox: true },
  });
  await win.loadURL(
    `data:text/html,<body style="margin:0;background:transparent"><img src="${encodeURIComponent(url)}" width="512" height="512"></body>`
  );
  await new Promise((r) => setTimeout(r, 400)); // let the SVG rasterize

  const shot = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(join(root, 'build', 'icon.png'), shot.toPNG());

  const entries = SIZES.map((size) => ({
    size,
    png: shot.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  writeFileSync(join(root, 'build', 'icon.ico'), buildIco(entries));

  console.log('ICON_OK build/icon.ico + build/icon.png');
  app.exit(0);
});
