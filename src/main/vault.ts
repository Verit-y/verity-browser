import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VaultEntry, VaultStatus } from '../shared/types';

interface StoredEntry {
  id: string;
  site: string;
  username: string;
  /** base64 of safeStorage-encrypted password */
  secret: string;
}

/**
 * Encrypted password vault. Secrets are encrypted with Electron safeStorage,
 * which uses the OS keychain (DPAPI on Windows, Keychain on macOS,
 * libsecret/kwallet on Linux). Plaintext never touches the disk.
 */
export class Vault {
  private file: string;
  private entries: StoredEntry[] = [];

  constructor() {
    this.file = join(app.getPath('userData'), 'vault.json');
    try {
      if (existsSync(this.file)) {
        this.entries = JSON.parse(readFileSync(this.file, 'utf8')).entries ?? [];
      }
    } catch (err) {
      console.error('[verity] vault load failed:', err);
    }
  }

  status(): VaultStatus {
    return {
      available: safeStorage.isEncryptionAvailable(),
      count: this.entries.length,
    };
  }

  list(): VaultEntry[] {
    if (!safeStorage.isEncryptionAvailable()) return [];
    return this.entries.map((e) => ({
      id: e.id,
      site: e.site,
      username: e.username,
      password: this.decrypt(e.secret),
    }));
  }

  add(entry: { site: string; username: string; password: string }): VaultStatus {
    if (!safeStorage.isEncryptionAvailable()) return this.status();
    this.entries.push({
      id: randomUUID(),
      site: entry.site,
      username: entry.username,
      secret: safeStorage.encryptString(entry.password).toString('base64'),
    });
    this.persist();
    return this.status();
  }

  remove(id: string): VaultStatus {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.persist();
    return this.status();
  }

  private decrypt(secret: string): string {
    try {
      return safeStorage.decryptString(Buffer.from(secret, 'base64'));
    } catch {
      return '••• (nicht entschlüsselbar)';
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ entries: this.entries }, null, 2), 'utf8');
  }
}
