// Builds a Debian/Ubuntu .deb package from release/linux-unpacked WITHOUT any
// native tooling (no fpm, no dpkg, no Docker). A .deb is an `ar` archive of
// three members: debian-binary, control.tar.gz, data.tar.gz. We emit the tar
// (ustar) and ar formats directly so we fully control Unix permissions - which
// matters because Windows can't store the exec bit (the tar.gz target loses it).
//
// Run: node scripts/make-deb.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, readlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const ARCH = 'amd64';
const PRODUCT = 'Verity';
const INSTALL_DIR = `opt/${PRODUCT}`;
const unpacked = join(root, 'release', 'linux-unpacked');

// ---------------------------------------------------------------------------
// ustar (POSIX tar) writer
// ---------------------------------------------------------------------------

function octal(value, width) {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

/** One 512-byte ustar header (handles name>100 via prefix split). */
function tarHeader({ name, mode, size, mtime, type, linkname = '' }) {
  const h = Buffer.alloc(512, 0);
  let prefix = '';
  let nm = name;
  if (Buffer.byteLength(nm) > 100) {
    let split = -1;
    for (let i = nm.length - 1; i > 0; i--) {
      if (nm[i] !== '/') continue;
      if (Buffer.byteLength(nm.slice(i + 1)) <= 100 && Buffer.byteLength(nm.slice(0, i)) <= 155) {
        split = i;
        break;
      }
    }
    if (split < 0) throw new Error('Pfad zu lang für ustar: ' + name);
    prefix = nm.slice(0, split);
    nm = nm.slice(split + 1);
  }
  h.write(nm, 0, 100, 'utf8');
  h.write(octal(mode, 8), 100, 8, 'ascii');
  h.write(octal(0, 8), 108, 8, 'ascii'); // uid root
  h.write(octal(0, 8), 116, 8, 'ascii'); // gid root
  h.write(octal(size, 12), 124, 12, 'ascii');
  h.write(octal(mtime, 12), 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii'); // chksum placeholder (spaces)
  h.write(type, 156, 1, 'ascii');
  h.write(linkname, 157, 100, 'utf8');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write('root', 265, 32, 'ascii');
  h.write('root', 297, 32, 'ascii');
  if (prefix) h.write(prefix, 345, 155, 'utf8');

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

function makeTarGz(entries) {
  const blocks = [];
  const mtime = Math.floor(Date.now() / 1000);
  for (const e of entries) {
    const isFile = e.type === '0';
    const size = isFile ? e.data.length : 0;
    blocks.push(tarHeader({ name: e.name, mode: e.mode, size, mtime, type: e.type, linkname: e.link }));
    if (isFile) {
      blocks.push(e.data);
      const pad = (512 - (size % 512)) % 512;
      if (pad) blocks.push(Buffer.alloc(pad, 0));
    }
  }
  blocks.push(Buffer.alloc(1024, 0)); // end of archive
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}

// ---------------------------------------------------------------------------
// Collect the unpacked app into install-tree entries
// ---------------------------------------------------------------------------

const dirs = new Set();
const fileEntries = [];

function addDirChain(path) {
  const parts = path.split('/');
  let acc = '';
  for (const p of parts) {
    acc = acc ? acc + '/' + p : p;
    dirs.add(acc);
  }
}

function modeFor(rel) {
  const base = rel.split('/').pop();
  if (base === 'chrome-sandbox') return 0o4755;
  if (base === 'verity-browser' || base === 'chrome_crashpad_handler') return 0o755;
  return 0o644;
}

function walk(absDir, relBase) {
  for (const dirent of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, dirent.name);
    const rel = `${relBase}/${dirent.name}`;
    if (dirent.isSymbolicLink()) {
      fileEntries.push({ name: `./${rel}`, type: '2', mode: 0o777, link: readlinkSync(abs) });
    } else if (dirent.isDirectory()) {
      addDirChain(rel);
      walk(abs, rel);
    } else {
      addDirChain(dirname(rel));
      fileEntries.push({ name: `./${rel}`, type: '0', mode: modeFor(rel), data: readFileSync(abs) });
    }
  }
}

walk(unpacked, INSTALL_DIR);

// Synthesized entries: launcher symlink, desktop file, icon.
addDirChain('usr/bin');
addDirChain('usr/share/applications');
addDirChain('usr/share/icons/hicolor/512x512/apps');

fileEntries.push({
  name: './usr/bin/verity-browser',
  type: '2',
  mode: 0o777,
  link: `/${INSTALL_DIR}/verity-browser`,
});

const desktop = `[Desktop Entry]
Name=Verity
GenericName=Web Browser
Comment=Der anpassbarste Datenschutz-Browser der Welt.
Exec=verity-browser %U
Icon=verity-browser
Type=Application
Terminal=false
StartupNotify=true
StartupWMClass=Verity
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
`;
fileEntries.push({
  name: './usr/share/applications/verity-browser.desktop',
  type: '0',
  mode: 0o644,
  data: Buffer.from(desktop, 'utf8'),
});
const iconPath = join(root, 'build', 'icon.png');
if (existsSync(iconPath)) {
  fileEntries.push({
    name: './usr/share/icons/hicolor/512x512/apps/verity-browser.png',
    type: '0',
    mode: 0o644,
    data: readFileSync(iconPath),
  });
} else {
  console.warn('[make-deb] build/icon.png fehlt – Paket ohne App-Icon.');
}

// Directory entries first, then files/symlinks.
const dataEntries = [
  ...[...dirs].sort().map((d) => ({ name: `./${d}/`, type: '5', mode: 0o755 })),
  ...fileEntries,
];
const dataTar = makeTarGz(dataEntries);

// ---------------------------------------------------------------------------
// control.tar.gz
// ---------------------------------------------------------------------------

let installedKb = 0;
for (const e of fileEntries) if (e.data) installedKb += Math.ceil(e.data.length / 1024);

const control = `Package: verity-browser
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: Verity Project <noreply@verity-browser.org>
Installed-Size: ${installedKb}
Section: net
Priority: optional
Homepage: https://verity-browser.org
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libdrm2, libgbm1, libxcb-dri3-0, libsecret-1-0, libasound2 | libasound2t64
Description: Verity - der anpassbarste Datenschutz-Browser der Welt.
 Privacy First. Security First. User Control First. Performance First.
 Vertikale Tabs, Workspaces, integrierter Tracker-/Malware-Schutz und ein
 vollstaendig anpassbares, Zen-inspiriertes UI.
`;

const postinst = `#!/bin/sh
set -e
# chrome-sandbox muss setuid-root sein (sonst Start nur mit --no-sandbox).
chmod 4755 '/${INSTALL_DIR}/chrome-sandbox' || true
chown root:root '/${INSTALL_DIR}/chrome-sandbox' || true
update-desktop-database -q 2>/dev/null || true
update-mime-database /usr/share/mime 2>/dev/null || true
`;

const controlTar = makeTarGz([
  { name: './', type: '5', mode: 0o755 },
  { name: './control', type: '0', mode: 0o644, data: Buffer.from(control, 'utf8') },
  { name: './postinst', type: '0', mode: 0o755, data: Buffer.from(postinst, 'utf8') },
]);

// ---------------------------------------------------------------------------
// ar archive -> .deb
// ---------------------------------------------------------------------------

function arMember(name, data) {
  const h = Buffer.alloc(60, 0x20);
  h.write(name.padEnd(16), 0, 16, 'ascii');
  h.write('0'.padEnd(12), 16, 12, 'ascii'); // mtime
  h.write('0'.padEnd(6), 28, 6, 'ascii'); // uid
  h.write('0'.padEnd(6), 34, 6, 'ascii'); // gid
  h.write('100644'.padEnd(8), 40, 8, 'ascii'); // mode
  h.write(String(data.length).padEnd(10), 48, 10, 'ascii');
  h.write('`\n', 58, 2, 'ascii');
  const out = [h, data];
  if (data.length % 2 === 1) out.push(Buffer.from('\n'));
  return Buffer.concat(out);
}

const deb = Buffer.concat([
  Buffer.from('!<arch>\n', 'ascii'),
  arMember('debian-binary', Buffer.from('2.0\n', 'ascii')),
  arMember('control.tar.gz', controlTar),
  arMember('data.tar.gz', dataTar),
]);

const outFile = join(root, 'release', `verity-browser_${VERSION}_${ARCH}.deb`);
writeFileSync(outFile, deb);
console.log(`DEB_OK ${outFile} (${(deb.length / 1024 / 1024).toFixed(1)} MB, Installed-Size ${installedKb} KB)`);
