import { describe, it, expect, vi, beforeEach } from 'vitest';

const { configureHostResolver } = vi.hoisted(() => ({ configureHostResolver: vi.fn() }));
vi.mock('electron', () => ({ app: { configureHostResolver } }));

import { applyDoH } from '../src/main/security/doh';
import { DEFAULT_SETTINGS } from '../src/shared/types';

beforeEach(() => configureHostResolver.mockClear());

describe('applyDoH', () => {
  it('nutzt den secure-Modus mit dem gewählten Server, wenn aktiviert', () => {
    applyDoH({ ...DEFAULT_SETTINGS, doh: { enabled: true, server: 'https://dns.mullvad.net/dns-query' } });
    expect(configureHostResolver).toHaveBeenCalledWith({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://dns.mullvad.net/dns-query'],
    });
  });

  it('fällt auf automatic ohne feste Server zurück, wenn deaktiviert', () => {
    applyDoH({ ...DEFAULT_SETTINGS, doh: { enabled: false, server: 'https://cloudflare-dns.com/dns-query' } });
    expect(configureHostResolver).toHaveBeenCalledWith({
      secureDnsMode: 'automatic',
      secureDnsServers: [],
    });
  });
});
