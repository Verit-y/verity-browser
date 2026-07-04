import { WebContents } from 'electron';

/**
 * Generic, reduced user agent: hides the Electron token and patch-level
 * version details so SP3 blends in with regular Chrome installs.
 */
export function genericUserAgent(): string {
  const chromeMajor = (process.versions.chrome ?? '124.0.0.0').split('.')[0];
  const os =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}

/**
 * Best-effort main-world anti-fingerprinting script:
 * - adds light noise to canvas reads (toDataURL/toBlob/getImageData)
 * - normalizes hardwareConcurrency and deviceMemory
 * Injected at dom-ready; lazy fingerprinters (the common case) are covered.
 * Limits are documented in docs/SECURITY.md.
 */
const FP_SCRIPT = `(() => {
  if (window.__sp3fp) return; window.__sp3fp = true;
  const addNoise = (canvas) => {
    try {
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx || canvas.width < 16 || canvas.height < 16) return;
      const w = Math.min(canvas.width, 64), h = Math.min(canvas.height, 64);
      const d = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i += 97) d.data[i] = d.data[i] ^ 1;
      ctx.putImageData(d, 0, 0);
    } catch (e) {}
  };
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...a) {
    addNoise(this); return origToDataURL.apply(this, a);
  };
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (...a) {
    addNoise(this); return origToBlob.apply(this, a);
  };
  try {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 4 });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
  } catch (e) {}
})();`;

export function injectAntiFingerprint(wc: WebContents): void {
  wc.on('dom-ready', () => {
    wc.executeJavaScript(FP_SCRIPT, true).catch(() => {
      /* page may have navigated away */
    });
  });
}
