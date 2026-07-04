import {
  SEARCH_ENGINES,
  SettingsData,
  StatsPayload,
  TabState,
  ThemeSpec,
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
let openPanelName: 'settings' | 'themes' | 'dashboard' | 'vault' | 'ai' | null = null;
let themeDraft: ThemeSpec | null = null;
let appearanceCaps: { compositing: boolean; sessionType: string } | null = null;

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
  requestAnimationFrame(sendInsets);
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
  { key: 'adblock', label: 'Adblocker', hint: 'Blockiert bekannte Werbenetzwerke.' },
  { key: 'trackerBlock', label: 'Tracker-Blocker', hint: 'Blockiert Analyse- und Tracking-Dienste.' },
  { key: 'httpsOnly', label: 'HTTPS-Only-Modus', hint: 'Erzwingt verschlüsselte Verbindungen.' },
  { key: 'fingerprintProtection', label: 'Anti-Fingerprinting', hint: 'Canvas-Schutz & generischer User-Agent (für neue Tabs).' },
  { key: 'webrtcProtection', label: 'WebRTC-Leak-Schutz', hint: 'Verhindert IP-Leaks über WebRTC (für neue Tabs).' },
  { key: 'threatProtection', label: 'Malware- & Phishing-Schutz', hint: 'Verity Shield: blockiert Schadseiten und Marken-Imitationen mit Warnseite.' },
  { key: 'clearCookiesOnExit', label: 'Cookies beim Beenden löschen', hint: 'Automatisches Aufräumen beim Schließen.' },
];

function renderSettingsPanel(body: HTMLElement): void {
  const s = settings;
  const engineOptions = Object.entries(SEARCH_ENGINES)
    .map(
      ([id, e]) =>
        `<option value="${id}" ${id === s.searchEngine ? 'selected' : ''}>${e.name}</option>`
    )
    .join('');

  body.innerHTML = `
    <div class="section">
      <h3>Sicherheit &amp; Datenschutz</h3>
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
        <label>Script-Blocker (aktiver Tab)<span class="hint">Lädt den Tab ohne JavaScript neu.</span></label>
        <button class="btn" data-toggle-scripts>JS umschalten</button>
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

  body.innerHTML = `
    <div class="section">
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
    const url = resolveInput(addressInput().value);
    verity.tabs.navigate(null, url);
    addressInput().blur();
  });

  $('#btn-split').addEventListener('click', () => verity.tabs.toggleSplit());
  $('#btn-sidebar').addEventListener('click', toggleCompact);
  $('#btn-screenshot').addEventListener('click', async () => {
    const path = await verity.tools.screenshot();
    toast(path ? 'Screenshot gespeichert.' : 'Screenshot fehlgeschlagen.');
  });
  $('#btn-ai').addEventListener('click', () => openPanel('ai'));
  $('#btn-settings').addEventListener('click', () => openPanel('settings'));
  $('#btn-themes').addEventListener('click', () => openPanel('themes'));
  $('#btn-dashboard').addEventListener('click', () => openPanel('dashboard'));
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
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  settings = await verity.settings.get();
  themes = await verity.themes.list();
  stats = await verity.stats.get();
  appearanceCaps = await verity.appearance.capabilities();
  applyThemeById(settings.theme);
  applyAppearance();
  applyLayout();
  renderPinned();
  bindChrome();

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
}

void init();
