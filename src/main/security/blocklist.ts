// Built-in block lists (host suffix matching). This is a curated starter
// list; full EasyList/EasyPrivacy support is on the roadmap (docs/ROADMAP.md).

const AD_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'amazon-adsystem.com',
  'moatads.com',
  'adsafeprotected.com',
  'doubleverify.com',
  'smartadserver.com',
  'adform.net',
  'yieldlab.net',
  'teads.tv',
  'media.net',
  'adcolony.com',
  'unityads.unity3d.com',
];

const TRACKER_HOSTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'connect.facebook.net',
  'scorecardresearch.com',
  'quantserve.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'branch.io',
  'appsflyer.com',
  'adjust.com',
  'chartbeat.com',
  'bluekai.com',
  'demdex.net',
  'omtrdc.net',
  'krxd.net',
  'addthis.com',
  'sharethis.com',
  'mc.yandex.ru',
  'clarity.ms',
  'fullstory.com',
  'mouseflow.com',
  'crazyegg.com',
  'newrelic.com',
  'bugsnag.com',
];

function matchesAny(hostname: string, list: string[]): boolean {
  for (const domain of list) {
    if (hostname === domain || hostname.endsWith('.' + domain)) return true;
  }
  return false;
}

/** Returns 'ad' | 'tracker' if the hostname is on a block list, else null. */
export function classifyHost(hostname: string): 'ad' | 'tracker' | null {
  if (matchesAny(hostname, TRACKER_HOSTS)) return 'tracker';
  if (matchesAny(hostname, AD_HOSTS)) return 'ad';
  return null;
}

export const BLOCKLIST_SIZES = {
  ads: AD_HOSTS.length,
  trackers: TRACKER_HOSTS.length,
};
