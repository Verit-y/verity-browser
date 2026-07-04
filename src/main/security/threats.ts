// SP3 Shield: Malware-, Phishing- und Scam-Schutz.
//
// Two layers, both conservative to avoid false positives:
//  1. A curated list of known-bad hosts (suffix match). Production builds
//     should subscribe to live feeds (URLhaus, OpenPhish) - see ROADMAP.md.
//  2. Heuristics for the most common scam patterns:
//     - brand impersonation: a well-known brand name appears as its own
//       token in the hostname, but the site is not the brand's real domain
//       (e.g. paypal-verify.example)
//     - login pages served from a raw IP address
//
// Users can proceed anyway from the warning page; the host is then allowed
// for the rest of the session (in memory only, never persisted).

export type ThreatType = 'malware' | 'phishing' | 'scam';

export interface Threat {
  type: ThreatType;
  reason: string;
}

// Known-bad hosts. 'malware.sp3.test' is the built-in demo entry so the
// warning flow can be tested without visiting a real malicious site.
const MALWARE_HOSTS = [
  'malware.sp3.test',
  'phishing.sp3.test',
  'malware.testing.google.test',
  'testsafebrowsing.appspot.com',
];

// Brand -> legitimate registrable domains. A hostname that contains the
// brand as a separate token but does not belong to one of these domains is
// flagged as likely phishing.
const BRANDS: Record<string, string[]> = {
  paypal: ['paypal.com', 'paypal.me'],
  amazon: ['amazon.com', 'amazon.de', 'amazon.co.uk', 'amazon.fr', 'amazon.it', 'amazon.es', 'aws.amazon.com'],
  netflix: ['netflix.com'],
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  whatsapp: ['whatsapp.com', 'whatsapp.net'],
  microsoft: ['microsoft.com', 'live.com', 'office.com', 'outlook.com'],
  google: ['google.com', 'google.de', 'googleapis.com', 'gstatic.com', 'youtube.com', 'withgoogle.com', 'google.test'],
  apple: ['apple.com', 'icloud.com'],
  sparkasse: ['sparkasse.de'],
  postbank: ['postbank.de'],
  commerzbank: ['commerzbank.de'],
  binance: ['binance.com'],
  coinbase: ['coinbase.com'],
  metamask: ['metamask.io'],
  steam: ['steampowered.com', 'steamcommunity.com'],
  dhl: ['dhl.de', 'dhl.com'],
  ebay: ['ebay.com', 'ebay.de'],
};

const LOGIN_KEYWORDS = /login|signin|sign-in|account|verify|password|bank/i;

// Hosts the user chose to visit despite a warning. Session-only.
const allowedHosts = new Set<string>();

export function allowHost(host: string): void {
  allowedHosts.add(host.toLowerCase());
}

function matchesSuffix(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith('.' + domain);
}

/** Brand appears as its own token: bounded by start/end, '.', '-' or digits. */
function containsBrandToken(hostname: string, brand: string): boolean {
  let idx = hostname.indexOf(brand);
  while (idx !== -1) {
    const before = idx === 0 ? '' : hostname[idx - 1];
    const after = hostname[idx + brand.length] ?? '';
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) return true;
    idx = hostname.indexOf(brand, idx + 1);
  }
  return false;
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');
}

const PRIVATE_IP =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[::1\])/;

/**
 * Checks a top-level navigation URL. Returns a Threat if it should be
 * blocked with a warning page, or null if it is fine.
 */
export function checkThreat(url: URL): Threat | null {
  const hostname = url.hostname.toLowerCase();
  if (allowedHosts.has(hostname)) return null;

  for (const bad of MALWARE_HOSTS) {
    if (matchesSuffix(hostname, bad)) {
      return {
        type: 'malware',
        reason: `Die Domain „${hostname}" steht auf der SP3-Liste bekannter Schadseiten.`,
      };
    }
  }

  for (const [brand, domains] of Object.entries(BRANDS)) {
    if (!containsBrandToken(hostname, brand)) continue;
    if (domains.some((d) => matchesSuffix(hostname, d))) continue;
    return {
      type: 'phishing',
      reason:
        `Die Adresse „${hostname}" gibt sich als ${brand[0].toUpperCase() + brand.slice(1)} aus, ` +
        `gehört aber nicht zu den offiziellen Domains dieser Marke. ` +
        `Typisches Muster für Phishing-Seiten, die Zugangsdaten abgreifen.`,
    };
  }

  if (
    isIpAddress(hostname) &&
    !PRIVATE_IP.test(hostname) &&
    LOGIN_KEYWORDS.test(url.pathname + url.search)
  ) {
    return {
      type: 'scam',
      reason:
        `Diese Login-Seite wird direkt über eine IP-Adresse (${hostname}) statt über eine ` +
        `Domain ausgeliefert - seriöse Anbieter machen das nicht.`,
    };
  }

  return null;
}

export const THREAT_LABELS: Record<ThreatType, string> = {
  malware: 'Bekannte Schadseite',
  phishing: 'Phishing-Verdacht',
  scam: 'Betrugsverdacht',
};
