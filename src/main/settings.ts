import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, SettingsData } from '../shared/types';

/**
 * JSON-backed settings store. Emits 'change' with (data, patch) whenever
 * settings are updated so subsystems (DoH, layout) can react live.
 */
export class SettingsStore extends EventEmitter {
  private data: SettingsData;

  constructor(private file: string) {
    super();
    this.data = { ...DEFAULT_SETTINGS };
    try {
      if (existsSync(file)) {
        const raw = JSON.parse(readFileSync(file, 'utf8'));
        this.data = {
          ...DEFAULT_SETTINGS,
          ...raw,
          doh: { ...DEFAULT_SETTINGS.doh, ...(raw.doh ?? {}) },
          ai: { ...DEFAULT_SETTINGS.ai, ...(raw.ai ?? {}) },
          permissions: { ...(raw.permissions ?? {}) },
        };
        // Migration: alte Standard-Homepage (DuckDuckGo) -> eigene Startseite.
        if (this.data.homepage === 'https://duckduckgo.com') {
          this.data.homepage = DEFAULT_SETTINGS.homepage;
        }
      }
    } catch (err) {
      console.error('[sp3] settings load failed, using defaults:', err);
    }
  }

  get(): SettingsData {
    return this.data;
  }

  update(patch: Partial<SettingsData>): SettingsData {
    this.data = {
      ...this.data,
      ...patch,
      doh: { ...this.data.doh, ...(patch.doh ?? {}) },
      ai: { ...this.data.ai, ...(patch.ai ?? {}) },
      permissions: patch.permissions ?? this.data.permissions,
    };
    this.persist();
    this.emit('change', this.data, patch);
    return this.data;
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[sp3] settings save failed:', err);
    }
  }
}
