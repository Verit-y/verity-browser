import { app } from 'electron';
import { SettingsData } from '../../shared/types';

export const DOH_SERVERS = [
  { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' },
  { name: 'Mullvad', url: 'https://dns.mullvad.net/dns-query' },
  { name: 'dns0.eu', url: 'https://dns0.eu/' },
];

/**
 * Applies DNS-over-HTTPS via Chromium's built-in secure DNS resolver.
 * 'secure' = DoH only (no plaintext fallback), 'automatic' = upgrade when
 * possible. DNS-over-TLS is not exposed by the Chromium network stack and is
 * documented as an OS-level option in docs/SECURITY.md.
 */
export function applyDoH(settings: SettingsData): void {
  try {
    app.configureHostResolver({
      secureDnsMode: settings.doh.enabled ? 'secure' : 'automatic',
      secureDnsServers: settings.doh.enabled ? [settings.doh.server] : [],
    });
  } catch (err) {
    console.error('[verity] DoH configuration failed:', err);
  }
}
