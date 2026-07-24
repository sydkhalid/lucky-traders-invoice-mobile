const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

function getAppIndexPath() {
  if (app.isPackaged) {
    const asarIndexPath = path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html');
    if (fs.existsSync(asarIndexPath)) {
      return asarIndexPath;
    }

    return path.join(process.resourcesPath, 'app', 'dist', 'index.html');
  }

  return path.join(__dirname, '..', 'dist', 'index.html');
}

function createWindow() {
  const indexPath = getAppIndexPath();

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Lucky Traders Invoice',
    backgroundColor: '#f4f6f8',
    icon: path.join(__dirname, '..', 'assets', 'logo1111.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!fs.existsSync(indexPath)) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html>
        <body style="font-family:Segoe UI,Arial,sans-serif;padding:32px;background:#f4f6f8;color:#162033">
          <h2>Desktop build is missing</h2>
          <p>Run <code>npm run desktop:export</code> before opening the desktop app.</p>
        </body>
      </html>
    `)}`);
    return;
  }

  mainWindow.loadFile(indexPath);

  if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
