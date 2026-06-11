const { app, BrowserWindow } = require("electron");
const path = require("path");
const { startServer, stopServer } = require("./backend/server");

let mainWindow;

// Start the Express backend server programmatically
startServer(5000);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Aether Chat | AI Assistant",
    backgroundColor: "#080b11", // Match the app background color
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove the default menu bar
  mainWindow.setMenuBarVisibility(false);

  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Load local Vite dev server
    mainWindow.loadURL("http://localhost:5173");
    // Open Chrome DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Load production built files
    mainWindow.loadFile(path.join(__dirname, "frontend/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Shut down the Express server and quit Electron
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  stopServer();
});
