import { Session } from 'electron';
import { SettingsStore } from '../settings';
import { StatsTracker } from '../stats';

/** Permissions that are always safe to grant. */
const ALWAYS_ALLOW = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);

/**
 * Deny-by-default permission model: camera, microphone, geolocation,
 * notifications etc. are blocked unless the user allowlisted the origin in
 * the permission manager (settings.permissions). Every denial is counted for
 * the security dashboard.
 */
export function attachPermissionHandlers(
  ses: Session,
  settings: SettingsStore,
  stats: StatsTracker
): void {
  const isAllowed = (origin: string, permission: string): boolean => {
    if (ALWAYS_ALLOW.has(permission)) return true;
    const allowed = settings.get().permissions[origin];
    return Array.isArray(allowed) && allowed.includes(permission);
  };

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    let origin = '';
    try {
      origin = new URL(details.requestingUrl || wc.getURL()).origin;
    } catch {
      /* keep empty origin -> denied */
    }
    if (isAllowed(origin, permission)) {
      callback(true);
      return;
    }
    stats.bump('permissionsDenied');
    callback(false);
  });

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    let origin = '';
    try {
      origin = new URL(requestingOrigin).origin;
    } catch {
      /* denied */
    }
    return isAllowed(origin, permission);
  });
}
