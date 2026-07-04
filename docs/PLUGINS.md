# Plugin-Architektur

SP3 wird erweiterbar, ohne die Sicherheitsgarantien aufzugeben. Deshalb ist
die Architektur in Phasen geteilt; jede Phase ist erst dann „fertig", wenn
sie das Sicherheitsmodell (SECURITY.md) nicht schwächt.

## Phase 1: Manifest-Erkennung (implementiert)

Plugins liegen in `<userData>/plugins/<plugin-id>/` mit einer
`manifest.json`. SP3 erkennt, validiert und listet sie (IPC `plugins:list`).
Es wird in dieser Phase **kein Plugin-Code ausgeführt**: SP3 lädt keinen
Fremdcode in den Hauptprozess, solange es keine Sandbox dafür gibt.

### Manifest-Format

```json
{
  "id": "beispiel-statistik",
  "name": "Beispiel: Block-Statistik",
  "version": "1.0.0",
  "description": "Zeigt erweiterte Statistiken zu blockierten Anfragen.",
  "author": "SP3 Project",
  "entry": "index.js",
  "permissions": ["stats:read"],
  "surfaces": ["panel"]
}
```

| Feld | Bedeutung |
|---|---|
| `id` | Eindeutig, klein, nur `a-z0-9-` |
| `entry` | Einstiegspunkt für Phase 2 |
| `permissions` | Angeforderte API-Bereiche (Allowlist, s. u.) |
| `surfaces` | Wo das Plugin erscheinen darf: `panel`, `toolbar`, `dashboard` |

## Phase 2: Sandboxed Execution (Roadmap)

Geplante Ausführung: Plugin-Code läuft in einem isolierten Renderer
(eigene Partition, keine Node-Integration, strikte CSP) und kommuniziert
ausschließlich über eine schmale, versionierte API:

```
sp3.plugin.stats.read()        Sicherheitszähler lesen (stats:read)
sp3.plugin.panel.render(html)  Eigenes Panel rendern (panel)
sp3.plugin.storage.get/set     Eigener, isolierter Speicher (storage)
sp3.plugin.tabs.onNavigate(cb) Navigations-Ereignisse, nur Metadaten (tabs:observe)
```

Grundsätze:

1. **Allowlist statt Vollzugriff**: Jede API-Fläche ist eine deklarierte
   Permission, die der Nutzer bei der Installation sieht und einzeln
   widerrufen kann.
2. **Kein DOM-Zugriff auf Webseiten** in der ersten Ausbaustufe.
3. **Kein Netzwerkzugriff** ohne `network`-Permission und Host-Allowlist.

## Phase 3: Plugin-Store (Roadmap)

Kuratiertes Verzeichnis mit signierten Paketen, Review-Pflicht für
Permissions jenseits von `panel` + `storage`, reproduzierbare Builds.

## Beispiel

Ein vollständiges Beispiel-Manifest liegt in
[`plugins/beispiel-statistik/`](../plugins/beispiel-statistik/manifest.json).
Kopiere den Ordner nach `<userData>/plugins/`, dann erscheint das Plugin in
der Liste (Phase 1).
