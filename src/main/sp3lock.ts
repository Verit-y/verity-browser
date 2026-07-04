import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

/**
 * Optionale Brücke zu SP3-Lock (externer Passwort-Manager).
 *
 * STUB / FALLBACK-ONLY (bewusste Entscheidung): Ist SP3-Lock nicht installiert
 * oder der lokale Socket nicht erreichbar, fällt Verity still auf den eingebauten
 * safeStorage-Vault zurück. Diese Datei definiert nur die Erkennung und die
 * beabsichtigte Schnittstelle; das eigentliche Vault-Protokoll ist noch nicht
 * spezifiziert.
 *
 * Erwarteter Endpunkt (Unix-Domain-Socket):
 *   $XDG_RUNTIME_DIR/sp3-lock.sock   (Linux/macOS)
 * Windows würde später eine Named Pipe (\\.\pipe\sp3-lock) nutzen.
 */
export function sp3LockSocketPath(): string | null {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (!runtime) return null;
  return join(runtime, 'sp3-lock.sock');
}

export interface Sp3LockStatus {
  /** Socket vorhanden und erreichbar. */
  available: boolean;
  /** Immer true, solange die Bridge nur ein Stub ist. */
  stub: boolean;
  socket: string | null;
}

/** Prüft (ohne zu blockieren), ob ein SP3-Lock-Socket erreichbar ist. */
export function sp3LockStatus(timeoutMs = 250): Promise<Sp3LockStatus> {
  const socket = sp3LockSocketPath();
  return new Promise((resolve) => {
    if (!socket || !existsSync(socket)) {
      resolve({ available: false, stub: true, socket });
      return;
    }
    const conn = createConnection(socket);
    const done = (available: boolean) => {
      conn.destroy();
      resolve({ available, stub: true, socket });
    };
    conn.setTimeout(timeoutMs);
    conn.once('connect', () => done(true));
    conn.once('error', () => done(false));
    conn.once('timeout', () => done(false));
  });
}
