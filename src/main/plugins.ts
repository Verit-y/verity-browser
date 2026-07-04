import { app } from 'electron';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginInfo } from '../shared/types';

/**
 * Plugin discovery (Phase 1 of the plugin architecture, see docs/PLUGINS.md).
 * Plugins live in <userData>/plugins/<id>/manifest.json. This phase only
 * validates and lists manifests - sandboxed execution of plugin code is a
 * deliberate roadmap item: SP3 will not run third-party code in the main
 * process.
 */
export function listPlugins(): PluginInfo[] {
  const dir = join(app.getPath('userData'), 'plugins');
  if (!existsSync(dir)) return [];
  const plugins: PluginInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(dir, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (typeof m.id === 'string' && typeof m.name === 'string') {
        plugins.push({
          id: m.id,
          name: m.name,
          version: String(m.version ?? '0.0.0'),
          description: String(m.description ?? ''),
          author: m.author,
          enabled: false,
        });
      }
    } catch (err) {
      console.error(`[sp3] invalid plugin manifest in ${entry.name}:`, err);
    }
  }
  return plugins;
}
