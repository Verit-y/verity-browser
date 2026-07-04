import { networkInterfaces } from 'node:os';

/**
 * Experimentelle, rein informative Erkennung, ob ein Mullvad-VPN (WireGuard)
 * aktiv ist. Heuristik über die Netzwerkschnittstellen-Namen — es gibt keine
 * zuverlässige, portable API dafür, daher bewusst als „experimentell" markiert.
 * Verity koppelt keine Funktion daran.
 */
export function mullvadActive(): boolean {
  const ifaces = networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/wg[-_]?mullvad|mullvad|^wg\d|^tun\d/i.test(name)) {
      if (addrs?.some((a) => !a.internal)) return true;
    }
  }
  return false;
}
