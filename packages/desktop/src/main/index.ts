/**
 * @license
 * Copyright 2026 Easy Code team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Electron main entry: app lifecycle + the single main window, with the typed
 * IPC bridge and ACP session hub wired in.
 */

import { app, BrowserWindow, Menu, shell, nativeTheme, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc } from './ipc.js';
import { ensurePathFromLoginShell } from './shellPath.js';
import type { SessionHub } from './sessionHub.js';
import type { FeishuManager } from './feishu.js';
import type { UpdateManager } from './updater.js';
// Bundled by electron-vite (`?asset`) and copied into out/. Used as the window /
// taskbar icon at runtime (dev + Linux/Windows). On macOS the dock icon comes
// from the packaged .app bundle, so this is harmless there.
import appIcon from '../../build/icon.png?asset';
import { getUserSettings } from './userSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let hub: SessionHub | null = null;
let feishu: FeishuManager | null = null;
let updater: UpdateManager | null = null;

/**
 * macOS application menu. The first submenu's title is the app name shown in the
 * menu bar; building it explicitly guarantees "Easy Code" instead of the default
 * "Electron". Includes the standard Edit/Window items so copy/paste/quit and the
 * usual shortcuts keep working.
 */
function setMacAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Easy Code',
      submenu: [
        { role: 'about', label: 'About Easy Code' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Easy Code' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Easy Code' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1c1e' : '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Easy Code',
    icon: appIcon,
    // The traditional File/Edit/View/Window/Help menu bar is meaningless for
    // Easy Code — keep it hidden (and Alt won't reveal it since it's removed
    // entirely on Windows/Linux below).
    autoHideMenuBar: true,
    webPreferences: {
      // electron-vite emits the preload as ESM (.mjs) — required for an ESM
      // preload under contextIsolation with sandbox disabled.
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  // Intercept window close: if minimizeToTray is enabled, hide instead of close
  mainWindow.on('close', (e) => {
    const settings = getUserSettings();
    if (settings.minimizeToTray && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      if (tray && !tray.isDestroyed()) {
        // Tray icon click restores window; no IPC needed
      }
    }
  });

  // Open target=_blank / external links in the system browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  app.setName('Easy Code');
  // GUI launches on macOS/Linux (Finder/Dock/launcher) bypass the login shell
  // and inherit only a minimal PATH (e.g. /usr/bin:/bin:/usr/sbin:/sbin),
  // missing /usr/local/bin, /opt/homebrew/bin, nvm shims, etc. Restore the real
  // PATH from the login shell BEFORE registerIpc()/createWindow() so external
  // agent detection (claude/codex) and the `npx` ACP bridge spawns can find
  // their binaries. No-op on Windows.
  ensurePathFromLoginShell();
  // Windows shows toast notifications under this AppUserModelID; without it the
  // turn-complete notifications either don't appear or show as an unbranded
  // "electron.app.…" sender. Must match electron-builder.yml's `appId`.
  if (process.platform === 'win32') app.setAppUserModelId('ai.deepvlab.easycode.desktop');
  if (process.platform === 'darwin') {
    // Build the app menu explicitly so its first item reads "Easy Code" — the
    // default macOS menu shows "Electron" in dev/unpackaged runs regardless of
    // app.setName. Keep the standard edit/window shortcuts working.
    setMacAppMenu();
  } else {
    // Drop the default application menu on Windows/Linux entirely.
    Menu.setApplicationMenu(null);
  }
  ({ hub, feishu, updater } = registerIpc(() => mainWindow));
  createWindow();

  // Create system tray
  const trayIcon = nativeImage.createFromPath(appIcon);
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Easy Code');
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Easy Code', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  // Kick off the version-update lifecycle (startup check + periodic poll). It
  // delays its first check internally so it never competes with boot.
  updater.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', (e: Event) => {
  // In tray mode, prevent app from quitting when all windows are closed
  const settings = getUserSettings();
  if (settings.minimizeToTray && !isQuitting) {
    e.preventDefault();
    return;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  hub?.disposeAll();
  // Tear down the desktop-managed Feishu gateway so we never leave an orphan
  // gateway behind (which the next launch would otherwise detect + kill).
  feishu?.dispose();
  // Stop the update poll timer and abort any in-flight download.
  updater?.dispose();
});
