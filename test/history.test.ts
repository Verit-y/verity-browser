import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;

// safeStorage-Fake: reversibel (base64), simuliert den OS-Keychain, damit der
// Verschlüsselungs-/Entschlüsselungs-Roundtrip des HistoryStore testbar ist.
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  },
}));

import { HistoryStore } from '../src/main/history';
import { DEFAULT_SETTINGS, SettingsData } from '../src/shared/types';

function fakeSettings(over: Partial<SettingsData> = {}) {
  const data = { ...DEFAULT_SETTINGS, ...over };
  return { get: () => data } as unknown as import('../src/main/settings').SettingsStore;
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'verity-history-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('HistoryStore', () => {
  it('verschlüsselt Einträge und liest sie per Roundtrip zurück', () => {
    const s = fakeSettings({ historyMode: 'encrypted', historyRetentionDays: 0 });
    const h1 = new HistoryStore(s);
    h1.add({ url: 'https://example.org/a', title: 'A', type: 'visit' });
    h1.add({ url: 'kittens', title: 'kittens', type: 'search' });

    // Datei existiert verschlüsselt, nicht im Klartext.
    const encFile = join(dir, 'history.enc');
    expect(existsSync(encFile)).toBe(true);
    expect(readFileSync(encFile, 'utf8')).toContain('enc:');
    expect(existsSync(join(dir, 'history.json'))).toBe(false);

    // Neue Instanz lädt und entschlüsselt.
    const h2 = new HistoryStore(s);
    expect(h2.query()).toHaveLength(2);
    expect(h2.query('', 'search')[0].title).toBe('kittens');
  });

  it('speichert nichts im Modus off', () => {
    const h = new HistoryStore(fakeSettings({ historyMode: 'off' }));
    h.add({ url: 'https://example.org', title: 'x', type: 'visit' });
    expect(h.query()).toHaveLength(0);
    expect(existsSync(join(dir, 'history.enc'))).toBe(false);
  });

  it('entfernt einzelne Einträge und schlägt Präfixe vor', () => {
    const h = new HistoryStore(fakeSettings({ historyMode: 'plain', historyRetentionDays: 0 }));
    h.add({ url: 'https://news.example.org', title: 'News', type: 'visit', ts: 1000 });
    h.add({ url: 'https://shop.example.org', title: 'Shop', type: 'visit', ts: 2000 });
    expect(h.suggest('shop')).toHaveLength(1);
    h.remove(1000, 'https://news.example.org');
    expect(h.query()).toHaveLength(1);
  });
});
