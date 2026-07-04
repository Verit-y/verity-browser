import { EventEmitter } from 'node:events';
import { BlockedEntry, SecurityStats, StatsPayload } from '../shared/types';
import type { Threat } from './security/threats';

/**
 * Collects security counters (blocked ads/trackers, HTTPS upgrades,
 * denied permission requests) and recently blocked hosts.
 * Emits 'update' (throttled) with a StatsPayload and 'tab-block' with the
 * webContents id so the TabManager can attribute blocks to a tab.
 */
export class StatsTracker extends EventEmitter {
  private counters: SecurityStats = {
    adsBlocked: 0,
    trackersBlocked: 0,
    httpsUpgrades: 0,
    permissionsDenied: 0,
    threatsBlocked: 0,
  };
  private recentBlocked: BlockedEntry[] = [];
  private emitTimer: NodeJS.Timeout | null = null;

  bump(key: keyof SecurityStats): void {
    this.counters[key]++;
    this.scheduleEmit();
  }

  recordBlocked(host: string, type: BlockedEntry['type']): void {
    this.recentBlocked.unshift({ host, type, time: Date.now() });
    if (this.recentBlocked.length > 50) this.recentBlocked.length = 50;
  }

  attribute(webContentsId: number | undefined): void {
    if (webContentsId != null) this.emit('tab-block', webContentsId);
  }

  /** Routes a blocked threat navigation to the TabManager ('threat' event). */
  reportThreat(webContentsId: number | undefined, url: string, threat: Threat): void {
    if (webContentsId != null) this.emit('threat', webContentsId, url, threat);
  }

  payload(): StatsPayload {
    return { ...this.counters, recentBlocked: [...this.recentBlocked] };
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit('update', this.payload());
    }, 300);
  }
}
