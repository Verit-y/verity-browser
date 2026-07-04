// Shared types between main, preload and renderer.

export type Layout = 'horizontal' | 'vertical';
export type SearchEngineId = 'duckduckgo' | 'brave' | 'startpage' | 'google';

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
  /** Malware-/Phishing-/Scam-Schutz (SP3 Shield). */
  threatProtection: boolean;
  clearCookiesOnExit: boolean;
  ai: AiConfig;
  /** origin -> list of allowed permission names */
  permissions: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'sp3-dark',
  layout: 'vertical',
  homepage: 'sp3://start',
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
  permissions: {},
};

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: string }> = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
};

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
