# TESTING — Verity

## Automatisierte Tests (Vitest)
```
npm test          # einmalig
npx vitest        # Watch-Modus
```
Abgedeckt:
- **Blocklist** (`test/blocklist.test.ts`): `classifyHost` erkennt Ad-/Tracker-Hosts inkl.
  Subdomains, ohne Falsch-Treffer auf Teilstrings.
- **Settings-Migration & -Sync** (`test/settings.test.ts`): SP3→Verity (Theme-IDs, Protokoll),
  Boolean→Level-Migration, Level↔Boolean-Sync, Onboarding-Flag für Fresh vs. Bestand.
- **DoH-Resolver-Switch** (`test/doh.test.ts`): secure/automatic-Modus (Electron gemockt).
- **Verlaufs-Verschlüsselung** (`test/history.test.ts`): Encrypt/Decrypt-Roundtrip
  (safeStorage gemockt), off-Modus speichert nichts, remove/suggest.

## Manuelle Test-Checkliste

### Onboarding
- [ ] Fresh Start (leeres `--user-data-dir`) → Wizard erscheint, 9 Schritte durchklickbar.
- [ ] Jede Option in Schritt 1–7 einmal wählen; „Was bedeutet das technisch?" öffnet sich.
- [ ] DoH → „Eigener Resolver" zeigt URL-Feld; Verlauf ≠ „Kein Verlauf" zeigt Retention-Auswahl.
- [ ] Zusammenfassung spiegelt die Auswahl; „Fertig & starten" speichert; Neustart zeigt kein Onboarding.
- [ ] Settings → „Datenschutz-Assistent → Erneut durchlaufen" öffnet den Wizard erneut.

### Workspaces
- [ ] „+" legt Workspace an und wechselt dorthin (eigenes leeres Tab-Set).
- [ ] In zwei Workspaces dieselbe Seite einloggen → getrennte Cookie-/Login-States (Partition-Isolation).
- [ ] Rechtsklick auf Chip → Umbenennen / Farbe / Löschen; Drag&Drop ordnet neu.
- [ ] Ctrl+1..9 wechselt zum Workspace an Position n; Akzentfarbe der UI folgt dem aktiven Workspace.

### Transparenz / Erscheinungsbild (Wayland vs. X11)
- [ ] Settings → Erscheinungsbild: Sidebar/Toolbar/Popup-Slider ändern die UI live.
- [ ] „Alles koppeln" blendet Einzelregler aus und steuert gemeinsam.
- [ ] Blur & Eckenradius live; Sidebar-Position links/rechts verschiebt Seiten-Card korrekt.
- [ ] „Echte Fenstertransparenz" auf X11 ohne Compositor → Hinweis-Banner statt Blackscreen.
- [ ] Unter Wayland/GNOME/KDE mit Effekten → Desktop scheint nach Neustart durch.

### Verlauf (Verschlüsselung ein/aus)
- [ ] Modus „verschlüsselt", einige http(s)-Seiten besuchen, Neustart → Einträge im Verlauf-Panel.
- [ ] `history.enc` in userData ist **nicht** im Klartext lesbar; `history.json` existiert nicht.
- [ ] Modus „unverschlüsselt" → `history.json` als Klartext; Umschalten räumt die jeweils andere Datei ab.
- [ ] Privater Tab schreibt **nichts** in den Verlauf.
- [ ] Suche in der Adressleiste erscheint als Typ „Suchen"; Filter Alle/Seiten/Suchen greift.
- [ ] Löschen pro Eintrag und „Alles löschen" funktionieren.

### Weitere Features
- [ ] Reader-Modus (Toolbar / Ctrl+Alt+R) zeigt Leseansicht, erneut schließt sie.
- [ ] Bild-in-Bild (Ctrl+Alt+P) auf einer Video-Seite.
- [ ] Session-Wiederherstellung: Toggle an, mehrere Tabs, Neustart → Tabs kommen je Workspace zurück.
- [ ] Mullvad aktiv → Badge in der Toolbar (experimentell).
- [ ] Tresor-Panel zeigt SP3-Lock-Hinweis; ohne SP3-Lock Fallback auf safeStorage.

### Theme Export/Import
- [ ] Theme-Editor → Farbe ändern → Export als JSON; Import derselben Datei stellt das Theme her.

### Rebrand-Verifikation
- [ ] Kein „SP3" mehr in UI, Titel, Menü; `verity://start` als Startseite.
- [ ] `npm run smoke` erzeugt `dist/smoke-*.png` mit Verity-Branding.
