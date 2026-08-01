/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("inkflowDesktop", Object.freeze({
  loadState: () => ipcRenderer.invoke("state:load"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  getSystemSettings: () => ipcRenderer.invoke("system:get-settings"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("system:set-auto-launch", Boolean(enabled)),
  testNotification: () => ipcRenderer.invoke("notification:test"),
  hideWindow: () => ipcRenderer.send("window:hide"),
  quitApp: () => ipcRenderer.send("app:quit"),
  onStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("state:changed", handler);
    return () => ipcRenderer.removeListener("state:changed", handler);
  },
  onCommand: (callback) => {
    const handler = (_event, command) => callback(command);
    ipcRenderer.on("app:command", handler);
    return () => ipcRenderer.removeListener("app:command", handler);
  },
}));
