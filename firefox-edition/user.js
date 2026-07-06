// Verity Firefox Edition – Datenschutz-Voreinstellungen.
// Spiegelt die Verity-Standards auf echtem Firefox (Gecko) wider.
// Wird beim Start als user.js ins Profil geladen und überschreibt prefs.js.

// --- Eigene UI-Anpassung erlauben (userChrome.css) ---------------------------
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.uiCustomization.state", "");
user_pref("browser.compactmode.show", true);
user_pref("browser.uidensity", 1); // kompakt

// --- DNS-over-HTTPS (wie Verity: verschlüsseltes DNS) ------------------------
user_pref("network.trr.mode", 2); // 2 = DoH bevorzugt (mit Fallback); 3 = nur DoH
user_pref("network.trr.uri", "https://cloudflare-dns.com/dns-query");
user_pref("network.trr.custom_uri", "https://cloudflare-dns.com/dns-query");

// --- Tracker-/Werbe-/Fingerprint-Schutz (strikt) ----------------------------
user_pref("browser.contentblocking.category", "strict");
user_pref("privacy.trackingprotection.enabled", true);
user_pref("privacy.trackingprotection.socialtracking.enabled", true);
user_pref("privacy.trackingprotection.cryptomining.enabled", true);
user_pref("privacy.trackingprotection.fingerprinting.enabled", true);
user_pref("privacy.fingerprintingProtection", true);
user_pref("privacy.resistFingerprinting", true); // stärkster Schutz (kann einzelne Seiten beeinflussen)
user_pref("privacy.resistFingerprinting.letterboxing", false);

// --- HTTPS-Only (wie Verity) ------------------------------------------------
user_pref("dom.security.https_only_mode", true);
user_pref("dom.security.https_only_mode_ever_enabled", true);

// --- WebRTC-Leak-Schutz (lokale IPs verbergen) ------------------------------
user_pref("media.peerconnection.ice.default_address_only", true);
user_pref("media.peerconnection.ice.no_host", true);

// --- Cookies: Drittanbieter blockieren (Total Cookie Protection) ------------
user_pref("network.cookie.cookieBehavior", 5);

// --- Keine Telemetrie / kein Pocket / keine Studien -------------------------
user_pref("toolkit.telemetry.enabled", false);
user_pref("toolkit.telemetry.unified", false);
user_pref("toolkit.telemetry.archive.enabled", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("app.shield.optoutstudies.enabled", false);
user_pref("app.normandy.enabled", false);
user_pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
user_pref("extensions.pocket.enabled", false);
user_pref("browser.discovery.enabled", false);

// --- GPC / Do-Not-Track ------------------------------------------------------
user_pref("privacy.globalprivacycontrol.enabled", true);
user_pref("privacy.donottrackheader.enabled", true);

// --- Suche & Start (privacy-freundlich) -------------------------------------
user_pref("browser.urlbar.suggest.searches", false);
user_pref("browser.search.suggest.enabled", false);
user_pref("browser.startup.homepage", "about:home");
user_pref("browser.newtabpage.enabled", true);

// --- Dunkles Theme erzwingen (passt zum Verity-Look) ------------------------
user_pref("layout.css.prefers-color-scheme.content-override", 0); // 0 = dark
user_pref("ui.systemUsesDarkTheme", 1);
user_pref("browser.theme.content-theme", 0);
user_pref("browser.theme.toolbar-theme", 0);
