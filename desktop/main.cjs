const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const isDev = !app.isPackaged;
let staticServer = null;

function getDistPath() {
  if (app.isPackaged) {
    const asarDistPath = path.join(process.resourcesPath, 'app.asar', 'dist');
    if (fs.existsSync(path.join(asarDistPath, 'index.html'))) {
      return asarDistPath;
    }

    return path.join(process.resourcesPath, 'app', 'dist');
  }

  return path.join(__dirname, '..', 'dist');
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

function startStaticServer(distPath) {
  return new Promise((resolve, reject) => {
    const resolvedDistPath = path.resolve(distPath);
    const server = http.createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
        const decodedPath = decodeURIComponent(requestUrl.pathname);
        const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
        const filePath = path.resolve(resolvedDistPath, relativePath);

        if (!filePath.startsWith(resolvedDistPath + path.sep) && filePath !== path.join(resolvedDistPath, 'index.html')) {
          response.writeHead(403);
          response.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          response.writeHead(404);
          response.end('Not found');
          return;
        }

        response.writeHead(200, {
          'Content-Type': getMimeType(filePath),
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(filePath).pipe(response);
      } catch {
        response.writeHead(500);
        response.end('Internal error');
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      staticServer = server;
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to start desktop server.'));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function createWindow() {
  const distPath = getDistPath();

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

  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
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

  const appUrl = await startStaticServer(distPath);
  mainWindow.loadURL(appUrl);

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
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
