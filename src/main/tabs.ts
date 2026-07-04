import { BrowserWindow, WebContentsView, session } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, shell } from 'electron';
import { SEARCH_ENGINES, TabState } from '../shared/types';
import { SettingsStore } from './settings';
import { StatsTracker } from './stats';
import { hardenSession } from './security/harden';
import { injectAntiFingerprint } from './security/fingerprint';
import { allowHost, Threat, THREAT_LABELS } from './security/threats';
import { WorkspaceStore } from './workspaces';
import { HistoryStore } from './history';

// Navigations to this pseudo host (link on the warning page) mean
// "proceed despite the warning". The .invalid TLD can never resolve.
const PROCEED_PREFIX = 'https://proceed.verity.invalid/?u=';

/** Interne Verity-Startseite (statt einer fremden Homepage). */
export const START_URL = 'verity://start';

let nextTabId = 1;

/**
 * Reader-Modus (in der Seite ausgeführt): extrahiert den wahrscheinlichsten
 * Artikelinhalt und zeigt ihn als ruhige Leseansicht; erneuter Aufruf schließt
 * die Ansicht wieder. Best-effort ohne externe Abhängigkeit.
 */
const READER_SCRIPT = `(() => {
  const ID = '__verity_reader__';
  const open = document.getElementById(ID);
  if (open) { open.remove(); document.documentElement.style.overflow=''; return 'closed'; }
  const pick = document.querySelector('article') || document.querySelector('main') || document.body;
  if (!pick) return 'none';
  const clone = pick.cloneNode(true);
  clone.querySelectorAll('script,style,noscript,iframe,nav,header,footer,aside,form,button').forEach(e=>e.remove());
  const title = (document.querySelector('h1')?.innerText || document.title || '').trim();
  const ov = document.createElement('div');
  ov.id = ID;
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#14161b;color:#e8eaf0;padding:8vh 20px;';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:720px;margin:0 auto;font:18px/1.7 Georgia,serif;';
  wrap.innerHTML = '<button style="position:fixed;top:16px;right:20px;padding:8px 14px;background:#232833;color:#e8eaf0;border:1px solid #333;border-radius:8px;cursor:pointer" onclick="document.getElementById(\\'' + ID + '\\').remove();document.documentElement.style.overflow=\\'\\'">Schließen</button>' +
    (title ? '<h1 style="font:600 30px/1.3 Georgia,serif;margin-bottom:24px">'+title+'</h1>' : '');
  wrap.appendChild(clone);
  ov.appendChild(wrap);
  document.documentElement.style.overflow='hidden';
  document.body.appendChild(ov);
  return 'open';
})()`;

interface Tab {
  id: number;
  view: WebContentsView;
  container: string;
  isPrivate: boolean;
  scriptsBlocked: boolean;
  blockedCount: number;
  /** Workspace this tab belongs to (isolation + visibility). */
  workspaceId: string;
}

export interface TabCreateOptions {
  container?: string;
  isPrivate?: boolean;
  scriptsBlocked?: boolean;
}

/**
 * Manages page content as WebContentsViews layered inside the main window.
 * The chrome UI (tabs strip, toolbar, panels) lives in the window's own
 * webContents; each tab gets its own view and - depending on the container -
 * its own isolated session partition (cookie isolation).
 */
export class TabManager {
  private tabs: Tab[] = [];
  private activeId: number | null = null;
  /** Second pane of the split view, or null when split view is off. */
  private splitId: number | null = null;
  private insets = { top: 50, left: 274, right: 10 };
  private panelOpen = false;

  constructor(
    private win: BrowserWindow,
    private settings: SettingsStore,
    private stats: StatsTracker,
    private workspaces: WorkspaceStore,
    private history: HistoryStore
  ) {
    win.on('resize', () => this.layout());
    win.on('maximize', () => this.layout());
    win.on('unmaximize', () => this.layout());
    stats.on('tab-block', (wcId: number) => {
      const tab = this.tabs.find((t) => t.view.webContents.id === wcId);
      if (tab) {
        tab.blockedCount++;
        this.broadcast();
      }
    });
    stats.on('threat', (wcId: number, url: string, threat: Threat) => {
      const tab = this.tabs.find((t) => t.view.webContents.id === wcId);
      if (tab) this.showWarning(tab, url, threat);
    });
  }

  /** Replaces the blocked navigation with the local Verity warning page. */
  private showWarning(tab: Tab, url: string, threat: Threat): void {
    const params = new URLSearchParams({
      u: url,
      t: THREAT_LABELS[threat.type],
      r: threat.reason,
    });
    tab.view.webContents
      .loadFile(join(__dirname, 'renderer', 'warning.html'), {
        hash: params.toString(),
      })
      .catch(() => {});
  }

  create(url?: string, opts: TabCreateOptions = {}): number {
    const isPrivate = !!opts.isPrivate;
    // Cookie isolation: every non-default container gets its own partition.
    // Partitions without the 'persist:' prefix are in-memory only - used for
    // private tabs and temporary containers.
    const workspaceId = this.workspaces.active().id;
    const container =
      opts.container ?? (isPrivate ? `private-${Date.now()}` : 'default');
    // Default-Tabs nutzen die Workspace-Partition (echte Cookie-Isolation je
    // Workspace); private/temporäre Container behalten ihre eigene Partition.
    const partition =
      container === 'default' ? WorkspaceStore.partitionFor(workspaceId) : container;
    const ses = session.fromPartition(partition);
    hardenSession(ses, this.settings, this.stats);

    const view = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: !opts.scriptsBlocked,
      },
    });
    // Floating-card look: real rounded corners on the native page view.
    view.setBackgroundColor('#00000000');
    view.setBorderRadius(TabManager.RADIUS);

    const tab: Tab = {
      id: nextTabId++,
      view,
      container,
      isPrivate,
      scriptsBlocked: !!opts.scriptsBlocked,
      blockedCount: 0,
      workspaceId,
    };
    const wc = view.webContents;

    wc.setWindowOpenHandler(({ url: target }) => {
      this.create(target, { container, isPrivate });
      return { action: 'deny' };
    });
    if (this.settings.get().webrtcProtection) {
      wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    }
    if (this.settings.get().fingerprintProtection) {
      injectAntiFingerprint(wc);
    }

    // Warning page: "Trotzdem fortfahren" navigates to the proceed pseudo
    // host; intercept it, whitelist the real host for this session, go there.
    wc.on('will-navigate', (event, target) => {
      if (!target.startsWith(PROCEED_PREFIX)) return;
      event.preventDefault();
      try {
        const real = decodeURIComponent(target.slice(PROCEED_PREFIX.length));
        allowHost(new URL(real).hostname);
        wc.loadURL(real).catch(() => {});
      } catch {
        /* malformed proceed link: stay on the warning page */
      }
    });

    const update = () => this.broadcast();
    wc.on('did-navigate', (_e, navUrl) => {
      this.recordHistory(tab, navUrl);
      update();
    });
    wc.on('did-navigate-in-page', update);
    wc.on('did-start-loading', update);
    wc.on('did-stop-loading', update);
    wc.on('page-title-updated', update);
    wc.on('did-fail-load', update);

    this.tabs.push(tab);
    this.win.contentView.addChildView(view);
    this.load(wc, url ?? this.settings.get().homepage);
    this.activate(tab.id);
    return tab.id;
  }

  /** Records a real page visit (never for private tabs or internal pages). */
  private recordHistory(tab: Tab, navUrl: string): void {
    if (tab.isPrivate) return;
    if (!/^https?:\/\//i.test(navUrl)) return;
    this.history.add({
      url: navUrl,
      title: tab.view.webContents.getTitle() || navUrl,
      type: 'visit',
    });
  }

  /** Resolves internal URLs (verity://start) and loads everything else as-is. */
  private load(wc: Electron.WebContents, url: string): void {
    if (url === START_URL || url === '') {
      const s = this.settings.get();
      const engine = SEARCH_ENGINES[s.searchEngine] ?? SEARCH_ENGINES.duckduckgo;
      const hash = new URLSearchParams({ e: engine.url, n: engine.name }).toString();
      wc.loadFile(join(__dirname, 'renderer', 'start.html'), { hash }).catch(() => {});
      return;
    }
    wc.loadURL(url).catch(() => {
      /* offline / canceled navigation */
    });
  }

  activate(id: number): void {
    if (!this.tabs.some((t) => t.id === id)) return;
    this.activeId = id;
    if (this.splitId === id) this.splitId = null;
    this.applyVisibility();
    this.layout();
    this.broadcast();
  }

  /**
   * Split View: shows the active tab and its neighbor side by side.
   * Toggling again (or closing one of the two tabs) ends the split.
   */
  toggleSplit(): void {
    if (this.splitId != null) {
      this.splitId = null;
    } else {
      const idx = this.tabs.findIndex((t) => t.id === this.activeId);
      if (idx === -1 || this.tabs.length < 2) return;
      const neighbor = this.tabs[idx + 1] ?? this.tabs[idx - 1];
      this.splitId = neighbor.id;
    }
    this.applyVisibility();
    this.layout();
    this.broadcast();
  }

  close(id: number): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    if (this.splitId === id) this.splitId = null;
    const [tab] = this.tabs.splice(idx, 1);
    this.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    if (this.activeId === id) {
      // Nach dem Schließen im selben Workspace bleiben.
      const neighbor = this.workspaceTabs().pop();
      if (neighbor) this.activate(neighbor.id);
      else this.create();
    } else {
      this.broadcast();
    }
  }

  navigate(id: number | null, url: string): void {
    const tab = this.find(id);
    if (tab) this.load(tab.view.webContents, url);
  }

  back(id: number | null): void {
    const wc = this.find(id)?.view.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  forward(id: number | null): void {
    const wc = this.find(id)?.view.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(id: number | null): void {
    this.find(id)?.view.webContents.reload();
  }

  closeActive(): void {
    if (this.activeId != null) this.close(this.activeId);
  }

  reloadActive(): void {
    this.reload(this.activeId);
  }

  cycle(direction: 1 | -1): void {
    const list = this.workspaceTabs();
    if (list.length < 2 || this.activeId == null) return;
    const idx = list.findIndex((t) => t.id === this.activeId);
    const next = list[(idx + direction + list.length) % list.length];
    this.activate(next.id);
  }

  /** Tabs belonging to the active workspace, in order. */
  private workspaceTabs(): Tab[] {
    const wsId = this.workspaces.active().id;
    return this.tabs.filter((t) => t.workspaceId === wsId);
  }

  /**
   * Switches the active workspace: hides the current set, shows the target's
   * tabs (creating a first tab if the workspace is empty).
   */
  setWorkspace(id: string): void {
    this.workspaces.setActive(id);
    const list = this.workspaceTabs();
    if (list.length === 0) {
      this.create();
    } else {
      this.splitId = null;
      this.activate(list[list.length - 1].id);
    }
  }

  /** Script blocker: recreates the tab with JavaScript enabled/disabled. */
  toggleScripts(id: number | null): void {
    const tab = this.find(id);
    if (!tab) return;
    const url = tab.view.webContents.getURL();
    const opts: TabCreateOptions = {
      container: tab.container,
      isPrivate: tab.isPrivate,
      scriptsBlocked: !tab.scriptsBlocked,
    };
    this.close(tab.id);
    this.create(url, opts);
  }

  openDevTools(): void {
    this.find(this.activeId)?.view.webContents.openDevTools({ mode: 'detach' });
  }

  /** Picture-in-Picture für das erste (spielende) Video der aktiven Seite. */
  togglePiP(): void {
    const wc = this.find(this.activeId)?.view.webContents;
    if (!wc) return;
    wc.executeJavaScript(
      `(() => {
        try {
          if (document.pictureInPictureElement) { document.exitPictureInPicture(); return 'exit'; }
          const vids = [...document.querySelectorAll('video')];
          const v = vids.find((x) => !x.paused) || vids[0];
          if (v && v.requestPictureInPicture) { v.requestPictureInPicture(); return 'enter'; }
          return 'none';
        } catch (e) { return 'error'; }
      })()`,
      true
    ).catch(() => {});
  }

  /** Best-effort Reader-Modus: extrahiert den Hauptinhalt in eine ruhige Leseansicht. */
  toggleReader(): void {
    const wc = this.find(this.activeId)?.view.webContents;
    if (!wc) return;
    wc.executeJavaScript(READER_SCRIPT, true).catch(() => {});
  }

  /** Momentaufnahme aller nicht-privaten Tabs (für Session-Wiederherstellung). */
  snapshot(): { workspaceId: string; url: string }[] {
    return this.tabs
      .filter((t) => !t.isPrivate)
      .map((t) => ({ workspaceId: t.workspaceId, url: t.view.webContents.getURL() }))
      .filter((s) => /^https?:\/\//i.test(s.url));
  }

  /** Stellt eine Momentaufnahme wieder her (je Workspace). */
  restore(snapshot: { workspaceId: string; url: string }[]): void {
    const byWs = new Map<string, string[]>();
    for (const s of snapshot) {
      if (!byWs.has(s.workspaceId)) byWs.set(s.workspaceId, []);
      byWs.get(s.workspaceId)!.push(s.url);
    }
    for (const [wsId, urls] of byWs) {
      if (!this.workspaces.list().some((w) => w.id === wsId)) continue;
      this.workspaces.setActive(wsId);
      for (const url of urls) this.create(url);
    }
  }

  /** Screenshot tool: captures the active page to userData/screenshots. */
  async screenshot(): Promise<string | null> {
    const tab = this.find(this.activeId);
    if (!tab) return null;
    const image = await tab.view.webContents.capturePage();
    const dir = join(app.getPath('userData'), 'screenshots');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `verity-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    writeFileSync(file, image.toPNG());
    shell.showItemInFolder(file);
    return file;
  }

  setInsets(insets: { top: number; left: number; right?: number }): void {
    this.insets = { ...insets, right: insets.right ?? TabManager.GAP };
    this.layout();
  }

  setPanelOpen(open: boolean): void {
    this.panelOpen = open;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const wsId = this.workspaces.active().id;
    for (const tab of this.tabs) {
      const inWorkspace = tab.workspaceId === wsId;
      const shown = inWorkspace && (tab.id === this.activeId || tab.id === this.splitId);
      tab.view.setVisible(shown && !this.panelOpen);
    }
  }

  /** PNG of the active page (smoke test / visual verification). */
  async captureActive(): Promise<Buffer | null> {
    const tab = this.find(this.activeId);
    if (!tab) return null;
    const image = await tab.view.webContents.capturePage();
    return image.toPNG();
  }

  /** Extracts URL, title and visible text of the active page (for the AI). */
  async pageText(): Promise<{ url: string; title: string; text: string } | null> {
    const tab = this.find(this.activeId);
    if (!tab) return null;
    const wc = tab.view.webContents;
    let text = '';
    try {
      const result = await wc.executeJavaScript(
        'document.body ? document.body.innerText : ""',
        true
      );
      text = String(result ?? '').slice(0, 8000);
    } catch {
      /* scripts blocked or page gone: return empty text */
    }
    return { url: wc.getURL(), title: wc.getTitle(), text };
  }

  state(): TabState[] {
    // Nur Tabs des aktiven Workspace an die UI melden.
    return this.workspaceTabs().map((tab) => {
      const wc = tab.view.webContents;
      // Interne Seiten (Startseite, Warnseite) zeigen keine file://-Pfade.
      const raw = wc.getURL();
      const internal = raw.startsWith('file:') && raw.includes('/renderer/');
      return {
        id: tab.id,
        url: internal ? '' : raw,
        title: wc.getTitle() || 'Neuer Tab',
        isLoading: wc.isLoading(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        blockedCount: tab.blockedCount,
        container: tab.container,
        isPrivate: tab.isPrivate,
        scriptsBlocked: tab.scriptsBlocked,
        active: tab.id === this.activeId,
        split: tab.id === this.splitId,
      };
    });
  }

  private find(id: number | null): Tab | undefined {
    return this.tabs.find((t) => t.id === (id ?? this.activeId));
  }

  // Floating-card geometry: the renderer's insets already include the left/top
  // gap; GAP is the matching right/bottom gap. The native view has real rounded
  // corners (setBorderRadius), so it fills the card rect exactly.
  private static readonly GAP = 10;
  private static readonly RADIUS = 14;
  private static readonly SPLIT_GAP = 8;

  private layout(): void {
    const tab = this.find(this.activeId);
    if (!tab) return;
    const { width, height } = this.win.getContentBounds();
    const { GAP, SPLIT_GAP } = TabManager;
    const area = {
      x: this.insets.left,
      y: this.insets.top,
      width: Math.max(0, width - this.insets.left - this.insets.right),
      height: Math.max(0, height - this.insets.top - GAP),
    };
    const split = this.splitId != null ? this.find(this.splitId) : undefined;
    if (!split) {
      tab.view.setBounds(area);
      return;
    }
    const half = Math.floor((area.width - SPLIT_GAP) / 2);
    tab.view.setBounds({ ...area, width: half });
    split.view.setBounds({
      ...area,
      x: area.x + half + SPLIT_GAP,
      width: area.width - half - SPLIT_GAP,
    });
  }

  private broadcast(): void {
    if (this.win.isDestroyed()) return;
    this.win.webContents.send('tabs:update', this.state());
  }
}
