import { BrowserWindow, Menu } from 'electron';
import { TabManager } from './tabs';
import { WorkspaceStore } from './workspaces';

/**
 * Application menu: provides the keyboard shortcuts that must work even when
 * focus is inside a page (the chrome renderer never sees those keys).
 */
export function buildMenu(win: BrowserWindow, tabs: TabManager, workspaces: WorkspaceStore): void {
  // Ctrl+1..9 wechseln zum Workspace an der jeweiligen Position.
  const workspaceShortcuts: Electron.MenuItemConstructorOptions[] = Array.from(
    { length: 9 },
    (_v, i) => ({
      label: `Workspace ${i + 1}`,
      accelerator: `CmdOrCtrl+${i + 1}`,
      visible: false,
      click: () => {
        const ws = workspaces.list()[i];
        if (ws) tabs.setWorkspace(ws.id);
      },
    })
  );
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Verity',
      submenu: [
        {
          label: 'Neuer Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => tabs.create(),
        },
        {
          label: 'Neuer privater Tab',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => tabs.create(undefined, { isPrivate: true }),
        },
        {
          label: 'Neuer temporärer Container-Tab',
          accelerator: 'CmdOrCtrl+Alt+T',
          click: () => tabs.create(undefined, { container: `temp-${Date.now()}` }),
        },
        {
          label: 'Tab schließen',
          accelerator: 'CmdOrCtrl+W',
          click: () => tabs.closeActive(),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Rückgängig' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { role: 'selectAll', label: 'Alles auswählen' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        {
          label: 'Seite neu laden',
          accelerator: 'CmdOrCtrl+R',
          click: () => tabs.reloadActive(),
        },
        {
          label: 'Adressleiste fokussieren',
          accelerator: 'CmdOrCtrl+L',
          click: () => win.webContents.send('chrome:focus-address'),
        },
        {
          label: 'Nächster Tab',
          accelerator: 'Control+Tab',
          click: () => tabs.cycle(1),
        },
        {
          label: 'Vorheriger Tab',
          accelerator: 'Control+Shift+Tab',
          click: () => tabs.cycle(-1),
        },
        { type: 'separator' },
        {
          label: 'Split View umschalten',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => tabs.toggleSplit(),
        },
        {
          label: 'Screenshot der Seite',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => void tabs.screenshot(),
        },
        {
          label: 'Entwicklerwerkzeuge (Seite)',
          accelerator: 'F12',
          click: () => tabs.openDevTools(),
        },
      ],
    },
    // Unsichtbares Menü nur für die Ctrl+1..9-Workspace-Shortcuts.
    { label: 'Workspaces', submenu: workspaceShortcuts },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
