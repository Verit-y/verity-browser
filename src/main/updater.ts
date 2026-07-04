import { app } from 'electron';

/**
 * Auto-update via electron-updater + GitHub Releases (see electron-builder.yml).
 * Only active in packaged builds; in development this is a no-op.
 */
export function initUpdater(): void {
  if (!app.isPackaged) return;
  try {
    // Lazy require so a missing optional dependency never breaks startup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
      console.error('[verity] update check failed:', err);
    });
  } catch (err) {
    console.error('[verity] electron-updater not available:', err);
  }
}
