// Shared types between main, preload and renderer.

export type Layout = 'horizontal' | 'vertical';
export type SearchEngineId =
  | 'duckduckgo'
  | 'brave'
  | 'startpage'
  | 'leta'
  | 'google';
export type AdblockLevel = 'off' | 'standard' | 'aggressive';
export type FingerprintLevel = 'off' | 'standard' | 'max';
export type CookieMode = 'all' | 'block-third-party' | 'clear-on-tab' | 'clear-on-exit';
export type HistoryMode = 'off' | 'plain' | 'encrypted';

export interface TabState {
  id: number;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  blockedCount: number;
  container: string;
  isPrivate: boolean;
  scriptsBlocked: boolean;
  active: boolean;
  /** Tab is shown as the second pane of a split view. */
  split: boolean;
}

export interface SecurityStats {
  adsBlocked: number;
  trackersBlocked: number;
  httpsUpgrades: number;
  permissionsDenied: number;
  threatsBlocked: number;
}

export interface BlockedEntry {
  host: string;
  type: 'ad' | 'tracker' | 'threat';
  time: number;
}

export interface StatsPayload extends SecurityStats {
  recentBlocked: BlockedEntry[];
}

export interface ThemeColors {
  bg: string;
  bgElevated: string;
  fg: string;
  fgMuted: string;
  accent: string;
  accentFg: string;
  border: string;
  danger: string;
  success: string;
}

export interface ThemeSpec {
  id: string;
  name: string;
  author?: string;
  dark: boolean;
  colors: ThemeColors;
  /** CSS font-family for the chrome UI. */
  font?: string;
  /** Corner radius in px. */
  radius?: number;
  /** Chrome opacity 0..1 (Glass effect). */
  transparency?: number;
  /** false disables UI animations. */
  animations?: boolean;
}

export interface DohConfig {
  enabled: boolean;
  server: string;
}

export interface AiConfig {
  /** Opt-in: the assistant never runs unless explicitly enabled. */
  enabled: boolean;
  /** Local inference endpoint (Ollama-compatible). Localhost only. */
  endpoint: string;
  model: string;
}

export type AiMode = 'summary' | 'security' | 'privacy';

export interface AiStatus {
  enabled: boolean;
  reachable: boolean;
  models: string[];
  endpoint: string;
  model: string;
}

export interface AiResult {
  ok: boolean;
  text: string;
}

export type SidebarSide = 'left' | 'right';
export type AccentMode = 'mono' | 'accent';

/** Erscheinungsbild: granulare Transparenz, Glass, Layout-Feinschliff. */
export interface AppearanceConfig {
  /** UI-Deckkraft je Bereich (1 = vollständig opak, 0 = transparent). */
  sidebarAlpha: number;
  toolbarAlpha: number;
  popupAlpha: number;
  /** Backdrop-Blur-Stärke in px (unabhängig von der Deckkraft). */
  blur: number;
  /** Wenn true, steuern die Sidebar-Regler alle Bereiche gemeinsam. */
  coupleAll: boolean;
  /** Eckenradius der UI in px. */
  cornerRadius: number;
  sidebarSide: SidebarSide;
  /** Dichtere Abstände. */
  compact: boolean;
  /** Monochrom (kein Farbakzent) oder Akzentfarbe. */
  accentMode: AccentMode;
  /** Überschreibt die Theme-Akzentfarbe im Akzent-Modus. */
  accentColor: string;
  /** Echte Fenstertransparenz (nur wenn Compositor verfügbar; Neustart nötig). */
  nativeTransparency: boolean;
}

export interface AppearanceCapabilities {
  /** Compositing/echte Fenstertransparenz verfügbar. */
  compositing: boolean;
  platform: NodeJS.Platform;
  sessionType: string;
}

export interface SettingsData {
  theme: string;
  layout: Layout;
  homepage: string;
  searchEngine: SearchEngineId;
  adblock: boolean;
  trackerBlock: boolean;
  httpsOnly: boolean;
  doh: DohConfig;
  fingerprintProtection: boolean;
  webrtcProtection: boolean;
  /** Malware-/Phishing-/Scam-Schutz (Verity Shield). */
  threatProtection: boolean;
  clearCookiesOnExit: boolean;
  ai: AiConfig;
  appearance: AppearanceConfig;
  /** Abstufung der Werbe-/Tracker-Blockierung. */
  adblockLevel: AdblockLevel;
  /** Abstufung des Fingerprinting-Schutzes. */
  fingerprintLevel: FingerprintLevel;
  cookieMode: CookieMode;
  /** Verlaufs-Speicherung: keiner / Klartext / verschlüsselt. */
  historyMode: HistoryMode;
  /** Auto-Löschung nach n Tagen (0 = nie). */
  historyRetentionDays: number;
  /** Ersteinrichtungs-Wizard bereits abgeschlossen. */
  onboardingComplete: boolean;
  /** Nach Neustart Tabs/Workspaces wiederherstellen (opt-in). */
  restoreSession: boolean;
  /** origin -> list of allowed permission names */
  permissions: Record<string, string[]>;
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  // Sichtbarer Glass-Effekt ab Werk (Deckkraft < 1 = durchscheinend).
  sidebarAlpha: 0.72,
  toolbarAlpha: 0.72,
  popupAlpha: 0.85,
  blur: 22,
  coupleAll: true,
  cornerRadius: 14,
  sidebarSide: 'left',
  compact: false,
  accentMode: 'accent',
  accentColor: '#7c5cff',
  // Echte Desktop-Transparenz standardmäßig aus (per Setting aktivierbar).
  nativeTransparency: false,
};

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'verity-dark',
  layout: 'vertical',
  homepage: 'verity://start',
  searchEngine: 'duckduckgo',
  adblock: true,
  trackerBlock: true,
  httpsOnly: true,
  doh: { enabled: true, server: 'https://cloudflare-dns.com/dns-query' },
  fingerprintProtection: true,
  webrtcProtection: true,
  threatProtection: true,
  clearCookiesOnExit: false,
  ai: { enabled: false, endpoint: 'http://127.0.0.1:11434', model: 'llama3.2' },
  appearance: { ...DEFAULT_APPEARANCE },
  adblockLevel: 'standard',
  fingerprintLevel: 'standard',
  cookieMode: 'block-third-party',
  historyMode: 'encrypted',
  historyRetentionDays: 90,
  onboardingComplete: false,
  restoreSession: false,
  permissions: {},
};

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: string }> = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
  leta: { name: 'Mullvad Leta', url: 'https://leta.mullvad.net/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
};

export interface Workspace {
  id: string;
  name: string;
  accentColor: string;
}

export interface HistoryEntry {
  url: string;
  title: string;
  ts: number;
  type: 'visit' | 'search';
  favicon?: string;
}

export type HistoryFilter = 'all' | 'visit' | 'search';

export interface WorkspaceState {
  list: Workspace[];
  activeId: string;
}

export interface VaultEntry {
  id: string;
  site: string;
  username: string;
  password: string;
}

export interface VaultStatus {
  available: boolean;
  count: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
}
