import {
  SEARCH_ENGINES,
  SettingsData,
  StatsPayload,
  TabState,
  ThemeSpec,
  WorkspaceState,
  HistoryEntry,
} from '../shared/types';
import type { VerityApi } from '../preload/preload';

const verity = (window as unknown as { verity: VerityApi }).verity;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tabs: TabState[] = [];
let settings: SettingsData;
let themes: ThemeSpec[] = [];
let stats: StatsPayload = {
  adsBlocked: 0,
  trackersBlocked: 0,
  httpsUpgrades: 0,
  permissionsDenied: 0,
  threatsBlocked: 0,
  recentBlocked: [],
};
let openPanelName: 'settings' | 'themes' | 'dashboard' | 'vault' | 'ai' | 'history' | null = null;
let themeDraft: ThemeSpec | null = null;
let appearanceCaps: { compositing: boolean; sessionType: string } | null = null;
let workspaceState: WorkspaceState = { list: [], activeId: '' };

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  document.querySelector(sel) as T;

const addressInput = () => $<HTMLInputElement>('#address');

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

function activeTab(): TabState | undefined {
  return tabs.find((t) => t.active);
}

// ---------------------------------------------------------------------------
// Theme handling
// ---------------------------------------------------------------------------

const COLOR_LABELS: Record<keyof ThemeSpec['colors'], string> = {
  bg: 'Hintergrund',
  bgElevated: 'Flächen',
  fg: 'Text',
  fgMuted: 'Text (gedimmt)',
  accent: 'Akzent',
  accentFg: 'Akzent-Text',
  border: 'Rahmen',
  danger: 'Warnung',
  success: 'Erfolg',
};

function applyTheme(theme: ThemeSpec): void {
  const root = document.documentElement.style;
  const map: Record<string, string> = {
    bg: '--bg',
    bgElevated: '--bg-elevated',
    fg: '--fg',
    fgMuted: '--fg-muted',
    accent: '--accent',
    accentFg: '--accent-fg',
    border: '--border',
    danger: '--danger',
    success: '--success',
  };
  for (const [key, cssVar] of Object.entries(map)) {
    root.setProperty(cssVar, theme.colors[key as keyof ThemeSpec['colors']]);
  }
  root.setProperty('--font', theme.font ?? "'Segoe UI', system-ui, sans-serif");
  root.setProperty('--radius', `${theme.radius ?? 10}px`);
  root.setProperty('--chrome-alpha', String(theme.transparency ?? 1));
  root.setProperty('--anim', theme.animations === false ? '0ms' : '160ms');
  document.body.classList.toggle('no-anim', theme.animations === false);
  // Fensterknöpfe (Window Controls Overlay) ans Theme anpassen.
  verity.chrome.setTitlebar({
    color: theme.colors.bg,
    symbolColor: theme.colors.fgMuted,
  });
}

function applyThemeById(id: string): void {
  const theme = themes.find((t) => t.id === id) ?? themes[0];
  if (theme) applyTheme(theme);
}

/**
 * Wendet das Erscheinungsbild (granulare Transparenz, Blur, Radius, Akzent,
 * Compact, Sidebar-Seite) live an — über CSS-Variablen und Body-Klassen.
 */
function applyAppearance(): void {
  const a = settings.appearance;
  const root = document.documentElement.style;
  const couple = a.coupleAll ? a.sidebarAlpha : null;
  root.setProperty('--sidebar-alpha', String(a.sidebarAlpha));
  root.setProperty('--toolbar-alpha', String(couple ?? a.toolbarAlpha));
  root.setProperty('--popup-alpha', String(couple ?? a.popupAlpha));
  root.setProperty('--ui-blur', `${a.blur}px`);
  root.setProperty('--radius', `${a.cornerRadius}px`);
  if (a.accentMode === 'accent') root.setProperty('--accent', a.accentColor);
  document.body.classList.toggle('compact', a.compact);
  document.body.classList.toggle('mono', a.accentMode === 'mono');
  document.body.classList.toggle('sidebar-right', a.sidebarSide === 'right');
  applyWorkspaceAccent();
  requestAnimationFrame(sendInsets);
}

/** Aktiver Workspace überschreibt die Akzentfarbe (außer im Monochrom-Modus). */
function applyWorkspaceAccent(): void {
  if (settings.appearance?.accentMode === 'mono') return;
  const active = workspaceState.list.find((w) => w.id === workspaceState.activeId);
  if (active) document.documentElement.style.setProperty('--accent', active.accentColor);
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

function renderWorkspaces(): void {
  const host = document.getElementById('workspaces');
  if (!host) return;
  host.innerHTML = '';
  for (const ws of workspaceState.list) {
    const chip = document.createElement('button');
    chip.className = 'ws-chip' + (ws.id === workspaceState.activeId ? ' active' : '');
    chip.draggable = true;
    chip.dataset.wsId = ws.id;
    chip.title = ws.name;
    chip.innerHTML =
      `<span class="ws-dot" style="background:${escapeHtml(ws.accentColor)}"></span>` +
      `<span class="ws-name">${escapeHtml(ws.name)}</span>`;
    chip.addEventListener('click', () => verity.workspaces.activate(ws.id));
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      void workspaceContextMenu(ws.id, ws.name);
    });
    chip.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/ws', ws.id));
    chip.addEventListener('dragover', (e) => e.preventDefault());
    chip.addEventListener('drop', async (e) => {
      e.preventDefault();
      const from = e.dataTransfer?.getData('text/ws');
      if (from && from !== ws.id) await reorderWorkspaces(from, ws.id);
    });
    host.appendChild(chip);
  }
  const add = document.createElement('button');
  add.className = 'ws-chip ws-add';
  add.title = 'Neuer Workspace';
  add.textContent = '+';
  add.addEventListener('click', async () => {
    workspaceState = await verity.workspaces.create();
    renderWorkspaces();
  });
  host.appendChild(add);
}

async function reorderWorkspaces(fromId: string, toId: string): Promise<void> {
  const ids = workspaceState.list.map((w) => w.id);
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  workspaceState = await verity.workspaces.reorder(ids);
  renderWorkspaces();
}

async function workspaceContextMenu(id: string, name: string): Promise<void> {
  const action = window.prompt(
    `Workspace „${name}“:\n[r] Umbenennen · [f] Farbe (#hex) · [x] Löschen\nAktion eingeben (r/f/x):`,
    'r'
  );
  if (!action) return;
  if (action.startsWith('r')) {
    const newName = window.prompt('Neuer Name:', name);
    if (newName) workspaceState = await verity.workspaces.rename(id, newName);
  } else if (action.startsWith('f')) {
    const color = window.prompt('Akzentfarbe (#hex):', '#7c5cff');
    if (color) workspaceState = await verity.workspaces.accent(id, color);
  } else if (action.startsWith('x')) {
    if (window.confirm(`Workspace „${name}“ und dessen Tabs schließen?`)) {
      workspaceState = await verity.workspaces.remove(id);
    }
  }
  renderWorkspaces();
  applyWorkspaceAccent();
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const GAP = 10;

function applyLayout(): void {
  const vertical = settings.layout === 'vertical';
  document.body.classList.toggle('vertical', vertical);
  requestAnimationFrame(sendInsets);
}

/**
 * Computes where the floating page card sits and tells the main process,
 * then positions the renderer-side card frame (rounded border + shadow)
 * exactly over that rect so the native view appears to float.
 */
function sendInsets(): void {
  const titlebar = $('#titlebar').offsetHeight;
  const winW = document.documentElement.clientWidth;
  let top: number;
  let left: number;
  let right = GAP;
  const rightSidebar = settings.appearance?.sidebarSide === 'right';
  if (settings.layout === 'vertical') {
    const r = $('#chrome').getBoundingClientRect();
    top = Math.round(titlebar + GAP);
    if (rightSidebar) {
      left = GAP;
      right = Math.round(winW - r.left + GAP);
    } else {
      left = Math.round(r.right + GAP);
    }
  } else {
    left = GAP;
    top = Math.round(titlebar + $('#chrome').offsetHeight + GAP);
  }
  const frame = $('#card-frame');
  frame.style.left = `${left}px`;
  frame.style.top = `${top}px`;
  frame.style.right = `${right}px`;
  frame.style.bottom = `${GAP}px`;
  verity.chrome.setInsets({ top, left, right });
}

// ---------------------------------------------------------------------------
// URL handling
// ---------------------------------------------------------------------------

function resolveInput(raw: string): string {
  const input = raw.trim();
  if (!input) return settings.homepage;
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return input;
  if (!/\s/.test(input) && input.includes('.')) return `https://${input}`;
  const engine = SEARCH_ENGINES[settings.searchEngine] ?? SEARCH_ENGINES.duckduckgo;
  return engine.url + encodeURIComponent(input);
}

// ---------------------------------------------------------------------------
// Tab strip rendering
// ---------------------------------------------------------------------------

function renderTabs(): void {
  const strip = $('#tabstrip');
  strip.replaceChildren();
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.active ? ' active' : '');
    el.setAttribute('role', 'tab');
    el.title = tab.url;

    const flags: string[] = [];
    if (tab.isPrivate) flags.push('PRIVAT');
    else if (tab.container !== 'default') flags.push('CONTAINER');
    if (tab.scriptsBlocked) flags.push('JS AUS');
    if (tab.split) flags.push('SPLIT');

    el.innerHTML =
      (flags.length ? `<span class="tab-flag">${flags.join(' · ')}</span>` : '') +
      `<span class="tab-title">${escapeHtml(tab.title)}</span>` +
      (tab.blockedCount > 0 ? `<span class="tab-badge">${tab.blockedCount}</span>` : '') +
      `<button class="tab-close" title="Tab schließen">×</button>`;

    el.addEventListener('click', () => verity.tabs.activate(tab.id));
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) verity.tabs.close(tab.id);
    });
    el.querySelector('.tab-close')!.addEventListener('click', (e) => {
      e.stopPropagation();
      verity.tabs.close(tab.id);
    });
    strip.appendChild(el);
  }
}

function syncAddress(): void {
  const tab = activeTab();
  if (!tab) return;
  document.title = `${tab.title} – Verity`;
  const input = addressInput();
  if (document.activeElement !== input) {
    input.value = tab.url === 'about:blank' ? '' : tab.url;
  }
  updateShield();
}

function updateShield(): void {
  const tab = activeTab();
  $('#shield-count').textContent = String(tab?.blockedCount ?? 0);
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer: number | undefined;
function toast(message: string): void {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 2600);
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

const PANEL_TITLES = {
  settings: 'Einstellungen',
  themes: 'Themes & Theme-Editor',
  dashboard: 'Sicherheits-Dashboard',
  vault: 'Passwort-Tresor',
  ai: 'KI-Assistent (lokal)',
  history: 'Verlauf',
} as const;

function openPanel(name: typeof openPanelName): void {
  openPanelName = name;
  const panel = $('#panel');
  panel.hidden = !name;
  verity.chrome.panelOpen(!!name);
  if (name) {
    $('#panel-title').textContent = PANEL_TITLES[name];
    void renderPanel();
  }
}

async function renderPanel(): Promise<void> {
  const body = $('#panel-body');
  switch (openPanelName) {
    case 'settings':
      renderSettingsPanel(body);
      break;
    case 'themes':
      renderThemesPanel(body);
      break;
    case 'dashboard':
      renderDashboardPanel(body);
      break;
    case 'vault':
      await renderVaultPanel(body);
      break;
    case 'ai':
      await renderAiPanel(body);
      break;
    case 'history':
      await renderHistoryPanel(body);
      break;
    default:
      break;
  }
}

// --- Settings panel ---------------------------------------------------------

interface ToggleDef {
  key: keyof SettingsData;
  label: string;
  hint: string;
}

const SECURITY_TOGGLES: ToggleDef[] = [
  { key: 'httpsOnly', label: 'HTTPS-Only-Modus', hint: 'Erzwingt verschlüsselte Verbindungen.' },
  { key: 'webrtcProtection', label: 'WebRTC-Leak-Schutz', hint: 'Verhindert IP-Leaks über WebRTC (für neue Tabs).' },
  { key: 'threatProtection', label: 'Malware- & Phishing-Schutz', hint: 'Verity Shield: blockiert Schadseiten und Marken-Imitationen mit Warnseite.' },
];

function renderSettingsPanel(body: HTMLElement): void {
  const s = settings;
  const engineOptions = Object.entries(SEARCH_ENGINES)
    .map(
      ([id, e]) =>
        `<option value="${id}" ${id === s.searchEngine ? 'selected' : ''}>${e.name}</option>`
    )
    .join('');

  const sel = (attr: string, val: string, opts: [string, string][]) =>
    `<select ${attr}>${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

  body.innerHTML = `
    <div class="section">
      <h3>Sicherheit &amp; Datenschutz</h3>
      <div class="row">
        <label>Tracker &amp; Werbung<span class="hint">Abstufung der Blockierung.</span></label>
        ${sel('data-adblock-level', s.adblockLevel, [['off', 'Aus'], ['standard', 'Standard'], ['aggressive', 'Aggressiv']])}
      </div>
      <div class="row">
        <label>Fingerprinting-Schutz<span class="hint">Canvas-Schutz & UA-Normalisierung (neue Tabs).</span></label>
        ${sel('data-fp-level', s.fingerprintLevel, [['off', 'Aus'], ['standard', 'Standard'], ['max', 'Maximal']])}
      </div>
      <div class="row">
        <label>Cookie-Verhalten</label>
        ${sel('data-cookie-mode', s.cookieMode, [['all', 'Alle erlauben'], ['block-third-party', 'Drittanbieter blockieren'], ['clear-on-tab', 'Beim Tab-Schließen löschen'], ['clear-on-exit', 'Beim Beenden löschen']])}
      </div>
      ${SECURITY_TOGGLES.map(
        (t) => `
        <div class="row">
          <label>${t.label}<span class="hint">${t.hint}</span></label>
          <input type="checkbox" data-toggle="${t.key}" ${s[t.key] ? 'checked' : ''} />
        </div>`
      ).join('')}
      <div class="row">
        <label>DNS-over-HTTPS<span class="hint">Verschlüsselte DNS-Auflösung (Modus „secure“, kein Klartext-Fallback).</span></label>
        <input type="checkbox" data-toggle-doh ${s.doh.enabled ? 'checked' : ''} />
      </div>
      <div class="row">
        <label>DoH-Server</label>
        <select data-doh-server>
          <option value="https://cloudflare-dns.com/dns-query" ${s.doh.server.includes('cloudflare') ? 'selected' : ''}>Cloudflare</option>
          <option value="https://dns.quad9.net/dns-query" ${s.doh.server.includes('quad9') ? 'selected' : ''}>Quad9</option>
          <option value="https://dns.mullvad.net/dns-query" ${s.doh.server.includes('mullvad') ? 'selected' : ''}>Mullvad</option>
        </select>
      </div>
    </div>

    <div class="section">
      <h3>Browser</h3>
      <div class="row">
        <label>Suchmaschine</label>
        <select data-engine>${engineOptions}</select>
      </div>
      <div class="row">
        <label>Startseite</label>
        <input type="text" data-homepage value="${escapeHtml(s.homepage)}" />
      </div>
      <div class="row">
        <label>Tab-Layout<span class="hint">Vertikale Tabs für Power-User.</span></label>
        <select data-layout>
          <option value="horizontal" ${s.layout === 'horizontal' ? 'selected' : ''}>Horizontal</option>
          <option value="vertical" ${s.layout === 'vertical' ? 'selected' : ''}>Vertikal (Sidebar)</option>
        </select>
      </div>
      <div class="row">
        <label>Verlauf<span class="hint">Speicherung des Browserverlaufs.</span></label>
        ${sel('data-history-mode', s.historyMode, [['off', 'Kein Verlauf'], ['plain', 'Lokal (unverschlüsselt)'], ['encrypted', 'Lokal (verschlüsselt)']])}
      </div>
      <div class="row">
        <label>Sitzung wiederherstellen<span class="hint">Beim Start Tabs & Workspaces der letzten Sitzung öffnen.</span></label>
        <input type="checkbox" data-toggle="restoreSession" ${s.restoreSession ? 'checked' : ''} />
      </div>
      <div class="row">
        <label>Script-Blocker (aktiver Tab)<span class="hint">Lädt den Tab ohne JavaScript neu.</span></label>
        <button class="btn" data-toggle-scripts>JS umschalten</button>
      </div>
      <div class="row">
        <label>Datenschutz-Assistent<span class="hint">Ersteinrichtung erneut durchlaufen.</span></label>
        <button class="btn" data-rerun-onboarding>Erneut durchlaufen</button>
      </div>
    </div>

    ${renderAppearanceSection(s)}

    <div class="section">
      <h3>Lokaler KI-Assistent (optional)</h3>
      <div class="row">
        <label>KI-Assistent aktivieren<span class="hint">Läuft komplett lokal (Ollama). Seiteninhalte verlassen nie deinen Rechner.</span></label>
        <input type="checkbox" data-ai-enabled ${s.ai.enabled ? 'checked' : ''} />
      </div>
      <div class="row">
        <label>Modell<span class="hint">z. B. llama3.2, mistral, qwen2.5</span></label>
        <input type="text" data-ai-model value="${escapeHtml(s.ai.model)}" />
      </div>
      <div class="row">
        <label>Endpunkt<span class="hint">Nur localhost erlaubt.</span></label>
        <input type="text" data-ai-endpoint value="${escapeHtml(s.ai.endpoint)}" />
      </div>
    </div>

    <div class="section">
      <h3>Tastenkürzel</h3>
      <table class="list">
        <tr><td>Strg+T</td><td>Neuer Tab</td></tr>
        <tr><td>Strg+Umschalt+N</td><td>Neuer privater Tab</td></tr>
        <tr><td>Strg+Alt+T</td><td>Temporärer Container-Tab</td></tr>
        <tr><td>Strg+W</td><td>Tab schließen</td></tr>
        <tr><td>Strg+L</td><td>Adressleiste fokussieren</td></tr>
        <tr><td>Strg+Alt+S</td><td>Split View umschalten</td></tr>
        <tr><td>Strg+Umschalt+S</td><td>Screenshot</td></tr>
        <tr><td>F12</td><td>Entwicklerwerkzeuge</td></tr>
      </table>
    </div>`;

  for (const el of body.querySelectorAll<HTMLInputElement>('[data-toggle]')) {
    el.addEventListener('change', async () => {
      settings = await verity.settings.update({ [el.dataset.toggle!]: el.checked });
    });
  }
  body.querySelector<HTMLInputElement>('[data-toggle-doh]')!.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    settings = await verity.settings.update({ doh: { ...settings.doh, enabled: checked } });
  });
  body.querySelector<HTMLSelectElement>('[data-doh-server]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({
      doh: { ...settings.doh, server: (e.target as HTMLSelectElement).value },
    });
  });
  body.querySelector<HTMLSelectElement>('[data-engine]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({
      searchEngine: (e.target as HTMLSelectElement).value as SettingsData['searchEngine'],
    });
  });
  body.querySelector<HTMLInputElement>('[data-homepage]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({ homepage: (e.target as HTMLInputElement).value });
  });
  body.querySelector<HTMLSelectElement>('[data-layout]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({
      layout: (e.target as HTMLSelectElement).value as SettingsData['layout'],
    });
    applyLayout();
  });
  body.querySelector('[data-toggle-scripts]')!.addEventListener('click', () => {
    verity.tabs.toggleScripts(null);
    openPanel(null);
  });
  body.querySelector<HTMLSelectElement>('[data-adblock-level]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({ adblockLevel: (e.target as HTMLSelectElement).value as SettingsData['adblockLevel'] });
  });
  body.querySelector<HTMLSelectElement>('[data-fp-level]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({ fingerprintLevel: (e.target as HTMLSelectElement).value as SettingsData['fingerprintLevel'] });
  });
  body.querySelector<HTMLSelectElement>('[data-cookie-mode]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({ cookieMode: (e.target as HTMLSelectElement).value as SettingsData['cookieMode'] });
  });
  body.querySelector<HTMLSelectElement>('[data-history-mode]')!.addEventListener('change', async (e) => {
    settings = await verity.settings.update({ historyMode: (e.target as HTMLSelectElement).value as SettingsData['historyMode'] });
  });
  body.querySelector('[data-rerun-onboarding]')!.addEventListener('click', () => {
    openPanel(null);
    startOnboarding();
  });
  body.querySelector<HTMLInputElement>('[data-ai-enabled]')!.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    settings = await verity.settings.update({ ai: { ...settings.ai, enabled } });
  });
  body.querySelector<HTMLInputElement>('[data-ai-model]')!.addEventListener('change', async (e) => {
    const model = (e.target as HTMLInputElement).value.trim();
    if (model) settings = await verity.settings.update({ ai: { ...settings.ai, model } });
  });
  body.querySelector<HTMLInputElement>('[data-ai-endpoint]')!.addEventListener('change', async (e) => {
    const endpoint = (e.target as HTMLInputElement).value.trim();
    if (endpoint) settings = await verity.settings.update({ ai: { ...settings.ai, endpoint } });
  });
  bindAppearance(body);
}

// --- Erscheinungsbild / Transparenz -----------------------------------------

function renderAppearanceSection(s: SettingsData): string {
  const a = s.appearance;
  const pct = (v: number) => Math.round(v * 100);
  const warn =
    a.nativeTransparency && appearanceCaps && !appearanceCaps.compositing
      ? `<div class="banner-warn">⚠ Echte Fenstertransparenz ist auf diesem System vermutlich nicht verfügbar
           (kein Compositor erkannt${appearanceCaps.sessionType ? `, Session: ${escapeHtml(appearanceCaps.sessionType)}` : ''}).
           Der simulierte Glass-Effekt (UI-Ebenen) funktioniert trotzdem.</div>`
      : '';
  return `
    <div class="section">
      <h3>Erscheinungsbild &amp; Transparenz</h3>
      ${warn}
      <div class="row">
        <label>Alles koppeln<span class="hint">Ein Regler steuert Sidebar, Toolbar und Popups gemeinsam.</span></label>
        <input type="checkbox" data-app-couple ${a.coupleAll ? 'checked' : ''} />
      </div>
      <div class="row">
        <label>Sidebar-Deckkraft<span class="hint" data-app-out="sidebar">${pct(a.sidebarAlpha)} %</span></label>
        <input type="range" min="0" max="100" value="${pct(a.sidebarAlpha)}" data-app-alpha="sidebarAlpha" />
      </div>
      <div class="row" ${a.coupleAll ? 'hidden' : ''} data-app-uncoupled>
        <label>Toolbar-Deckkraft<span class="hint" data-app-out="toolbar">${pct(a.toolbarAlpha)} %</span></label>
        <input type="range" min="0" max="100" value="${pct(a.toolbarAlpha)}" data-app-alpha="toolbarAlpha" />
      </div>
      <div class="row" ${a.coupleAll ? 'hidden' : ''} data-app-uncoupled>
        <label>Popup-Deckkraft<span class="hint" data-app-out="popup">${pct(a.popupAlpha)} %</span></label>
        <input type="range" min="0" max="100" value="${pct(a.popupAlpha)}" data-app-alpha="popupAlpha" />
      </div>
      <div class="row">
        <label>Blur-Intensität<span class="hint" data-app-out="blur">${a.blur} px</span></label>
        <input type="range" min="0" max="60" value="${a.blur}" data-app-blur />
      </div>
      <div class="row">
        <label>Eckenradius<span class="hint" data-app-out="radius">${a.cornerRadius} px</span></label>
        <input type="range" min="0" max="28" value="${a.cornerRadius}" data-app-radius />
      </div>
      <div class="row">
        <label>Sidebar-Position</label>
        <select data-app-side>
          <option value="left" ${a.sidebarSide === 'left' ? 'selected' : ''}>Links</option>
          <option value="right" ${a.sidebarSide === 'right' ? 'selected' : ''}>Rechts</option>
        </select>
      </div>
      <div class="row">
        <label>Kompaktmodus<span class="hint">Dichtere Abstände.</span></label>
        <input type="checkbox" data-app-compact ${a.compact ? 'checked' : ''} />
      </div>
      <div class="row">
        <label>Akzent-Modus</label>
        <select data-app-accentmode>
          <option value="accent" ${a.accentMode === 'accent' ? 'selected' : ''}>Akzentfarbe</option>
          <option value="mono" ${a.accentMode === 'mono' ? 'selected' : ''}>Monochrom</option>
        </select>
      </div>
      <div class="row">
        <label>Akzentfarbe</label>
        <input type="color" data-app-accentcolor value="${escapeHtml(a.accentColor)}" />
      </div>
      <div class="row">
        <label>Echte Fenstertransparenz<span class="hint">Desktop-Durchblick (Compositor nötig, Neustart erforderlich).</span></label>
        <input type="checkbox" data-app-native ${a.nativeTransparency ? 'checked' : ''} />
      </div>
    </div>`;
}

async function patchAppearance(patch: Partial<SettingsData['appearance']>): Promise<void> {
  settings = await verity.settings.update({ appearance: { ...settings.appearance, ...patch } });
  applyAppearance();
}

function bindAppearance(body: HTMLElement): void {
  const setOut = (name: string, text: string) => {
    const el = body.querySelector(`[data-app-out="${name}"]`);
    if (el) el.textContent = text;
  };
  body.querySelector<HTMLInputElement>('[data-app-couple]')?.addEventListener('change', async (e) => {
    await patchAppearance({ coupleAll: (e.target as HTMLInputElement).checked });
    void renderPanel();
  });
  for (const el of body.querySelectorAll<HTMLInputElement>('[data-app-alpha]')) {
    el.addEventListener('input', () => {
      const key = el.dataset.appAlpha as 'sidebarAlpha' | 'toolbarAlpha' | 'popupAlpha';
      const v = Number(el.value) / 100;
      setOut(key.replace('Alpha', ''), `${el.value} %`);
      void patchAppearance({ [key]: v });
    });
  }
  body.querySelector<HTMLInputElement>('[data-app-blur]')?.addEventListener('input', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    setOut('blur', `${v} px`);
    void patchAppearance({ blur: v });
  });
  body.querySelector<HTMLInputElement>('[data-app-radius]')?.addEventListener('input', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    setOut('radius', `${v} px`);
    void patchAppearance({ cornerRadius: v });
  });
  body.querySelector<HTMLSelectElement>('[data-app-side]')?.addEventListener('change', (e) => {
    void patchAppearance({ sidebarSide: (e.target as HTMLSelectElement).value as 'left' | 'right' });
  });
  body.querySelector<HTMLInputElement>('[data-app-compact]')?.addEventListener('change', (e) => {
    void patchAppearance({ compact: (e.target as HTMLInputElement).checked });
  });
  body.querySelector<HTMLSelectElement>('[data-app-accentmode]')?.addEventListener('change', (e) => {
    void patchAppearance({ accentMode: (e.target as HTMLSelectElement).value as 'mono' | 'accent' });
  });
  body.querySelector<HTMLInputElement>('[data-app-accentcolor]')?.addEventListener('input', (e) => {
    void patchAppearance({ accentColor: (e.target as HTMLInputElement).value });
  });
  body.querySelector<HTMLInputElement>('[data-app-native]')?.addEventListener('change', async (e) => {
    await patchAppearance({ nativeTransparency: (e.target as HTMLInputElement).checked });
    void renderPanel();
    toast('Echte Fenstertransparenz greift nach einem Neustart.');
  });
}

// --- Themes panel -------------------------------------------------------------

function renderThemesPanel(body: HTMLElement): void {
  if (!themeDraft) {
    const current = themes.find((t) => t.id === settings.theme) ?? themes[0];
    themeDraft = JSON.parse(JSON.stringify(current)) as ThemeSpec;
    themeDraft.id = `${current.id}-custom`;
    themeDraft.name = `${current.name} (Kopie)`;
  }
  const draft = themeDraft;

  body.innerHTML = `
    <div class="section">
      <h3>Installierte Themes</h3>
      <div class="theme-grid">
        ${themes
          .map(
            (t) => `
          <div class="theme-card ${t.id === settings.theme ? 'current' : ''}" data-theme="${t.id}">
            <div class="theme-swatch">
              <i style="background:${t.colors.bg}"></i>
              <i style="background:${t.colors.bgElevated}"></i>
              <i style="background:${t.colors.accent}"></i>
              <i style="background:${t.colors.fg}"></i>
            </div>
            <p>${escapeHtml(t.name)}<small>${t.dark ? 'Dunkel' : 'Hell'}${t.author ? ' · ' + escapeHtml(t.author) : ''}</small></p>
          </div>`
          )
          .join('')}
      </div>
    </div>

    <div class="section">
      <h3>Theme-Editor (Live-Vorschau)</h3>
      <div class="row">
        <label>Name</label>
        <input type="text" data-draft-name value="${escapeHtml(draft.name)}" />
      </div>
      <div class="editor-grid">
        ${Object.entries(COLOR_LABELS)
          .map(
            ([key, label]) => `
          <div class="row">
            <label>${label}</label>
            <input type="color" data-color="${key}" value="${draft.colors[key as keyof ThemeSpec['colors']]}" />
          </div>`
          )
          .join('')}
      </div>
      <div class="row">
        <label>Eckenradius (${draft.radius ?? 10}px)</label>
        <input type="range" min="0" max="20" data-draft-radius value="${draft.radius ?? 10}" />
      </div>
      <div class="row">
        <label>Transparenz (Glas-Effekt)</label>
        <input type="range" min="50" max="100" data-draft-alpha value="${Math.round((draft.transparency ?? 1) * 100)}" />
      </div>
      <div class="row">
        <label>Animationen</label>
        <input type="checkbox" data-draft-anim ${draft.animations !== false ? 'checked' : ''} />
      </div>
      <div class="row" style="justify-content:flex-end; gap:8px">
        <button class="btn" data-import>Importieren…</button>
        <button class="btn" data-export>Exportieren</button>
        <button class="btn primary" data-save>Speichern &amp; anwenden</button>
        <input type="file" data-import-file accept=".json" hidden />
      </div>
      <p class="hint" style="color:var(--fg-muted);font-size:11.5px">
        Theme-Marktplatz: in Vorbereitung (docs/THEMES.md) – Import/Export funktioniert bereits über JSON-Dateien.
      </p>
    </div>`;

  for (const card of body.querySelectorAll<HTMLElement>('[data-theme]')) {
    card.addEventListener('click', async () => {
      const id = card.dataset.theme!;
      settings = await verity.settings.update({ theme: id });
      themeDraft = null;
      applyThemeById(id);
      renderThemesPanel(body);
    });
  }

  body.querySelector<HTMLInputElement>('[data-draft-name]')!.addEventListener('input', (e) => {
    draft.name = (e.target as HTMLInputElement).value;
    draft.id = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || draft.id;
  });
  for (const input of body.querySelectorAll<HTMLInputElement>('[data-color]')) {
    input.addEventListener('input', () => {
      draft.colors[input.dataset.color as keyof ThemeSpec['colors']] = input.value;
      applyTheme(draft);
    });
  }
  body.querySelector<HTMLInputElement>('[data-draft-radius]')!.addEventListener('input', (e) => {
    draft.radius = Number((e.target as HTMLInputElement).value);
    applyTheme(draft);
  });
  body.querySelector<HTMLInputElement>('[data-draft-alpha]')!.addEventListener('input', (e) => {
    draft.transparency = Number((e.target as HTMLInputElement).value) / 100;
    applyTheme(draft);
  });
  body.querySelector<HTMLInputElement>('[data-draft-anim]')!.addEventListener('change', (e) => {
    draft.animations = (e.target as HTMLInputElement).checked;
    applyTheme(draft);
  });

  body.querySelector('[data-save]')!.addEventListener('click', async () => {
    const saved = await verity.themes.save(draft);
    themes = await verity.themes.list();
    settings = await verity.settings.update({ theme: saved.id });
    themeDraft = null;
    applyThemeById(saved.id);
    renderThemesPanel(body);
    toast(`Theme „${saved.name}" gespeichert.`);
  });

  body.querySelector('[data-export]')!.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.id}.verity-theme.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileInput = body.querySelector<HTMLInputElement>('[data-import-file]')!;
  body.querySelector('[data-import]')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const spec = JSON.parse(await file.text()) as ThemeSpec;
      if (!spec.id || !spec.colors) throw new Error('Ungültiges Theme-Format');
      await verity.themes.save(spec);
      themes = await verity.themes.list();
      toast(`Theme „${spec.name}" importiert.`);
      renderThemesPanel(body);
    } catch {
      toast('Import fehlgeschlagen: keine gültige Verity-Theme-Datei.');
    }
  });
}

// --- Dashboard panel ---------------------------------------------------------

function renderDashboardPanel(body: HTMLElement): void {
  const s = settings;
  const protections: [string, boolean][] = [
    ['Adblocker', s.adblock],
    ['Tracker-Blocker', s.trackerBlock],
    ['HTTPS-Only', s.httpsOnly],
    ['DNS-over-HTTPS', s.doh.enabled],
    ['Anti-Fingerprinting', s.fingerprintProtection],
    ['WebRTC-Schutz', s.webrtcProtection],
    ['Malware-/Phishing-Schutz', s.threatProtection],
    ['Cookie-Autolöschung', s.clearCookiesOnExit],
  ];
  const typeLabels = { ad: 'Werbung', tracker: 'Tracker', threat: 'Bedrohung' } as const;

  body.innerHTML = `
    <div class="section">
      <h3>Diese Sitzung</h3>
      <div class="stat-grid">
        <div class="stat-card"><b>${stats.adsBlocked}</b><span>Werbung blockiert</span></div>
        <div class="stat-card"><b>${stats.trackersBlocked}</b><span>Tracker blockiert</span></div>
        <div class="stat-card"><b>${stats.httpsUpgrades}</b><span>HTTPS-Upgrades</span></div>
        <div class="stat-card"><b>${stats.permissionsDenied}</b><span>Berechtigungen verweigert</span></div>
        <div class="stat-card"><b>${stats.threatsBlocked}</b><span>Bedrohungen blockiert</span></div>
      </div>
    </div>
    <div class="section">
      <h3>Aktive Schutzfunktionen</h3>
      ${protections
        .map(([name, on]) => `<span class="chip ${on ? 'on' : 'off'}">${name} ${on ? '✓' : '✕'}</span>`)
        .join('')}
    </div>
    <div class="section">
      <h3>Zuletzt blockiert</h3>
      ${
        stats.recentBlocked.length === 0
          ? '<p style="color:var(--fg-muted);font-size:13px">Noch nichts blockiert – surfe los.</p>'
          : `<table class="list">
              <tr><th>Host</th><th>Typ</th><th>Zeit</th></tr>
              ${stats.recentBlocked
                .slice(0, 15)
                .map(
                  (b) => `<tr>
                    <td>${escapeHtml(b.host)}</td>
                    <td>${typeLabels[b.type]}</td>
                    <td>${new Date(b.time).toLocaleTimeString()}</td>
                  </tr>`
                )
                .join('')}
            </table>`
      }
    </div>`;
}

// --- History panel --------------------------------------------------------------

let historyFilter: 'all' | 'visit' | 'search' = 'all';
let historySearch = '';

async function renderHistoryPanel(body: HTMLElement): Promise<void> {
  if (settings.historyMode === 'off') {
    body.innerHTML = `
      <div class="section">
        <p class="hint">Der Verlauf ist deaktiviert. Aktiviere ihn in den Einstellungen
        (Browser → Verlauf), um besuchte Seiten und Suchanfragen zu speichern.</p>
      </div>`;
    return;
  }
  const entries = await verity.history.query(historySearch, historyFilter);
  const groups = groupByDay(entries);
  const filterBtn = (v: typeof historyFilter, label: string) =>
    `<button class="chip${historyFilter === v ? ' active' : ''}" data-hfilter="${v}">${label}</button>`;

  body.innerHTML = `
    <div class="section">
      <div class="hist-toolbar">
        <input type="text" id="hist-search" placeholder="Verlauf durchsuchen…" value="${escapeHtml(historySearch)}" />
        <div class="chips">
          ${filterBtn('all', 'Alle')}${filterBtn('visit', 'Seiten')}${filterBtn('search', 'Suchen')}
        </div>
        <button class="btn danger" data-hist-clear>Alles löschen</button>
      </div>
      ${entries.length === 0 ? '<p class="hint">Keine Einträge.</p>' : ''}
      ${groups
        .map(
          ([day, items]) => `
        <div class="hist-day">${escapeHtml(day)}</div>
        ${items
          .map(
            (e) => `
          <div class="hist-row" data-url="${escapeHtml(e.url)}" data-ts="${e.ts}">
            <span class="hist-type ${e.type}">${e.type === 'search' ? '🔍' : '🌐'}</span>
            <span class="hist-main">
              <span class="hist-title">${escapeHtml(e.title || e.url)}</span>
              <span class="hist-url">${escapeHtml(e.url)}</span>
            </span>
            <span class="hist-time">${new Date(e.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
            <button class="hist-del" data-del title="Entfernen">✕</button>
          </div>`
          )
          .join('')}`
        )
        .join('')}
    </div>`;

  body.querySelector<HTMLInputElement>('#hist-search')!.addEventListener('input', (e) => {
    historySearch = (e.target as HTMLInputElement).value;
    void renderHistoryPanel(body);
  });
  for (const chip of body.querySelectorAll<HTMLButtonElement>('[data-hfilter]')) {
    chip.addEventListener('click', () => {
      historyFilter = chip.dataset.hfilter as typeof historyFilter;
      void renderHistoryPanel(body);
    });
  }
  body.querySelector('[data-hist-clear]')!.addEventListener('click', async () => {
    if (window.confirm('Gesamten Verlauf löschen?')) {
      await verity.history.clear(0);
      void renderHistoryPanel(body);
    }
  });
  for (const row of body.querySelectorAll<HTMLElement>('.hist-row')) {
    const url = row.dataset.url!;
    const ts = Number(row.dataset.ts);
    row.querySelector('.hist-main')!.addEventListener('click', () => {
      verity.tabs.create(url);
      openPanel(null);
    });
    row.querySelector('[data-del]')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      await verity.history.remove(ts, url);
      void renderHistoryPanel(body);
    });
  }
}

function groupByDay(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const map = new Map<string, HistoryEntry[]>();
  const today = new Date().toDateString();
  const yest = new Date(Date.now() - 86400_000).toDateString();
  for (const e of entries) {
    const d = new Date(e.ts).toDateString();
    const label = d === today ? 'Heute' : d === yest ? 'Gestern' : new Date(e.ts).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  return [...map.entries()];
}

// --- Vault panel ----------------------------------------------------------------

async function renderVaultPanel(body: HTMLElement): Promise<void> {
  const status = await verity.vault.status();
  if (!status.available) {
    body.innerHTML = `<p style="color:var(--fg-muted)">
      Der verschlüsselte Tresor ist auf diesem System nicht verfügbar
      (Betriebssystem-Schlüsselbund nicht erreichbar).</p>`;
    return;
  }
  const entries = await verity.vault.list();
  const bridge = await verity.vault.bridge();
  const bridgeNote = bridge.available
    ? '<p class="hint">SP3-Lock erkannt — Autofill-Vorschläge nutzen den externen Vault.</p>'
    : '<p class="hint">Basis-Funktion. Für vollen Funktionsumfang (geteilter Vault, Autofill) SP3-Lock installieren.</p>';

  body.innerHTML = `
    <div class="section">
      ${bridgeNote}
      <h3>Gespeicherte Zugänge (${entries.length}) – verschlüsselt über den OS-Schlüsselbund</h3>
      ${
        entries.length === 0
          ? '<p style="color:var(--fg-muted);font-size:13px">Noch keine Einträge.</p>'
          : `<table class="list">
              <tr><th>Seite</th><th>Benutzer</th><th>Passwort</th><th></th></tr>
              ${entries
                .map(
                  (e) => `<tr>
                    <td>${escapeHtml(e.site)}</td>
                    <td>${escapeHtml(e.username)}</td>
                    <td><span data-secret="${escapeHtml(e.password)}">••••••••</span>
                        <button class="btn" data-reveal style="padding:2px 8px;font-size:11px">zeigen</button></td>
                    <td><button class="btn danger" data-del="${e.id}" style="padding:2px 8px;font-size:11px">löschen</button></td>
                  </tr>`
                )
                .join('')}
            </table>`
      }
    </div>
    <div class="section">
      <h3>Neuer Eintrag</h3>
      <div class="row"><label>Seite</label><input type="text" data-v-site placeholder="example.org" /></div>
      <div class="row"><label>Benutzername</label><input type="text" data-v-user /></div>
      <div class="row"><label>Passwort</label><input type="password" data-v-pass /></div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn primary" data-v-add>Im Tresor speichern</button>
      </div>
    </div>`;

  for (const btn of body.querySelectorAll<HTMLButtonElement>('[data-reveal]')) {
    btn.addEventListener('click', () => {
      const span = btn.previousElementSibling as HTMLElement;
      const hidden = span.textContent === '••••••••';
      span.textContent = hidden ? span.dataset.secret! : '••••••••';
      btn.textContent = hidden ? 'verbergen' : 'zeigen';
    });
  }
  for (const btn of body.querySelectorAll<HTMLButtonElement>('[data-del]')) {
    btn.addEventListener('click', async () => {
      await verity.vault.remove(btn.dataset.del!);
      await renderVaultPanel(body);
    });
  }
  body.querySelector('[data-v-add]')!.addEventListener('click', async () => {
    const site = body.querySelector<HTMLInputElement>('[data-v-site]')!.value.trim();
    const username = body.querySelector<HTMLInputElement>('[data-v-user]')!.value.trim();
    const password = body.querySelector<HTMLInputElement>('[data-v-pass]')!.value;
    if (!site || !password) {
      toast('Seite und Passwort sind erforderlich.');
      return;
    }
    await verity.vault.add({ site, username, password });
    toast('Eintrag verschlüsselt gespeichert.');
    await renderVaultPanel(body);
  });
}

// --- AI panel (lokaler Assistent) --------------------------------------------

async function renderAiPanel(body: HTMLElement): Promise<void> {
  body.innerHTML = `<p style="color:var(--fg-muted);font-size:13px">Prüfe lokalen KI-Status…</p>`;
  const status = await verity.ai.status();
  if (openPanelName !== 'ai') return;

  if (!status.enabled) {
    body.innerHTML = `
      <div class="section">
        <h3>Lokaler KI-Assistent ist deaktiviert</h3>
        <p style="color:var(--fg-muted);font-size:13px;line-height:1.5">
          Der Assistent fasst Seiten zusammen und bewertet sie auf Sicherheits- und
          Datenschutzrisiken – komplett lokal über Ollama. Es werden niemals Daten
          an externe Server gesendet, und er läuft nur auf deinen Klick hin.
        </p>
        <div class="row" style="justify-content:flex-end">
          <button class="btn primary" data-ai-on>Aktivieren (Opt-in)</button>
        </div>
      </div>`;
    body.querySelector('[data-ai-on]')!.addEventListener('click', async () => {
      settings = await verity.settings.update({ ai: { ...settings.ai, enabled: true } });
      await renderAiPanel(body);
    });
    return;
  }

  if (!status.reachable) {
    body.innerHTML = `
      <div class="section">
        <h3>Lokale KI nicht erreichbar</h3>
        <p style="color:var(--fg-muted);font-size:13px;line-height:1.5">
          Unter <code>${escapeHtml(status.endpoint)}</code> antwortet kein Ollama-Server.<br/>
          Installation: <code>https://ollama.com</code> → danach <code>ollama pull ${escapeHtml(status.model)}</code>.
        </p>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-ai-retry>Erneut prüfen</button>
        </div>
      </div>`;
    body.querySelector('[data-ai-retry]')!.addEventListener('click', () => void renderAiPanel(body));
    return;
  }

  const modelOptions = (status.models.length ? status.models : [status.model])
    .map((m) => `<option value="${escapeHtml(m)}" ${m === status.model ? 'selected' : ''}>${escapeHtml(m)}</option>`)
    .join('');

  body.innerHTML = `
    <div class="section">
      <h3>Aktive Seite analysieren – 100 % lokal</h3>
      <div class="row">
        <label>Modell</label>
        <select data-ai-model-sel>${modelOptions}</select>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" data-ai-run="summary">Zusammenfassen</button>
        <button class="btn" data-ai-run="security">Sicherheitsanalyse</button>
        <button class="btn" data-ai-run="privacy">Datenschutzbewertung</button>
      </div>
      <pre data-ai-out style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.55;color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;min-height:80px;margin-top:10px">Wähle eine Analyse. Der Seiteninhalt wird nur an deine lokale KI übergeben.</pre>
    </div>`;

  body.querySelector<HTMLSelectElement>('[data-ai-model-sel]')!.addEventListener('change', async (e) => {
    const model = (e.target as HTMLSelectElement).value;
    settings = await verity.settings.update({ ai: { ...settings.ai, model } });
  });

  const out = body.querySelector<HTMLElement>('[data-ai-out]')!;
  const buttons = body.querySelectorAll<HTMLButtonElement>('[data-ai-run]');
  for (const btn of buttons) {
    btn.addEventListener('click', async () => {
      buttons.forEach((b) => (b.disabled = true));
      out.textContent = 'Lokale KI denkt nach… (je nach Modell einige Sekunden)';
      const result = await verity.ai.run(btn.dataset.aiRun as 'summary' | 'security' | 'privacy');
      out.textContent = result.text;
      buttons.forEach((b) => (b.disabled = false));
    });
  }
}

// ---------------------------------------------------------------------------
// Chrome wiring
// ---------------------------------------------------------------------------

function bindChrome(): void {
  $('#btn-back').addEventListener('click', () => verity.tabs.back(null));
  $('#btn-forward').addEventListener('click', () => verity.tabs.forward(null));
  $('#btn-reload').addEventListener('click', () => verity.tabs.reload(null));
  $('#btn-newtab').addEventListener('click', () => verity.tabs.create());

  $('#addressform').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = addressInput().value;
    const url = resolveInput(raw);
    // Suchanfragen separat erfassen (nur wenn nicht als URL erkannt).
    const isSearch = !/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) && !(!/\s/.test(raw.trim()) && raw.includes('.'));
    if (isSearch && raw.trim()) verity.history.search(url, raw.trim());
    verity.tabs.navigate(null, url);
    addressInput().blur();
  });

  $('#btn-split').addEventListener('click', () => verity.tabs.toggleSplit());
  $('#btn-reader').addEventListener('click', () => verity.tabs.reader());
  $('#btn-pip').addEventListener('click', () => verity.tabs.pip());
  $('#btn-sidebar').addEventListener('click', toggleCompact);
  $('#btn-screenshot').addEventListener('click', async () => {
    const path = await verity.tools.screenshot();
    toast(path ? 'Screenshot gespeichert.' : 'Screenshot fehlgeschlagen.');
  });
  $('#btn-ai').addEventListener('click', () => openPanel('ai'));
  $('#btn-settings').addEventListener('click', () => openPanel('settings'));
  $('#btn-themes').addEventListener('click', () => openPanel('themes'));
  $('#btn-dashboard').addEventListener('click', () => openPanel('dashboard'));
  $('#btn-history').addEventListener('click', () => openPanel('history'));
  $('#btn-vault').addEventListener('click', () => openPanel('vault'));
  $('#panel-close').addEventListener('click', () => openPanel(null));
  $('#panel').addEventListener('click', (e) => {
    if (e.target === $('#panel')) openPanel(null);
  });

  $('#cmd').addEventListener('click', (e) => {
    if (e.target === $('#cmd')) closeCmd();
  });
  $('#cmd-input').addEventListener('input', () => renderCmd());
  $('#cmd-input').addEventListener('keydown', onCmdKey);

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      cmdOpen ? closeCmd() : openCmd();
      return;
    }
    if (e.key === 'Escape') {
      if (cmdOpen) closeCmd();
      else if (openPanelName) openPanel(null);
    }
  });
}

// --- Compact-Modus -----------------------------------------------------------

function toggleCompact(): void {
  document.body.classList.toggle('compact');
  const chrome = $('#chrome');
  const onDone = (e: TransitionEvent) => {
    if (e.propertyName !== 'width') return;
    chrome.removeEventListener('transitionend', onDone);
    sendInsets();
  };
  chrome.addEventListener('transitionend', onDone);
}

// --- Pinned-Schnellzugriffe --------------------------------------------------

interface PinnedLink {
  label: string;
  url: string;
}
const PINNED: PinnedLink[] = [
  { label: 'G', url: 'https://www.google.com' },
  { label: 'Y', url: 'https://www.youtube.com' },
  { label: 'R', url: 'https://www.reddit.com' },
  { label: 'GH', url: 'https://github.com' },
];

function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function renderPinned(): void {
  const host = $('#pinned');
  host.replaceChildren();
  for (const p of PINNED) {
    const btn = document.createElement('button');
    btn.className = 'pin';
    btn.title = p.url.replace(/^https?:\/\/(www\.)?/, '');
    btn.textContent = p.label;
    btn.style.setProperty('--pin-h', String(hueFor(p.url)));
    btn.addEventListener('click', () => verity.tabs.create(p.url));
    host.appendChild(btn);
  }
}

// --- Command-Palette ---------------------------------------------------------

let cmdOpen = false;
let cmdSel = 0;

function openCmd(): void {
  if (openPanelName) return;
  cmdOpen = true;
  cmdSel = 0;
  $('#cmd').hidden = false;
  verity.chrome.panelOpen(true);
  const input = $<HTMLInputElement>('#cmd-input');
  input.value = '';
  renderCmd();
  input.focus();
}

function closeCmd(): void {
  if (!cmdOpen) return;
  cmdOpen = false;
  $('#cmd').hidden = true;
  if (!openPanelName) verity.chrome.panelOpen(false);
}

interface CmdItem {
  title: string;
  sub?: string;
  run: () => void;
}

function cmdItems(query: string): CmdItem[] {
  const q = query.trim().toLowerCase();
  const items: CmdItem[] = [];
  for (const tab of tabs) {
    if (q && !tab.title.toLowerCase().includes(q) && !tab.url.toLowerCase().includes(q)) continue;
    items.push({
      title: tab.title || 'Neuer Tab',
      sub: tab.url.replace(/^https?:\/\/(www\.)?/, '') || 'Startseite',
      run: () => verity.tabs.activate(tab.id),
    });
  }
  if (query.trim()) {
    const looksUrl = !/\s/.test(query.trim()) && query.includes('.');
    items.unshift({
      title: looksUrl ? `Öffnen: ${query.trim()}` : `Suchen: ${query.trim()}`,
      sub: looksUrl ? 'Adresse aufrufen' : 'Im neuen Tab suchen',
      run: () => verity.tabs.create(resolveInput(query)),
    });
  }
  return items.slice(0, 8);
}

function renderCmd(): void {
  const query = $<HTMLInputElement>('#cmd-input').value;
  const items = cmdItems(query);
  if (cmdSel >= items.length) cmdSel = Math.max(0, items.length - 1);
  const list = $('#cmd-list');
  list.replaceChildren();
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'cmd-item' + (i === cmdSel ? ' sel' : '');
    el.innerHTML =
      `<span class="cmd-ico"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>` +
      `<span><b>${escapeHtml(item.title)}</b>${item.sub ? ` <span class="cmd-sub">${escapeHtml(item.sub)}</span>` : ''}</span>`;
    el.addEventListener('click', () => {
      item.run();
      closeCmd();
    });
    list.appendChild(el);
  });
}

function onCmdKey(e: KeyboardEvent): void {
  const items = cmdItems($<HTMLInputElement>('#cmd-input').value);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdSel = Math.min(items.length - 1, cmdSel + 1);
    renderCmd();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdSel = Math.max(0, cmdSel - 1);
    renderCmd();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    items[cmdSel]?.run();
    closeCmd();
  }
}

// ---------------------------------------------------------------------------
// Onboarding-Wizard
// ---------------------------------------------------------------------------

interface OnbChoice {
  value: string;
  label: string;
  hint: string;
  recommended?: boolean;
}
interface OnbStep {
  key: keyof SettingsData | 'telemetry' | 'summary';
  title: string;
  intro: string;
  tech?: string;
  choices?: OnbChoice[];
}

const ONB_STEPS: OnbStep[] = [
  {
    key: 'adblockLevel', title: 'Tracker & Werbung',
    intro: 'Wie strikt soll Verity Werbung und Tracker blockieren?',
    tech: 'Verity filtert Netzwerkanfragen gegen Host-Listen (webRequest) und blockiert bekannte Werbe-/Tracking-Domains.',
    choices: [
      { value: 'off', label: 'Aus', hint: 'Keine Blockierung.' },
      { value: 'standard', label: 'Standard', hint: 'Bekannte Werbe- & Tracking-Netzwerke.', recommended: true },
      { value: 'aggressive', label: 'Aggressiv', hint: 'Maximale Blockierung — kann einzelne Seiten beschädigen.' },
    ],
  },
  {
    key: 'doh', title: 'DNS-over-HTTPS',
    intro: 'Verschlüsselte DNS-Auflösung verbirgt, welche Seiten du besuchst, vor dem Netzbetreiber.',
    tech: 'DNS-Anfragen laufen verschlüsselt über HTTPS an einen Resolver statt im Klartext über das System-DNS.',
    choices: [
      { value: 'off', label: 'System-DNS', hint: 'Unverschlüsselt, wie vom Betriebssystem konfiguriert.' },
      { value: 'cloudflare', label: 'Cloudflare', hint: 'Standard-Resolver.', recommended: true },
      { value: 'mullvad', label: 'Mullvad', hint: 'Datenschutzfokussiert (keine Logs).' },
      { value: 'custom', label: 'Eigener Resolver', hint: 'Eigene DoH-URL eingeben.' },
    ],
  },
  {
    key: 'webrtcProtection', title: 'WebRTC-Leak-Schutz',
    intro: 'Verhindert, dass Webseiten deine lokale IP über WebRTC auslesen.',
    tech: 'Verity deaktiviert die Preisgabe lokaler ICE-Kandidaten-IPs über die WebRTC-API.',
    choices: [
      { value: 'true', label: 'An', hint: 'Empfohlen. Blockiert lokale IP-Preisgabe.', recommended: true },
      { value: 'false', label: 'Aus', hint: 'Nötig für manche Video-Call-Tools.' },
    ],
  },
  {
    key: 'fingerprintLevel', title: 'Fingerprinting-Schutz',
    intro: 'Erschwert die Wiedererkennung deines Browsers anhand technischer Merkmale.',
    tech: 'Canvas-Rauschen, generischer User-Agent und normalisierte Hardware-Werte reduzieren die Eindeutigkeit deines Fingerabdrucks.',
    choices: [
      { value: 'off', label: 'Aus', hint: 'Keine Maßnahmen.' },
      { value: 'standard', label: 'Standard', hint: 'Canvas-Schutz & generischer User-Agent.', recommended: true },
      { value: 'max', label: 'Maximal', hint: 'Zusätzlich strengere Normalisierung — kann Kompatibilität kosten.' },
    ],
  },
  {
    key: 'cookieMode', title: 'Cookie-Verhalten',
    intro: 'Wie soll Verity mit Cookies umgehen?',
    tech: 'Cookies werden je Modus eingeschränkt oder beim Schließen aus der Session-Partition gelöscht.',
    choices: [
      { value: 'all', label: 'Alle erlauben', hint: 'Keine Einschränkung.' },
      { value: 'block-third-party', label: 'Drittanbieter blockieren', hint: 'Empfohlen.', recommended: true },
      { value: 'clear-on-tab', label: 'Beim Tab-Schließen löschen', hint: 'Aggressiver.' },
      { value: 'clear-on-exit', label: 'Beim Beenden löschen', hint: 'Cookies überleben die Sitzung nicht.' },
    ],
  },
  {
    key: 'historyMode', title: 'Browserverlauf',
    intro: 'Soll Verity deinen Verlauf speichern? „Kein Verlauf“ bedeutet auch keine Chronik-Suche/Autovervollständigung.',
    tech: 'Verschlüsselter Verlauf wird lokal per OS-Keychain (safeStorage) abgelegt; der Schlüssel verlässt nie deinen Rechner.',
    choices: [
      { value: 'off', label: 'Kein Verlauf', hint: 'Nichts wird gespeichert.' },
      { value: 'plain', label: 'Lokal (unverschlüsselt)', hint: 'Als Klartext-Datei.' },
      { value: 'encrypted', label: 'Lokal (verschlüsselt)', hint: 'Empfohlen. Per OS-Keychain.', recommended: true },
    ],
  },
  {
    key: 'searchEngine', title: 'Suchmaschine',
    intro: 'Welche Suchmaschine soll die Adressleiste nutzen?',
    choices: Object.entries(SEARCH_ENGINES).map(([id, e]) => ({
      value: id, label: e.name, hint: '', recommended: id === 'duckduckgo',
    })),
  },
  {
    key: 'telemetry', title: 'Telemetrie',
    intro: 'Verity sammelt grundsätzlich keine Nutzungsdaten. Es gibt keine Telemetrie-Infrastruktur und keinen versteckten Schalter.',
    tech: 'Kein Analytics, keine Crash-Reports, keine Fernaufrufe außer den von dir gewählten Diensten (Suche, DoH, optionale lokale KI).',
  },
  { key: 'summary', title: 'Zusammenfassung', intro: 'Prüfe deine Auswahl — jede Einstellung ist später jederzeit änderbar.' },
];

let onbIndex = 0;
let onbDraft: Partial<SettingsData> = {};
let onbSelections: Record<string, string> = {};
let onbCustomDoh = '';
let onbRetention = 90;

function startOnboarding(): void {
  onbIndex = 0;
  onbDraft = {};
  onbSelections = {
    adblockLevel: settings.adblockLevel,
    doh: settings.doh.enabled ? (settings.doh.server.includes('mullvad') ? 'mullvad' : 'cloudflare') : 'off',
    webrtcProtection: String(settings.webrtcProtection),
    fingerprintLevel: settings.fingerprintLevel,
    cookieMode: settings.cookieMode,
    historyMode: settings.historyMode,
    searchEngine: settings.searchEngine,
  };
  onbRetention = settings.historyRetentionDays;
  const el = $('#onboarding');
  el.hidden = false;
  // Native Seiten-Views ausblenden, sonst rendern sie über dem Wizard.
  verity.chrome.panelOpen(true);
  renderOnbStep();
}

function renderOnbStep(): void {
  const step = ONB_STEPS[onbIndex];
  const body = $('#onb-body');
  const total = ONB_STEPS.length;
  $('#onb-progress').innerHTML = ONB_STEPS.map(
    (_s, i) => `<span class="onb-dot${i === onbIndex ? ' active' : ''}${i < onbIndex ? ' done' : ''}"></span>`
  ).join('');
  $('#onb-step-label').textContent = `Schritt ${onbIndex + 1} von ${total}`;
  ($('#onb-back') as HTMLButtonElement).disabled = onbIndex === 0;
  $('#onb-next').textContent = onbIndex === total - 1 ? 'Fertig & starten' : 'Weiter';

  if (step.key === 'summary') {
    body.innerHTML = `<h2>${step.title}</h2><p class="onb-intro">${step.intro}</p>` +
      `<div class="onb-summary">${onbSummaryRows()}</div>`;
    return;
  }

  const choices = step.choices ?? [];
  const extra =
    step.key === 'doh' && onbSelections.doh === 'custom'
      ? `<input type="text" id="onb-doh-url" class="onb-input" placeholder="https://dein-resolver/dns-query" value="${escapeHtml(onbCustomDoh)}" />`
      : step.key === 'historyMode' && onbSelections.historyMode !== 'off'
      ? `<label class="onb-inline">Auto-Löschung:
           <select id="onb-retention">
             ${[7, 30, 90, 0].map((d) => `<option value="${d}" ${d === onbRetention ? 'selected' : ''}>${d === 0 ? 'Nie' : d + ' Tage'}</option>`).join('')}
           </select></label>`
      : '';

  body.innerHTML = `
    <h2>${step.title}</h2>
    <p class="onb-intro">${step.intro}</p>
    <div class="onb-choices">
      ${choices.map((c) => `
        <button class="onb-choice${onbSelections[step.key] === c.value ? ' sel' : ''}" data-val="${c.value}">
          <span class="onb-choice-label">${c.label}${c.recommended ? ' <em>· empfohlen</em>' : ''}</span>
          ${c.hint ? `<span class="onb-choice-hint">${c.hint}</span>` : ''}
        </button>`).join('')}
    </div>
    ${extra}
    ${step.tech ? `<details class="onb-tech"><summary>Was bedeutet das technisch?</summary><p>${step.tech}</p></details>` : ''}`;

  for (const btn of body.querySelectorAll<HTMLButtonElement>('.onb-choice')) {
    btn.addEventListener('click', () => {
      onbSelections[step.key] = btn.dataset.val!;
      renderOnbStep();
    });
  }
  body.querySelector<HTMLInputElement>('#onb-doh-url')?.addEventListener('input', (e) => {
    onbCustomDoh = (e.target as HTMLInputElement).value;
  });
  body.querySelector<HTMLSelectElement>('#onb-retention')?.addEventListener('change', (e) => {
    onbRetention = Number((e.target as HTMLSelectElement).value);
  });
}

function onbSummaryRows(): string {
  const rows: [string, string][] = [
    ['Tracker & Werbung', labelOf('adblockLevel', onbSelections.adblockLevel)],
    ['DNS-over-HTTPS', labelOf('doh', onbSelections.doh)],
    ['WebRTC-Schutz', onbSelections.webrtcProtection === 'true' ? 'An' : 'Aus'],
    ['Fingerprinting', labelOf('fingerprintLevel', onbSelections.fingerprintLevel)],
    ['Cookies', labelOf('cookieMode', onbSelections.cookieMode)],
    ['Verlauf', labelOf('historyMode', onbSelections.historyMode)],
    ['Suchmaschine', SEARCH_ENGINES[onbSelections.searchEngine as keyof typeof SEARCH_ENGINES]?.name ?? '—'],
    ['Telemetrie', 'Deaktiviert'],
  ];
  return rows.map(([k, v]) => `<div class="onb-sum-row"><span>${k}</span><b>${escapeHtml(v)}</b></div>`).join('');
}

function labelOf(key: string, value: string): string {
  const step = ONB_STEPS.find((s) => s.key === key);
  return step?.choices?.find((c) => c.value === value)?.label ?? value;
}

function buildOnbPatch(): Partial<SettingsData> {
  const dohMap: Record<string, { enabled: boolean; server: string }> = {
    off: { enabled: false, server: settings.doh.server },
    cloudflare: { enabled: true, server: 'https://cloudflare-dns.com/dns-query' },
    mullvad: { enabled: true, server: 'https://dns.mullvad.net/dns-query' },
    custom: { enabled: true, server: onbCustomDoh.trim() || settings.doh.server },
  };
  return {
    adblockLevel: onbSelections.adblockLevel as SettingsData['adblockLevel'],
    doh: dohMap[onbSelections.doh],
    webrtcProtection: onbSelections.webrtcProtection === 'true',
    fingerprintLevel: onbSelections.fingerprintLevel as SettingsData['fingerprintLevel'],
    cookieMode: onbSelections.cookieMode as SettingsData['cookieMode'],
    historyMode: onbSelections.historyMode as SettingsData['historyMode'],
    historyRetentionDays: onbSelections.historyMode === 'off' ? 0 : onbRetention,
    searchEngine: onbSelections.searchEngine as SettingsData['searchEngine'],
    onboardingComplete: true,
  };
}

function bindOnboarding(): void {
  $('#onb-back').addEventListener('click', () => {
    if (onbIndex > 0) { onbIndex--; renderOnbStep(); }
  });
  $('#onb-next').addEventListener('click', async () => {
    if (onbIndex < ONB_STEPS.length - 1) { onbIndex++; renderOnbStep(); return; }
    onbDraft = buildOnbPatch();
    settings = await verity.settings.update(onbDraft);
    $('#onboarding').hidden = true;
    // Native Seiten-Views wieder einblenden.
    verity.chrome.panelOpen(false);
    applyThemeById(settings.theme);
    applyAppearance();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  settings = await verity.settings.get();
  themes = await verity.themes.list();
  stats = await verity.stats.get();
  appearanceCaps = await verity.appearance.capabilities();
  workspaceState = await verity.workspaces.get();
  applyThemeById(settings.theme);
  applyAppearance();
  applyLayout();
  renderPinned();
  renderWorkspaces();
  bindChrome();

  verity.onWorkspaces((state) => {
    workspaceState = state;
    renderWorkspaces();
    applyWorkspaceAccent();
  });

  verity.onTabs((t) => {
    tabs = t;
    renderTabs();
    syncAddress();
  });
  verity.onStats((s) => {
    stats = s;
    updateShield();
    if (openPanelName === 'dashboard') void renderPanel();
  });
  verity.onFocusAddress(() => {
    addressInput().focus();
    addressInput().select();
  });

  window.addEventListener('resize', sendInsets);
  sendInsets();

  bindOnboarding();
  if (!settings.onboardingComplete) startOnboarding();

  // Experimentelle Mullvad-Erkennung (rein informativ).
  void verity.net.mullvad().then((active) => {
    const badge = document.getElementById('mullvad-badge');
    if (badge) badge.hidden = !active;
  });
}

void init();
