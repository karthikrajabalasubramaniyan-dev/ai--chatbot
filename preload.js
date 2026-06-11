const { contextBridge } = require("electron");

// Expose safe, selected APIs to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  version: process.versions.electron
});
