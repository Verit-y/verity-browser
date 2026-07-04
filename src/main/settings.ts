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
          appearance: { ...DEFAULT_SETTINGS.appearance, ...(raw.appearance ?? {}) },
          permissions: { ...(raw.permissions ?? {}) },
        };
        // Migration: alte Standard-Homepage (DuckDuckGo) -> eigene Startseite.
        if (this.data.homepage === 'https://duckduckgo.com') {
          this.data.homepage = DEFAULT_SETTINGS.homepage;
        }
        // Migration SP3 -> Verity: internes Protokoll und Theme-IDs umbenennen.
        if (this.data.homepage === 'sp3://start') {
          this.data.homepage = DEFAULT_SETTINGS.homepage;
        }
        if (typeof this.data.theme === 'string' && this.data.theme.startsWith('sp3-')) {
          this.data.theme = this.data.theme.replace(/^sp3-/, 'verity-');
        }
        // Migration Boolesch -> Level (Onboarding-Modell). Bestehende Nutzer
        // haben bereits konfiguriert -> Onboarding nicht erzwingen.
        if (raw.adblockLevel === undefined) {
          this.data.adblockLevel = raw.adblock === false ? 'off' : 'standard';
        }
        if (raw.fingerprintLevel === undefined) {
          this.data.fingerprintLevel =
            raw.fingerprintProtection === false ? 'off' : 'standard';
        }
        if (raw.cookieMode === undefined) {
          this.data.cookieMode = raw.clearCookiesOnExit ? 'clear-on-exit' : 'block-third-party';
        }
        if (raw.onboardingComplete === undefined) this.data.onboardingComplete = true;
      }
    } catch (err) {
      console.error('[verity] settings load failed, using defaults:', err);
    }
    this.syncDerived();
  }

  /** Hält die von den Security-Modulen genutzten Booleans mit den Leveln synchron. */
  private syncDerived(): void {
    this.data.adblock = this.data.adblockLevel !== 'off';
    this.data.trackerBlock = this.data.adblockLevel !== 'off';
    this.data.fingerprintProtection = this.data.fingerprintLevel !== 'off';
    this.data.clearCookiesOnExit = this.data.cookieMode === 'clear-on-exit';
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
      appearance: { ...this.data.appearance, ...(patch.appearance ?? {}) },
      permissions: patch.permissions ?? this.data.permissions,
    };
    this.syncDerived();
    this.persist();
    this.emit('change', this.data, patch);
    return this.data;
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[verity] settings save failed:', err);
    }
  }
}
