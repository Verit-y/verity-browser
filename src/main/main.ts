import { app, BrowserWindow, session } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SettingsStore } from './settings';
import { StatsTracker } from './stats';
import { TabManager } from './tabs';
import { Vault } from './vault';
import { registerIpc } from './ipc';
import { buildMenu } from './menu';
import { initUpdater } from './updater';
import { applyDoH } from './security/doh';
import { detectAppearanceCapabilities, enableTransparencyFlags } from './appearance';
import { WorkspaceStore } from './workspaces';
import { HistoryStore } from './history';

// Disable Chromium features that leak data or profile the user.
app.commandLine.appendSwitch(
  'disable-features',
  'BrowsingTopics,InterestCohort,IdleDetection,HardwareMediaKeyHandling'
);

const isSmokeTest = process.argv.includes('--smoke');

// Settings müssen VOR app.whenReady vorliegen, damit die Chromium-Transparenz-
// Flags noch greifen. Der Store liest die Datei synchron.
const settings: SettingsStore = new SettingsStore(
  join(app.getPath('userData'), 'settings.json')
);
const capabilities = detectAppearanceCapabilities();
const useNativeTransparency =
  settings.get().appearance.nativeTransparency && capabilities.compositing;
enableTransparencyFlags(useNativeTransparency);

let win: BrowserWindow | null = null;
let stats: StatsTracker;
let tabs: TabManager;
let cookiesCleared = false;

// Defense in depth: no webviews, no unexpected child windows anywhere.
app.on('web-contents-created', (_event, wc) => {
  wc.on('will-attach-webview', (event) => event.preventDefault());
});

function createMainWindow(): BrowserWindow {
  const devIcon = join(__dirname, '..', 'build', 'icon.png');
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 480,
    show: false,
    // Bei echter Fenstertransparenz kein opaker Hintergrund (sonst kein Durchblick).
    ...(useNativeTransparency
      ? { transparent: true, backgroundColor: '#00000000' }
      : { backgroundColor: '#121317' }),
    title: 'Verity',
    autoHideMenuBar: true,
    // Eigene Titelleiste: rahmenlos, Fensterknöpfe als thembares Overlay.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#16171c', symbolColor: '#a6a8ad', height: 40 },
    ...(existsSync(devIcon) ? { icon: devIcon } : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The chrome UI itself never opens windows.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return window;
}

app.whenReady().then(() => {
  stats = new StatsTracker();
  const vault = new Vault();

  applyDoH(settings.get());
  settings.on('change', (_data, patch) => {
    if (patch.doh) applyDoH(settings.get());
  });

  const workspaces = new WorkspaceStore();
  const history = new HistoryStore(settings);
  win = createMainWindow();
  tabs = new TabManager(win, settings, stats, workspaces, history);
  registerIpc({ win, tabs, settings, stats, vault, workspaces, history });
  buildMenu(win, tabs, workspaces);

  // Workspace-Wechsel/Änderungen an die UI spiegeln.
  workspaces.on('change', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspaces:update', {
        list: workspaces.list(),
        activeId: workspaces.active().id,
      });
    }
  });

  stats.on('update', (payload) => {
    if (win && !win.isDestroyed()) win.webContents.send('stats:update', payload);
  });

  win.webContents.once('did-finish-load', () => {
    const restored = settings.get().restoreSession && restoreSession(tabs);
    if (!restored) tabs.create();
  });
  win.loadFile(join(__dirname, 'renderer', 'index.html'));

  if (isSmokeTest) {
    // CI/verification mode: boot, capture chrome UI + active page as PNGs
    // (dist/smoke-*.png) for visual review, then exit.
    win.show();
    setTimeout(async () => {
      try {
        if (win && !win.isDestroyed()) {
          const chromeShot = await win.webContents.capturePage();
          writeFileSync(join(__dirname, 'smoke-chrome.png'), chromeShot.toPNG());
          const pageShot = await tabs.captureActive();
          if (pageShot) writeFileSync(join(__dirname, 'smoke-page.png'), pageShot);
        }
      } catch (err) {
        console.error('[verity] smoke capture failed:', err);
      }
      console.log('VERITY_SMOKE_OK');
      app.exit(0);
    }, 5000);
  } else {
    win.once('ready-to-show', () => win?.show());
    initUpdater();
  }
});

const sessionFile = () => join(app.getPath('userData'), 'session.json');

/** Restores the previous session snapshot; returns true if anything was restored. */
function restoreSession(tabManager: TabManager): boolean {
  try {
    const f = sessionFile();
    if (!existsSync(f)) return false;
    const snap = JSON.parse(readFileSync(f, 'utf8')) as { workspaceId: string; url: string }[];
    if (!Array.isArray(snap) || snap.length === 0) return false;
    tabManager.restore(snap);
    return true;
  } catch (err) {
    console.error('[verity] session restore failed:', err);
    return false;
  }
}

function saveSession(): void {
  if (!settings.get().restoreSession || !tabs) return;
  try {
    writeFileSync(sessionFile(), JSON.stringify(tabs.snapshot()), 'utf8');
  } catch (err) {
    console.error('[verity] session save failed:', err);
  }
}

// Privacy: optionally wipe cookies when the browser exits + persist session.
app.on('before-quit', (event) => {
  saveSession();
  if (cookiesCleared || !settings || !settings.get().clearCookiesOnExit) return;
  event.preventDefault();
  cookiesCleared = true;
  session
    .fromPartition('persist:default')
    .clearStorageData({ storages: ['cookies'] })
    .finally(() => app.quit());
});

app.on('window-all-closed', () => {
  app.quit();
});
