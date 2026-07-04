import { BrowserWindow, ipcMain } from 'electron';
import { AiMode, SettingsData, ThemeSpec } from '../shared/types';
import { aiRun, aiStatus } from './ai';
import { SettingsStore } from './settings';
import { StatsTracker } from './stats';
import { TabManager } from './tabs';
import { Vault } from './vault';
import { listThemes, saveTheme } from './themes';
import { listPlugins } from './plugins';
import { detectAppearanceCapabilities } from './appearance';
import { WorkspaceStore } from './workspaces';
import { HistoryStore } from './history';
import { HistoryFilter } from '../shared/types';

export interface IpcContext {
  win: BrowserWindow;
  tabs: TabManager;
  settings: SettingsStore;
  stats: StatsTracker;
  vault: Vault;
  workspaces: WorkspaceStore;
  history: HistoryStore;
}

export function registerIpc(ctx: IpcContext): void {
  const { tabs, settings, stats, vault, workspaces, history } = ctx;

  // --- Tabs ----------------------------------------------------------------
  ipcMain.on('tabs:create', (_e, url?: string, opts?: object) => {
    tabs.create(url, opts ?? {});
  });
  ipcMain.on('tabs:close', (_e, id: number) => tabs.close(id));
  ipcMain.on('tabs:activate', (_e, id: number) => tabs.activate(id));
  ipcMain.on('tabs:navigate', (_e, id: number | null, url: string) =>
    tabs.navigate(id, url)
  );
  ipcMain.on('tabs:back', (_e, id: number | null) => tabs.back(id));
  ipcMain.on('tabs:forward', (_e, id: number | null) => tabs.forward(id));
  ipcMain.on('tabs:reload', (_e, id: number | null) => tabs.reload(id));
  ipcMain.on('tabs:toggle-scripts', (_e, id: number | null) =>
    tabs.toggleScripts(id)
  );
  ipcMain.on('tabs:toggle-split', () => tabs.toggleSplit());

  // --- Chrome layout --------------------------------------------------------
  ipcMain.on('chrome:insets', (_e, insets: { top: number; left: number; right?: number }) => {
    if (
      insets &&
      Number.isFinite(insets.top) &&
      Number.isFinite(insets.left)
    ) {
      tabs.setInsets({
        top: Math.round(insets.top),
        left: Math.round(insets.left),
        right: Number.isFinite(insets.right) ? Math.round(insets.right!) : undefined,
      });
    }
  });
  ipcMain.on('chrome:panel', (_e, open: boolean) => tabs.setPanelOpen(!!open));
  ipcMain.on('chrome:titlebar', (_e, colors: { color: string; symbolColor: string }) => {
    const ok = /^#[0-9a-f]{6}$/i;
    if (!colors || !ok.test(colors.color) || !ok.test(colors.symbolColor)) return;
    try {
      ctx.win.setTitleBarOverlay({ ...colors, height: 40 });
    } catch {
      /* Overlay wird nicht auf jeder Plattform unterstützt (z. B. macOS) */
    }
  });

  // --- Settings ---------------------------------------------------------------
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:update', (_e, patch: Partial<SettingsData>) =>
    settings.update(patch ?? {})
  );

  // --- Erscheinungsbild / Transparenz ----------------------------------------
  ipcMain.handle('appearance:capabilities', () => detectAppearanceCapabilities());

  // --- Workspaces ------------------------------------------------------------
  const wsState = () => ({ list: workspaces.list(), activeId: workspaces.active().id });
  ipcMain.handle('workspaces:get', () => wsState());
  ipcMain.on('workspaces:activate', (_e, id: string) => tabs.setWorkspace(id));
  ipcMain.handle('workspaces:create', (_e, name?: string) => {
    const ws = workspaces.create(name);
    tabs.setWorkspace(ws.id);
    return wsState();
  });
  ipcMain.handle('workspaces:rename', (_e, id: string, name: string) => {
    workspaces.rename(id, name);
    return wsState();
  });
  ipcMain.handle('workspaces:accent', (_e, id: string, color: string) => {
    workspaces.setAccent(id, color);
    return wsState();
  });
  ipcMain.handle('workspaces:remove', (_e, id: string) => {
    const newActive = workspaces.remove(id);
    tabs.setWorkspace(newActive);
    return wsState();
  });
  ipcMain.handle('workspaces:reorder', (_e, ids: string[]) => {
    workspaces.reorder(ids);
    return wsState();
  });

  // --- Verlauf ---------------------------------------------------------------
  ipcMain.handle('history:query', (_e, search?: string, filter?: HistoryFilter) =>
    history.query(search ?? '', filter ?? 'all')
  );
  ipcMain.handle('history:suggest', (_e, prefix: string) => history.suggest(prefix));
  ipcMain.on('history:search', (_e, url: string, query: string) =>
    history.add({ url, title: query, type: 'search' })
  );
  ipcMain.handle('history:remove', (_e, ts: number, url: string) => {
    history.remove(ts, url);
    return history.query();
  });
  ipcMain.handle('history:clear', (_e, sinceMs?: number) => {
    history.clear(sinceMs ?? 0);
    return history.query();
  });

  // --- Themes -----------------------------------------------------------------
  ipcMain.handle('themes:list', () => listThemes());
  ipcMain.handle('themes:save', (_e, spec: ThemeSpec) => saveTheme(spec));

  // --- Stats / Dashboard --------------------------------------------------------
  ipcMain.handle('stats:get', () => stats.payload());

  // --- Vault ---------------------------------------------------------------------
  ipcMain.handle('vault:status', () => vault.status());
  ipcMain.handle('vault:list', () => vault.list());
  ipcMain.handle(
    'vault:add',
    (_e, entry: { site: string; username: string; password: string }) =>
      vault.add(entry)
  );
  ipcMain.handle('vault:remove', (_e, id: string) => vault.remove(id));

  // --- Plugins ----------------------------------------------------------------------
  ipcMain.handle('plugins:list', () => listPlugins());

  // --- Tools -------------------------------------------------------------------------
  ipcMain.handle('tools:screenshot', () => tabs.screenshot());

  // --- Lokaler KI-Assistent -----------------------------------------------------------
  ipcMain.handle('ai:status', () => aiStatus(settings.get()));
  ipcMain.handle('ai:run', async (_e, mode: AiMode) => {
    if (mode !== 'summary' && mode !== 'security' && mode !== 'privacy') {
      return { ok: false, text: 'Unbekannter Analyse-Modus.' };
    }
    const page = await tabs.pageText();
    if (!page) return { ok: false, text: 'Kein aktiver Tab.' };
    return aiRun(settings.get(), mode, page);
  });
}
