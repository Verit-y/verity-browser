// Beispiel-Plugin für SP3 (Phase-2-API, noch nicht ausgeführt).
// Dieser Code dokumentiert die geplante Plugin-API aus docs/PLUGINS.md.
// SP3 führt Plugin-Code erst aus, wenn die Sandbox (Phase 2) fertig ist.

export default {
  async activate(sp3) {
    const stats = await sp3.plugin.stats.read();
    sp3.plugin.panel.render(`
      <h1>Block-Statistik</h1>
      <p>Werbung blockiert: ${stats.adsBlocked}</p>
      <p>Tracker blockiert: ${stats.trackersBlocked}</p>
    `);
  },
};
