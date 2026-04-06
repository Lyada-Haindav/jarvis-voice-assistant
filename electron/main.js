const fs = require("fs");
const path = require("path");
const { fork, spawn } = require("child_process");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  nativeImage,
  dialog,
  session,
  shell,
  systemPreferences,
  Tray,
  globalShortcut
} = require("electron");

let mainWindow = null;
let serverInfo = null;
let serverProcess = null;
let tray = null;
let isQuitting = false;
let compactMode = false;
let compactExpanded = false;
let menuBarOnlyMode = false;
let normalWindowBounds = null;
let compactCollapseTimeout = null;
let overlayProcess = null;
let overlayStatePath = null;
let overlayStateWriteTimeout = null;
let latestOverlayState = null;

const QUICK_SUMMON_ACCELERATOR = "Alt+Space";

app.setName("Jarvis");
app.commandLine.appendSwitch("enable-experimental-web-platform-features");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

function isMac() {
  return process.platform === "darwin";
}

function quickSummonLabel() {
  if (isMac()) {
    return "Option+Space";
  }
  return "Alt+Space";
}

function useNativeWindowFrame() {
  return process.platform === "win32" || process.platform === "linux";
}

function serverScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "server.js")
    : path.join(__dirname, "..", "server.js");
}

function serverWorkingDirectory() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
}

function overlayBundlePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "overlay", "JarvisOverlay.app")
    : path.join(__dirname, "..", "native-overlay", "dist", "JarvisOverlay.app");
}

function overlayExecutablePath() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), "JarvisOverlay");
  }

  const plainExecutable = path.join(__dirname, "..", "native-overlay", "dist", "JarvisOverlay");
  if (fs.existsSync(plainExecutable)) {
    return plainExecutable;
  }

  return path.join(overlayBundlePath(), "Contents", "MacOS", "JarvisOverlay");
}

function overlayAvailable() {
  return isMac() && fs.existsSync(overlayExecutablePath());
}

function hostAppBundlePath() {
  return app.isPackaged ? path.resolve(process.execPath, "..", "..", "..") : "";
}

function ensureOverlayStatePath() {
  if (!overlayStatePath) {
    overlayStatePath = path.join(app.getPath("userData"), "overlay-state.json");
  }

  fs.mkdirSync(path.dirname(overlayStatePath), { recursive: true });
  return overlayStatePath;
}

function defaultOverlayState() {
  return {
    assistantName: "Jarvis",
    title: "Jarvis ready",
    subtitle: "Say Hey Jarvis",
    note: "Background wake mode is ready.",
    quickHint: quickSummonLabel(),
    listening: false,
    speaking: false,
    awake: false,
    expanded: false,
    visible: true
  };
}

function sanitizeOverlayState(nextState) {
  const safe = { ...(latestOverlayState || defaultOverlayState()) };

  for (const key of ["assistantName", "title", "subtitle", "note", "quickHint"]) {
    if (key in nextState) {
      safe[key] = String(nextState[key] || "").trim();
    }
  }

  for (const key of ["listening", "speaking", "awake", "expanded", "visible"]) {
    if (key in nextState) {
      safe[key] = Boolean(nextState[key]);
    }
  }

  return safe;
}

function writeOverlayStateNow() {
  if (!isMac()) {
    return;
  }

  const statePath = ensureOverlayStatePath();
  latestOverlayState = latestOverlayState || defaultOverlayState();
  fs.writeFileSync(statePath, JSON.stringify(latestOverlayState, null, 2));
}

function queueOverlayStateUpdate(nextState = {}) {
  if (!isMac()) {
    return;
  }

  latestOverlayState = sanitizeOverlayState(nextState);
  if (overlayStateWriteTimeout) {
    clearTimeout(overlayStateWriteTimeout);
  }

  overlayStateWriteTimeout = setTimeout(() => {
    overlayStateWriteTimeout = null;
    try {
      writeOverlayStateNow();
    } catch (error) {
      console.error("Jarvis overlay state write failed:", String(error?.message || error));
    }
  }, 45);
}

function settingsUrlFor(section) {
  if (isMac()) {
    const mapping = {
      microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      accessibility:
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      automation: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
    };
    return mapping[section] || "x-apple.systempreferences:";
  }

  if (process.platform === "win32") {
    const mapping = {
      microphone: "ms-settings:privacy-microphone",
      accessibility: "ms-settings:easeofaccess-display"
    };
    return mapping[section] || "ms-settings:";
  }

  return "";
}

function emitToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    mainWindow.webContents.send(channel, payload);
  } catch (error) {
    console.error(`Jarvis renderer event failed (${channel}):`, String(error?.message || error));
  }
}

function getMicrophoneStatus() {
  if (typeof systemPreferences.getMediaAccessStatus !== "function") {
    return "unknown";
  }

  try {
    return systemPreferences.getMediaAccessStatus("microphone");
  } catch (error) {
    return "unknown";
  }
}

function getAccessibilityStatus() {
  if (!isMac() || typeof systemPreferences.isTrustedAccessibilityClient !== "function") {
    return "unknown";
  }

  try {
    return systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "not_granted";
  } catch (error) {
    return "unknown";
  }
}

function permissionStatus() {
  return {
    platform: process.platform,
    microphone: getMicrophoneStatus(),
    accessibility: getAccessibilityStatus(),
    automation: isMac() ? "requires_manual_enable" : "unknown"
  };
}

async function openPermissionSettings(section) {
  const target = settingsUrlFor(section);
  if (target) {
    await shell.openExternal(target);
    return true;
  }

  if (isMac()) {
    await shell.openPath("/System/Applications/System Settings.app");
    return true;
  }

  return false;
}

function registerPermissionHandlers() {
  const defaultSession = session.defaultSession;
  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (
      permission === "media" ||
      permission === "mediaKeySystem" ||
      permission === "audioCapture" ||
      permission === "videoCapture" ||
      permission === "speechRecognition"
    ) {
      return true;
    }
    return permission === "notifications";
  });

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (
      permission === "media" ||
      permission === "notifications" ||
      permission === "audioCapture" ||
      permission === "videoCapture" ||
      permission === "speechRecognition"
    ) {
      callback(true);
      return;
    }
    callback(false);
  });
}

function loginItemState() {
  if (typeof app.getLoginItemSettings !== "function") {
    return {
      launchAtLogin: false
    };
  }

  const settings = app.getLoginItemSettings();
  return {
    launchAtLogin: Boolean(settings.openAtLogin)
  };
}

function updateDockVisibility() {
  if (!isMac() || !app.dock) {
    return;
  }

  if (menuBarOnlyMode) {
    app.dock.hide();
  } else {
    app.dock.show();
  }
}

function clearCompactCollapseTimeout() {
  if (compactCollapseTimeout) {
    clearTimeout(compactCollapseTimeout);
    compactCollapseTimeout = null;
  }
}

function scheduleCompactCollapse(delayMs = 7000) {
  clearCompactCollapseTimeout();
  compactCollapseTimeout = setTimeout(() => {
    compactCollapseTimeout = null;
    if (compactMode) {
      applyCompactExpanded(false);
    }
  }, delayMs);
}

function setLaunchAtLogin(enabled) {
  if (typeof app.setLoginItemSettings === "function") {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      openAsHidden: true
    });
  }
  refreshTrayMenu();
  return loginItemState();
}

function createTrayIcon() {
  const stroke = nativeTheme.shouldUseDarkColors ? "#dffbff" : "#06131c";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="23" fill="none" stroke="${stroke}" stroke-width="5"/>
      <circle cx="32" cy="32" r="9" fill="${stroke}" opacity="0.9"/>
      <path d="M32 9v10M32 45v10M9 32h10M45 32h10" stroke="${stroke}" stroke-width="4.5" stroke-linecap="round"/>
    </svg>
  `.trim();
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  ).resize({ width: 18, height: 18 });
  if (typeof image.setTemplateImage === "function") {
    image.setTemplateImage(true);
  }
  return image;
}

async function showMainWindow() {
  if (!mainWindow) {
    await createMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (menuBarOnlyMode) {
    updateDockVisibility();
  }
  mainWindow.focus();
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  const launchSettings = loginItemState();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Jarvis",
        click: () => {
          void showMainWindow();
        }
      },
      {
        label: "Launch at Login",
        type: "checkbox",
        checked: launchSettings.launchAtLogin,
        click: (menuItem) => {
          setLaunchAtLogin(menuItem.checked);
        }
      },
      ...(isMac()
        ? [
            {
              label: "Menu Bar Only",
              type: "checkbox",
              checked: menuBarOnlyMode,
              click: (menuItem) => {
                applyMenuBarOnlyMode(menuItem.checked);
              }
            }
          ]
        : []),
      { type: "separator" },
      {
        label: "Quit Jarvis",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function ensureTray() {
  if (tray) {
    refreshTrayMenu();
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Jarvis");
  tray.on("click", () => {
    void showMainWindow();
  });
  refreshTrayMenu();
}

function buildAppMenu() {
  const template = [
    {
      label: "Jarvis",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "togglefullscreen" }
      ]
    }
  ];

  if (!isMac()) {
    template.shift();
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function windowState() {
  return {
    isMaximized: Boolean(mainWindow?.isMaximized()),
    isFullScreen: Boolean(mainWindow?.isFullScreen()),
    compactMode,
    compactExpanded,
    menuBarOnlyMode
  };
}

function syncCompactWindowBounds() {
  if (!mainWindow) {
    return windowState();
  }

  if (compactMode) {
    if (!normalWindowBounds) {
      normalWindowBounds = mainWindow.getBounds();
    }
    mainWindow.setAlwaysOnTop(true, "floating");
    if (isMac()) {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(360, 220);
    mainWindow.setSize(compactExpanded ? 540 : 460, compactExpanded ? 340 : 260, true);
    mainWindow.center();
  } else {
    clearCompactCollapseTimeout();
    mainWindow.setAlwaysOnTop(false);
    if (isMac()) {
      mainWindow.setVisibleOnAllWorkspaces(false);
    }
    mainWindow.setMinimumSize(1120, 760);
    const bounds = normalWindowBounds;
    normalWindowBounds = null;
    if (bounds) {
      mainWindow.setBounds(bounds, true);
    } else {
      mainWindow.setSize(1440, 960, true);
      mainWindow.center();
    }
  }

  return windowState();
}

function applyCompactMode(enabled) {
  compactMode = Boolean(enabled);
  if (!compactMode) {
    compactExpanded = false;
  }
  return syncCompactWindowBounds();
}

function applyCompactExpanded(enabled) {
  compactExpanded = Boolean(enabled) && compactMode;
  if (compactExpanded) {
    scheduleCompactCollapse();
  } else {
    clearCompactCollapseTimeout();
  }
  return syncCompactWindowBounds();
}

function applyMenuBarOnlyMode(enabled) {
  menuBarOnlyMode = Boolean(enabled);
  if (mainWindow) {
    try {
      mainWindow.setSkipTaskbar(menuBarOnlyMode);
    } catch (error) {
      // Skip taskbar support varies slightly across platforms.
    }
  }
  updateDockVisibility();
  refreshTrayMenu();
  return {
    ...windowState(),
    launchAtLogin: loginItemState().launchAtLogin,
    permissions: permissionStatus()
  };
}

async function createMainWindow() {
  if (!serverInfo) {
    serverInfo = await ensureServerProcess();
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#07131c" : "#07131c",
    title: "Jarvis",
    autoHideMenuBar: true,
    frame: useNativeWindowFrame(),
    titleBarStyle: isMac() ? "hidden" : undefined,
    vibrancy: isMac() ? "under-window" : undefined,
    visualEffectState: isMac() ? "active" : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  if (typeof mainWindow.webContents.setBackgroundThrottling === "function") {
    mainWindow.webContents.setBackgroundThrottling(false);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(serverInfo.url);
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    clearCompactCollapseTimeout();
    mainWindow = null;
  });
}

async function showCompactPresence() {
  if (!mainWindow) {
    await createMainWindow();
  }

  if (compactMode) {
    applyCompactExpanded(true);
  }

  if (!mainWindow.isVisible()) {
    if (typeof mainWindow.showInactive === "function") {
      mainWindow.showInactive();
    } else {
      mainWindow.show();
    }
  } else if (!mainWindow.isFocused() && typeof mainWindow.showInactive === "function") {
    mainWindow.showInactive();
  }

  return windowState();
}

async function handleQuickSummon() {
  if (compactMode) {
    await showCompactPresence();
  } else {
    await showMainWindow();
  }

  queueOverlayStateUpdate({
    quickHint: quickSummonLabel(),
    awake: true,
    expanded: true,
    visible: true
  });

  setTimeout(() => {
    emitToRenderer("jarvis:quick-summon", {
      source: "global-shortcut",
      shortcut: quickSummonLabel()
    });
  }, 60);
}

function registerGlobalShortcuts() {
  if (!app.isReady()) {
    return;
  }

  try {
    globalShortcut.unregister(QUICK_SUMMON_ACCELERATOR);
    const registered = globalShortcut.register(QUICK_SUMMON_ACCELERATOR, () => {
      void handleQuickSummon().catch((error) => {
        console.error("Jarvis quick summon failed:", String(error?.message || error));
      });
    });
    if (!registered) {
      console.warn(`Jarvis could not register ${QUICK_SUMMON_ACCELERATOR} for quick summon.`);
    }
  } catch (error) {
    console.error("Jarvis shortcut registration failed:", String(error?.message || error));
  }
}

function unregisterGlobalShortcuts() {
  try {
    globalShortcut.unregister(QUICK_SUMMON_ACCELERATOR);
  } catch (error) {
    // Ignore shutdown cleanup errors.
  }
}

function launchNativeOverlay() {
  if (!overlayAvailable() || overlayProcess) {
    return;
  }

  latestOverlayState = latestOverlayState || defaultOverlayState();

  try {
    writeOverlayStateNow();
  } catch (error) {
    console.error("Jarvis overlay boot state failed:", String(error?.message || error));
  }

  const child = spawn(overlayExecutablePath(), [], {
    cwd: path.dirname(overlayExecutablePath()),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      JARVIS_OVERLAY_STATE_PATH: ensureOverlayStatePath(),
      JARVIS_HOST_APP_PATH: hostAppBundlePath()
    }
  });

  overlayProcess = child;

  child.once("error", (error) => {
    if (overlayProcess === child) {
      overlayProcess = null;
    }
    console.error("Jarvis overlay launch failed:", String(error?.message || error));
  });

  child.stdout?.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) {
      console.log(`[overlay] ${text}`);
    }
  });

  child.stderr?.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) {
      console.error(`[overlay] ${text}`);
    }
  });

  child.once("exit", () => {
    if (overlayProcess === child) {
      overlayProcess = null;
    }
  });
}

async function stopNativeOverlay() {
  if (overlayStateWriteTimeout) {
    clearTimeout(overlayStateWriteTimeout);
    overlayStateWriteTimeout = null;
  }

  if (isMac()) {
    latestOverlayState = sanitizeOverlayState({ visible: false, speaking: false, listening: false });
    try {
      writeOverlayStateNow();
    } catch (error) {
      // Ignore final overlay write failures during shutdown.
    }
  }

  if (!overlayProcess) {
    return;
  }

  const child = overlayProcess;
  overlayProcess = null;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (error) {
        finish();
      }
    }, 1500);

    child.once("exit", () => {
      clearTimeout(timeout);
      finish();
    });

    try {
      child.kill("SIGTERM");
    } catch (error) {
      clearTimeout(timeout);
      finish();
    }
  });
}

function ensureServerProcess() {
  if (serverInfo) {
    return Promise.resolve(serverInfo);
  }

  if (serverProcess) {
    return new Promise((resolve, reject) => {
      const onMessage = (message) => {
        if (message?.type === "server-ready") {
          serverInfo = {
            host: message.host,
            port: message.port,
            url: message.url
          };
          cleanup();
          resolve(serverInfo);
        } else if (message?.type === "server-error") {
          cleanup();
          reject(new Error(message.message || "Jarvis server failed to start."));
        }
      };

      const onExit = () => {
        cleanup();
        reject(new Error("Jarvis server stopped before it was ready."));
      };

      const cleanup = () => {
        serverProcess?.off("message", onMessage);
        serverProcess?.off("exit", onExit);
      };

      serverProcess.on("message", onMessage);
      serverProcess.once("exit", onExit);
    });
  }

  const serverScript = serverScriptPath();
  return new Promise((resolve, reject) => {
    const child = fork(serverScript, [], {
      cwd: serverWorkingDirectory(),
      execPath: process.execPath,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        JARVIS_MODE: "desktop",
        HOST: "127.0.0.1",
        PORT: "0"
      }
    });

    serverProcess = child;

    child.on("exit", () => {
      if (serverProcess === child) {
        serverProcess = null;
        serverInfo = null;
      }
    });

    child.stdout?.on("data", (chunk) => {
      const text = String(chunk || "").trim();
      if (text) {
        console.log(text);
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = String(chunk || "").trim();
      if (text) {
        console.error(text);
      }
    });

    const cleanup = () => {
      child.off("message", handleMessage);
      child.off("error", handleError);
      child.off("exit", handleExit);
    };

    const handleMessage = (message) => {
      if (message?.type === "server-ready") {
        serverInfo = {
          host: message.host,
          port: message.port,
          url: message.url
        };
        cleanup();
        resolve(serverInfo);
        return;
      }

      if (message?.type === "server-error") {
        cleanup();
        reject(new Error(message.message || "Jarvis server failed to start."));
      }
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const handleExit = (code, signal) => {
      cleanup();
      serverProcess = null;
      if (!serverInfo) {
        reject(
          new Error(`Jarvis server exited before startup completed (${signal || code || "unknown"}).`)
        );
      }
    };

    child.on("message", handleMessage);
    child.once("error", handleError);
    child.once("exit", handleExit);
  });
}

async function stopServerProcess() {
  serverInfo = null;
  if (!serverProcess) {
    return;
  }

  const child = serverProcess;
  serverProcess = null;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 4000);

    child.once("exit", () => {
      clearTimeout(timeout);
      finish();
    });

    try {
      child.kill("SIGTERM");
    } catch (error) {
      clearTimeout(timeout);
      finish();
    }
  });
}

ipcMain.handle("jarvis:environment", async () => ({
  isDesktopApp: true,
  platform: process.platform,
  serverUrl: serverInfo?.url || "",
  launchAtLogin: loginItemState().launchAtLogin,
  menuBarOnlyMode,
  overlayAvailable: overlayAvailable(),
  quickSummonShortcut: quickSummonLabel(),
  permissions: permissionStatus()
}));

ipcMain.handle("jarvis:permission-status", async () => permissionStatus());

ipcMain.handle("jarvis:request-microphone", async () => {
  if (isMac() && typeof systemPreferences.askForMediaAccess === "function") {
    const granted = await systemPreferences.askForMediaAccess("microphone");
    return {
      granted,
      permissions: permissionStatus()
    };
  }

  return {
    granted: true,
    permissions: permissionStatus()
  };
});

ipcMain.handle("jarvis:prompt-accessibility", async () => {
  if (isMac() && typeof systemPreferences.isTrustedAccessibilityClient === "function") {
    systemPreferences.isTrustedAccessibilityClient(true);
  }
  return permissionStatus();
});

ipcMain.handle("jarvis:open-permission-settings", async (_event, section) => {
  const opened = await openPermissionSettings(section);
  return {
    opened,
    permissions: permissionStatus()
  };
});

ipcMain.handle("jarvis:window-minimize", async () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
  return windowState();
});

ipcMain.handle("jarvis:window-toggle-maximize", async () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  return windowState();
});

ipcMain.handle("jarvis:window-close", async () => {
  if (mainWindow) {
    mainWindow.close();
  }
  return { closed: true };
});

ipcMain.handle("jarvis:window-state", async () => windowState());

ipcMain.handle("jarvis:set-compact-mode", async (_event, enabled) =>
  applyCompactMode(Boolean(enabled))
);

ipcMain.handle("jarvis:set-compact-expanded", async (_event, enabled) =>
  applyCompactExpanded(Boolean(enabled))
);

ipcMain.handle("jarvis:update-overlay-state", async (_event, nextState) => {
  if (overlayAvailable()) {
    launchNativeOverlay();
    queueOverlayStateUpdate(nextState || {});
  }
  return { ok: true };
});

ipcMain.handle("jarvis:show-compact-presence", async () => showCompactPresence());

ipcMain.handle("jarvis:show-main-window", async () => {
  await showMainWindow();
  return windowState();
});

ipcMain.handle("jarvis:set-menu-bar-only", async (_event, enabled) =>
  applyMenuBarOnlyMode(Boolean(enabled))
);

ipcMain.handle("jarvis:set-launch-at-login", async (_event, enabled) => ({
  platform: process.platform,
  launchAtLogin: setLaunchAtLogin(Boolean(enabled)).launchAtLogin,
  permissions: permissionStatus()
}));

app.on("second-instance", () => {
  void showMainWindow();
});

app.whenReady()
  .then(async () => {
    buildAppMenu();
    registerPermissionHandlers();
    ensureTray();
    registerGlobalShortcuts();
    await createMainWindow();
    launchNativeOverlay();

    app.on("activate", async () => {
      await showMainWindow();
    });
  })
  .catch((error) => {
    const message = String(error?.message || error || "Jarvis failed to start.");
    console.error("Jarvis desktop boot failed:", message);
    dialog.showErrorBox("Jarvis Launch Error", message);
    app.quit();
  });

app.on("will-quit", () => {
  unregisterGlobalShortcuts();
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin" && isQuitting) {
    await stopNativeOverlay().catch(() => {});
    await stopServerProcess().catch(() => {});
    app.quit();
  }
});

app.on("before-quit", async () => {
  isQuitting = true;
  await stopNativeOverlay().catch(() => {});
  await stopServerProcess().catch(() => {});
});
