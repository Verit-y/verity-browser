import { Session } from 'electron';
import { SettingsStore } from '../settings';
import { StatsTracker } from '../stats';
import { genericUserAgent } from './fingerprint';
import { attachPermissionHandlers } from './permissions';
import { attachRequestFilter } from './requestFilter';

const hardened = new WeakSet<Session>();

/**
 * Applies the full SP3 hardening profile to a session exactly once:
 * reduced user agent, request filter (adblock/tracker/HTTPS-only/GPC) and
 * deny-by-default permissions. Called for every container partition, so
 * temporary containers and private tabs get the same protections.
 */
export function hardenSession(
  ses: Session,
  settings: SettingsStore,
  stats: StatsTracker
): void {
  if (hardened.has(ses)) return;
  hardened.add(ses);

  ses.setUserAgent(genericUserAgent());
  attachRequestFilter(ses, settings, stats);
  attachPermissionHandlers(ses, settings, stats);
}
