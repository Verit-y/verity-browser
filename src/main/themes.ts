import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ThemeSpec } from '../shared/types';

function themeDirs(): { bundled: string; user: string } {
  return {
    bundled: join(app.getAppPath(), 'themes'),
    user: join(app.getPath('userData'), 'themes'),
  };
}

function readThemesFrom(dir: string): ThemeSpec[] {
  if (!existsSync(dir)) return [];
  const themes: ThemeSpec[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(join(dir, file), 'utf8')) as ThemeSpec;
      if (spec.id && spec.name && spec.colors) themes.push(spec);
    } catch (err) {
      console.error(`[sp3] invalid theme ${file}:`, err);
    }
  }
  return themes;
}

/** Bundled themes first, user themes override on id collision. */
export function listThemes(): ThemeSpec[] {
  const { bundled, user } = themeDirs();
  const map = new Map<string, ThemeSpec>();
  for (const t of readThemesFrom(bundled)) map.set(t.id, t);
  for (const t of readThemesFrom(user)) map.set(t.id, t);
  return [...map.values()];
}

/** Saves a custom/imported theme into the user theme directory. */
export function saveTheme(spec: ThemeSpec): ThemeSpec {
  const { user } = themeDirs();
  mkdirSync(user, { recursive: true });
  const safeId = spec.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const normalized = { ...spec, id: safeId };
  writeFileSync(join(user, `${safeId}.json`), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}
