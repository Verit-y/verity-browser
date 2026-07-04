import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../src/main/settings';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'verity-settings-'));
  file = join(dir, 'settings.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore SP3 -> Verity Migration', () => {
  it('benennt sp3-Theme-IDs und -Protokoll um', () => {
    writeFileSync(file, JSON.stringify({ theme: 'sp3-hacker', homepage: 'sp3://start' }));
    const s = new SettingsStore(file).get();
    expect(s.theme).toBe('verity-hacker');
    expect(s.homepage).toBe('verity://start');
  });

  it('leitet Level aus alten Booleans ab und setzt onboardingComplete für Bestandsnutzer', () => {
    writeFileSync(file, JSON.stringify({ adblock: false, fingerprintProtection: true, clearCookiesOnExit: true }));
    const s = new SettingsStore(file).get();
    expect(s.adblockLevel).toBe('off');
    expect(s.fingerprintLevel).toBe('standard');
    expect(s.cookieMode).toBe('clear-on-exit');
    expect(s.onboardingComplete).toBe(true);
  });
});

describe('SettingsStore Level<->Boolean-Sync', () => {
  it('hält die abgeleiteten Booleans synchron', () => {
    const store = new SettingsStore(file);
    store.update({ adblockLevel: 'off' });
    expect(store.get().adblock).toBe(false);
    expect(store.get().trackerBlock).toBe(false);
    store.update({ adblockLevel: 'aggressive' });
    expect(store.get().adblock).toBe(true);
    store.update({ fingerprintLevel: 'off' });
    expect(store.get().fingerprintProtection).toBe(false);
    store.update({ cookieMode: 'clear-on-exit' });
    expect(store.get().clearCookiesOnExit).toBe(true);
  });

  it('Fresh-Install verlangt Onboarding', () => {
    expect(new SettingsStore(file).get().onboardingComplete).toBe(false);
  });
});
