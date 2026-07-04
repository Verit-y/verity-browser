import { app } from 'electron';
import { AppearanceCapabilities } from '../shared/types';

/**
 * Best-effort-Erkennung, ob echte Fenstertransparenz möglich ist.
 * - Windows/macOS: Compositing ist systemweit garantiert.
 * - Linux: hängt vom Compositor ab. Unter Wayland i. d. R. vorhanden; unter
 *   X11 nur mit laufendem Compositing-WM. Wir werten Umgebungsvariablen aus
 *   (Heuristik) und melden das Ergebnis an den Renderer, damit dort ein
 *   Hinweis-Banner statt einer stillen Fehlfunktion erscheint.
 */
export function detectAppearanceCapabilities(): AppearanceCapabilities {
  const platform = process.platform;
  const sessionType = process.env.XDG_SESSION_TYPE ?? '';
  let compositing = true;
  if (platform === 'linux') {
    const wayland = sessionType === 'wayland' || !!process.env.WAYLAND_DISPLAY;
    // X11 ohne bekannten Compositor: konservativ als "unsicher" melden.
    compositing = wayland || !!process.env.XDG_CURRENT_DESKTOP;
  }
  return { compositing, platform, sessionType };
}

/**
 * Muss VOR app.whenReady laufen: aktiviert transparente Visuals auf Linux,
 * damit ein transparentes BrowserWindow überhaupt durchscheinen kann.
 */
export function enableTransparencyFlags(nativeTransparency: boolean): void {
  if (nativeTransparency && process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-transparent-visuals');
  }
}
