// Lokaler KI-Assistent (optional, opt-in).
//
// Talks to an Ollama-compatible endpoint. Privacy guarantees:
//  - disabled by default; nothing runs until the user enables it
//  - the endpoint is restricted to localhost - page content never leaves
//    the machine
//  - requests happen only on explicit user action (button click)

import { AiMode, AiResult, AiStatus, SettingsData } from '../shared/types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function localEndpoint(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!LOCAL_HOSTS.has(url.hostname)) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function aiStatus(settings: SettingsData): Promise<AiStatus> {
  const { ai } = settings;
  const base: AiStatus = {
    enabled: ai.enabled,
    reachable: false,
    models: [],
    endpoint: ai.endpoint,
    model: ai.model,
  };
  const origin = localEndpoint(ai.endpoint);
  if (!ai.enabled || !origin) return base;

  try {
    const res = await fetch(`${origin}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return base;
    const data = (await res.json()) as { models?: { name: string }[] };
    base.reachable = true;
    base.models = (data.models ?? []).map((m) => m.name);
  } catch {
    /* Ollama not running - reported as unreachable */
  }
  return base;
}

const PROMPTS: Record<AiMode, string> = {
  summary:
    'Fasse den folgenden Webseiteninhalt in 3 bis 5 kurzen Sätzen auf Deutsch zusammen. ' +
    'Nenne nur, was wirklich im Text steht.',
  security:
    'Du bist Sicherheitsanalyst. Bewerte den folgenden Webseiteninhalt auf Deutsch: ' +
    'Gibt es Hinweise auf Phishing, Betrugsmaschen, gefälschte Gewinnspiele, Druck-Taktiken ' +
    '("nur heute", "Konto gesperrt") oder verdächtige Zahlungsaufforderungen? ' +
    'Antworte kurz mit einer Einschätzung (unbedenklich / verdächtig / gefährlich) und Begründung.',
  privacy:
    'Du bist Datenschutzprüfer. Bewerte den folgenden Webseiteninhalt auf Deutsch: ' +
    'Welche personenbezogenen Daten verlangt oder beschreibt die Seite, gibt es Hinweise auf ' +
    'Tracking, Newsletter-Zwang, Datenweitergabe an Dritte? ' +
    'Antworte kurz mit einer Datenschutzbewertung (gut / mittel / schlecht) und Begründung.',
};

export async function aiRun(
  settings: SettingsData,
  mode: AiMode,
  page: { url: string; title: string; text: string }
): Promise<AiResult> {
  const { ai } = settings;
  if (!ai.enabled) return { ok: false, text: 'Der KI-Assistent ist deaktiviert (Einstellungen → KI).' };
  const origin = localEndpoint(ai.endpoint);
  if (!origin) {
    return {
      ok: false,
      text: 'Ungültiger Endpunkt: Aus Datenschutzgründen sind nur lokale Endpunkte (localhost) erlaubt.',
    };
  }
  if (!page.text.trim()) {
    return { ok: false, text: 'Kein Seiteninhalt gefunden (leere Seite oder Scripts blockiert).' };
  }

  const prompt =
    `${PROMPTS[mode]}\n\n` +
    `URL: ${page.url}\nTitel: ${page.title}\n\n` +
    `Inhalt:\n${page.text}`;

  try {
    const res = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ai.model, prompt, stream: false }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const detail = res.status === 404 ? ` Ist das Modell „${ai.model}" installiert? (ollama pull ${ai.model})` : '';
      return { ok: false, text: `Lokale KI antwortet mit Fehler ${res.status}.${detail}` };
    }
    const data = (await res.json()) as { response?: string };
    return { ok: true, text: (data.response ?? '').trim() || 'Leere Antwort vom Modell.' };
  } catch {
    return {
      ok: false,
      text:
        'Lokale KI nicht erreichbar. Läuft Ollama? ' +
        `(erwartet unter ${origin}, Modell „${ai.model}")`,
    };
  }
}
