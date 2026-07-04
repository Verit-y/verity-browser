import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiMode,
  AiResult,
  AiStatus,
  AppearanceCapabilities,
  SettingsData,
  StatsPayload,
  TabState,
  ThemeSpec,
  VaultEntry,
  VaultStatus,
  PluginInfo,
} from '../shared/types';

/**
 * The only bridge between the chrome UI and the main process.
 * Web pages never get this API - it is exposed exclusively to the
 * chrome renderer (dist/renderer/index.html).
 */
const api = {
  tabs: {
    create: (url?: string, opts?: object) => ipcRenderer.send('tabs:create', url, opts),
    close: (id: number) => ipcRenderer.send('tabs:close', id),
    activate: (id: number) => ipcRenderer.send('tabs:activate', id),
    navigate: (id: number | null, url: string) => ipcRenderer.send('tabs:navigate', id, url),
    back: (id: number | null) => ipcRenderer.send('tabs:back', id),
    forward: (id: number | null) => ipcRenderer.send('tabs:forward', id),
    reload: (id: number | null) => ipcRenderer.send('tabs:reload', id),
    toggleScripts: (id: number | null) => ipcRenderer.send('tabs:toggle-scripts', id),
    toggleSplit: () => ipcRenderer.send('tabs:toggle-split'),
  },
  chrome: {
    setInsets: (insets: { top: number; left: number; right?: number }) =>
      ipcRenderer.send('chrome:insets', insets),
    panelOpen: (open: boolean) => ipcRenderer.send('chrome:panel', open),
    setTitlebar: (colors: { color: string; symbolColor: string }) =>
      ipcRenderer.send('chrome:titlebar', colors),
  },
  settings: {
    get: (): Promise<SettingsData> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<SettingsData>): Promise<SettingsData> =>
      ipcRenderer.invoke('settings:update', patch),
  },
  appearance: {
    capabilities: (): Promise<AppearanceCapabilities> =>
      ipcRenderer.invoke('appearance:capabilities'),
  },
  themes: {
    list: (): Promise<ThemeSpec[]> => ipcRenderer.invoke('themes:list'),
    save: (spec: ThemeSpec): Promise<ThemeSpec> => ipcRenderer.invoke('themes:save', spec),
  },
  stats: {
    get: (): Promise<StatsPayload> => ipcRenderer.invoke('stats:get'),
  },
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:status'),
    list: (): Promise<VaultEntry[]> => ipcRenderer.invoke('vault:list'),
    add: (entry: { site: string; username: string; password: string }): Promise<VaultStatus> =>
      ipcRenderer.invoke('vault:add', entry),
    remove: (id: string): Promise<VaultStatus> => ipcRenderer.invoke('vault:remove', id),
  },
  plugins: {
    list: (): Promise<PluginInfo[]> => ipcRenderer.invoke('plugins:list'),
  },
  tools: {
    screenshot: (): Promise<string | null> => ipcRenderer.invoke('tools:screenshot'),
  },
  ai: {
    status: (): Promise<AiStatus> => ipcRenderer.invoke('ai:status'),
    run: (mode: AiMode): Promise<AiResult> => ipcRenderer.invoke('ai:run', mode),
  },
  onTabs: (cb: (tabs: TabState[]) => void) => {
    ipcRenderer.on('tabs:update', (_e, tabs: TabState[]) => cb(tabs));
  },
  onStats: (cb: (stats: StatsPayload) => void) => {
    ipcRenderer.on('stats:update', (_e, stats: StatsPayload) => cb(stats));
  },
  onFocusAddress: (cb: () => void) => {
    ipcRenderer.on('chrome:focus-address', () => cb());
  },
};

export type VerityApi = typeof api;

contextBridge.exposeInMainWorld('verity', api);
