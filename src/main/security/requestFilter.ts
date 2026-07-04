import { Session } from 'electron';
import { SettingsStore } from '../settings';
import { StatsTracker } from '../stats';
import { classifyHost } from './blocklist';
import { checkThreat } from './threats';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function isLocal(hostname: string): boolean {
  return (
    LOCAL_HOSTS.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Single onBeforeRequest pipeline per session (Electron allows only one
 * listener): HTTPS-Only upgrade for main frames + ad/tracker blocking.
 * Settings are read per request, so toggles apply live without restart.
 */
export function attachRequestFilter(
  ses: Session,
  settings: SettingsStore,
  stats: StatsTracker
): void {
  const filter = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };

  ses.webRequest.onBeforeRequest(filter, (details, callback) => {
    const s = settings.get();
    try {
      const url = new URL(details.url);

      // HTTPS-Only: upgrade plain-HTTP top-level navigations.
      if (
        s.httpsOnly &&
        url.protocol === 'http:' &&
        details.resourceType === 'mainFrame' &&
        !isLocal(url.hostname)
      ) {
        url.protocol = 'https:';
        stats.bump('httpsUpgrades');
        callback({ redirectURL: url.toString() });
        return;
      }

      // SP3 Shield: block known-bad / phishing navigations with a warning
      // page (loaded by the TabManager via the stats 'threat' event).
      if (s.threatProtection && details.resourceType === 'mainFrame') {
        const threat = checkThreat(url);
        if (threat) {
          stats.bump('threatsBlocked');
          stats.recordBlocked(url.hostname, 'threat');
          stats.reportThreat(details.webContentsId, details.url, threat);
          callback({ cancel: true });
          return;
        }
      }

      // Ad-/Tracker-Blocking.
      if (s.adblock || s.trackerBlock) {
        const kind = classifyHost(url.hostname);
        if (
          (kind === 'ad' && s.adblock) ||
          (kind === 'tracker' && s.trackerBlock)
        ) {
          stats.bump(kind === 'ad' ? 'adsBlocked' : 'trackersBlocked');
          stats.recordBlocked(url.hostname, kind);
          stats.attribute(details.webContentsId);
          callback({ cancel: true });
          return;
        }
      }
    } catch {
      /* malformed URL: let it pass to Chromium's own handling */
    }
    callback({});
  });

  // Global Privacy Control + Do Not Track on every request.
  ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders, 'Sec-GPC': '1', DNT: '1' };
    callback({ requestHeaders });
  });
}
