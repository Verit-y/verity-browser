import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HistoryEntry, HistoryMode } from '../shared/types';
import { SettingsStore } from './settings';

/**
 * Persistenter Browser-/Suchverlauf. Speicherung je nach Einstellung:
 * - 'off'       : nichts wird gespeichert (nur flüchtig, sofort verworfen).
 * - 'plain'     : Klartext-JSON.
 * - 'encrypted' : per Electron safeStorage (OS-Keychain) verschlüsselt.
 * Auto-Löschung nach settings.historyRetentionDays (0 = nie).
 */
export class HistoryStore {
  private plainFile: string;
  private encFile: string;
  private entries: HistoryEntry[] = [];

  constructor(private settings: SettingsStore) {
    const dir = app.getPath('userData');
    this.plainFile = join(dir, 'history.json');
    this.encFile = join(dir, 'history.enc');
    this.load();
    this.prune();
  }

  private mode(): HistoryMode {
    return this.settings.get().historyMode;
  }

  private load(): void {
    try {
      if (this.mode() === 'encrypted' && existsSync(this.encFile)) {
        const buf = readFileSync(this.encFile);
        if (safeStorage.isEncryptionAvailable()) {
          this.entries = JSON.parse(safeStorage.decryptString(buf)) as HistoryEntry[];
        }
      } else if (this.mode() === 'plain' && existsSync(this.plainFile)) {
        this.entries = JSON.parse(readFileSync(this.plainFile, 'utf8')) as HistoryEntry[];
      }
    } catch (err) {
      console.error('[verity] history load failed:', err);
      this.entries = [];
    }
  }

  /** Records a visited page or an address-bar search. Private tabs never call this. */
  add(entry: Omit<HistoryEntry, 'ts'> & { ts?: number }): void {
    if (this.mode() === 'off') return;
    if (!entry.url) return;
    const last = this.entries[this.entries.length - 1];
    // Direkte Duplikate (Reload/In-Page) zusammenfassen.
    if (last && last.url === entry.url && last.type === entry.type && Date.now() - last.ts < 1500) {
      last.title = entry.title || last.title;
      this.persist();
      return;
    }
    this.entries.push({ ...entry, ts: entry.ts ?? Date.now() });
    this.prune();
    this.persist();
  }

  query(search = '', filter: 'all' | 'visit' | 'search' = 'all'): HistoryEntry[] {
    const q = search.trim().toLowerCase();
    return this.entries
      .filter((e) => (filter === 'all' ? true : e.type === filter))
      .filter((e) => !q || e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
      .sort((a, b) => b.ts - a.ts);
  }

  /** Autocomplete-Kandidaten für die Adressleiste (nur besuchte Seiten). */
  suggest(prefix: string, limit = 6): HistoryEntry[] {
    const q = prefix.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: HistoryEntry[] = [];
    for (const e of this.query('', 'visit')) {
      if (seen.has(e.url)) continue;
      if (e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)) {
        seen.add(e.url);
        out.push(e);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  remove(ts: number, url: string): void {
    this.entries = this.entries.filter((e) => !(e.ts === ts && e.url === url));
    this.persist();
  }

  /** Löscht Einträge neuer als `sinceMs` (0 = alles). */
  clear(sinceMs = 0): void {
    if (sinceMs === 0) this.entries = [];
    else {
      const cutoff = Date.now() - sinceMs;
      this.entries = this.entries.filter((e) => e.ts < cutoff);
    }
    this.persist();
  }

  private prune(): void {
    const days = this.settings.get().historyRetentionDays;
    if (!days || days <= 0) return;
    const cutoff = Date.now() - days * 86400_000;
    this.entries = this.entries.filter((e) => e.ts >= cutoff);
  }

  private persist(): void {
    const mode = this.mode();
    try {
      mkdirSync(dirname(this.plainFile), { recursive: true });
      if (mode === 'off') {
        this.entries = [];
        this.removeFiles();
        return;
      }
      if (mode === 'encrypted' && safeStorage.isEncryptionAvailable()) {
        writeFileSync(this.encFile, safeStorage.encryptString(JSON.stringify(this.entries)));
        this.removeFile(this.plainFile);
      } else {
        writeFileSync(this.plainFile, JSON.stringify(this.entries), 'utf8');
        this.removeFile(this.encFile);
      }
    } catch (err) {
      console.error('[verity] history save failed:', err);
    }
  }

  private removeFile(f: string): void {
    try { if (existsSync(f)) rmSync(f); } catch { /* ignore */ }
  }
  private removeFiles(): void {
    this.removeFile(this.plainFile);
    this.removeFile(this.encFile);
  }
}
