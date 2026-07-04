// Verity build script: bundles main, preload and renderer with esbuild
// and copies static assets into dist/.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
mkdirSync(join(dist, 'renderer'), { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  target: 'es2022',
};

// Main process
await build({
  ...common,
  entryPoints: [join(root, 'src/main/main.ts')],
  outfile: join(dist, 'main.js'),
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'electron-updater'],
});

// Preload (chrome UI bridge)
await build({
  ...common,
  entryPoints: [join(root, 'src/preload/preload.ts')],
  outfile: join(dist, 'preload.js'),
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});

// Renderer (browser chrome UI)
await build({
  ...common,
  entryPoints: [join(root, 'src/renderer/ui.ts')],
  outfile: join(dist, 'renderer/ui.js'),
  platform: 'browser',
  format: 'iife',
});

// Static files
cpSync(join(root, 'src/renderer/index.html'), join(dist, 'renderer/index.html'));
cpSync(join(root, 'src/renderer/styles.css'), join(dist, 'renderer/styles.css'));
cpSync(join(root, 'src/renderer/warning.html'), join(dist, 'renderer/warning.html'));
cpSync(join(root, 'src/renderer/start.html'), join(dist, 'renderer/start.html'));

console.log('Verity build complete.');
