const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("JarvisDesktop", {
  isDesktopApp: true,
  getEnvironment: () => ipcRenderer.invoke("jarvis:environment"),
  getPermissionStatus: () => ipcRenderer.invoke("jarvis:permission-status"),
  requestMicrophoneAccess: () => ipcRenderer.invoke("jarvis:request-microphone"),
  promptAccessibilityAccess: () => ipcRenderer.invoke("jarvis:prompt-accessibility"),
  openPermissionSettings: (section) =>
    ipcRenderer.invoke("jarvis:open-permission-settings", section),
  minimizeWindow: () => ipcRenderer.invoke("jarvis:window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("jarvis:window-toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("jarvis:window-close"),
  getWindowState: () => ipcRenderer.invoke("jarvis:window-state"),
  setCompactMode: (enabled) => ipcRenderer.invoke("jarvis:set-compact-mode", enabled),
  setCompactExpanded: (enabled) => ipcRenderer.invoke("jarvis:set-compact-expanded", enabled),
  updateOverlayState: (payload) => ipcRenderer.invoke("jarvis:update-overlay-state", payload),
  showCompactPresence: () => ipcRenderer.invoke("jarvis:show-compact-presence"),
  showMainWindow: () => ipcRenderer.invoke("jarvis:show-main-window"),
  setMenuBarOnly: (enabled) => ipcRenderer.invoke("jarvis:set-menu-bar-only", enabled),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("jarvis:set-launch-at-login", enabled),
  onQuickSummon: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload || {});
    ipcRenderer.on("jarvis:quick-summon", handler);
    return () => ipcRenderer.removeListener("jarvis:quick-summon", handler);
  }
});
