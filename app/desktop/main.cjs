
const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog  } = require('electron');



const path = require('path');
const paths = require('../paths.cjs');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');


let win;
let menuVisible = true; 



const downloadDir = paths.downloadsDir;
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, {
        recursive: true
    });
}

app.setPath('downloads', downloadDir);


ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});


/***********************************************
 *        HTML -> PDF  (Arabic-safe)           *
 ***********************************************/

function safeFileName(name) {
  return String(name || 'transcript').replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 120) || 'transcript';
}

async function renderHtmlToPdf(html) {
  const tmpHtml = path.join(os.tmpdir(), `eulc_${process.pid}_${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  try {
    await pdfWin.loadFile(tmpHtml);
    // give fonts a tick to resolve before we snapshot the layout
    await pdfWin.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true'
    ).catch(() => {});

    return await pdfWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 } // inches
    });
  } finally {
    if (!pdfWin.isDestroyed()) pdfWin.destroy();
    fs.unlink(tmpHtml, () => {});
  }
}

// Hands the PDF bytes back to the renderer instead of writing them out, so a
// batch of them can be zipped client-side without ever touching the disk.
ipcMain.handle('html-to-pdf-buffer', async (event, { html }) => {
  try {
    const data = await renderHtmlToPdf(html);
    return { ok: true, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch (err) {
    console.error('html-to-pdf-buffer error', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('html-to-pdf', async (event, { html, fileName, saveAs = false }) => {
  try {
    const data = await renderHtmlToPdf(html);

    let filePath = path.join(downloadDir, `${safeFileName(fileName)}.pdf`);

    if (saveAs) {
      const res = await dialog.showSaveDialog(win, {
        title: 'Save PDF',
        defaultPath: filePath,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      filePath = res.filePath;
    }

    fs.writeFileSync(filePath, data);
    return { ok: true, filePath };
  } catch (err) {
    console.error('html-to-pdf error', err);
    return { ok: false, error: String(err) };
  }
});


/***********************************************
 *        Open a local file in Chrome          *
 ***********************************************/

function findChrome() {
  const candidates = [
    process.env['PROGRAMFILES']      && path.join(process.env['PROGRAMFILES'],      'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['LOCALAPPDATA']      && path.join(process.env['LOCALAPPDATA'],      'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean);

  return candidates.find(p => fs.existsSync(p)) || null;
}

ipcMain.handle('open-in-chrome', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'file not found' };

    const href = pathToFileURL(filePath).href;
    const chrome = findChrome();

    if (chrome) {
      // An already-running Chrome absorbs this and opens a NEW TAB in the
      // last focused window instead of spawning a new window.
      spawn(chrome, [href], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, via: 'chrome' };
    }

    await shell.openExternal(href); // default browser fallback
    return { ok: true, via: 'default-browser' };
  } catch (err) {
    console.error('open-in-chrome error', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('reveal-file', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  return { ok: true };
});


/***********************************************
 *   In-memory PDF handoff to Chrome           *
 *   (no file on disk -> nothing to overwrite) *
 ***********************************************/

const pdfStore = new Map();            // token -> { data, fileName, expires }
let pdfServer = null;
let pdfServerPort = 0;
const PDF_TTL_MS = 30 * 60 * 1000;     // how long a preview URL stays reloadable

function ensurePdfServer() {
  if (pdfServer) return Promise.resolve(pdfServerPort);

  return new Promise((resolve, reject) => {

    pdfServer = http.createServer((req, res) => {

      const token = (req.url || '').split('/')[1] || '';
      const entry = pdfStore.get(token);

      if (!entry || entry.expires < Date.now()) {
        pdfStore.delete(token);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Preview expired');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': entry.data.length,
        // inline => Chrome's built-in viewer renders it instead of downloading it
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(entry.fileName)}`,
        'Cache-Control': 'no-store'
      });
      res.end(entry.data);
    });

    pdfServer.on('error', reject);

    // port 0 = OS picks a free ephemeral port; loopback only, so no firewall prompt
    pdfServer.listen(0, '127.0.0.1', () => {
      pdfServerPort = pdfServer.address().port;
      resolve(pdfServerPort);
    });
  });
}

async function servePdfBuffer(data, fileName) {
  const port  = await ensurePdfServer();
  const token = crypto.randomBytes(24).toString('hex');
  const name  = safeFileName(fileName);

  pdfStore.set(token, {
    data,
    fileName: `${name}.pdf`,
    expires: Date.now() + PDF_TTL_MS
  });

  const timer = setTimeout(() => pdfStore.delete(token), PDF_TTL_MS);
  if (timer.unref) timer.unref();

  // last segment only shapes the tab title and Chrome's default "Save as" name
  return `http://127.0.0.1:${port}/${token}/${encodeURIComponent(name)}.pdf`;
}

ipcMain.handle('view-pdf', async (event, { html, fileName }) => {
  try {
    const data = await renderHtmlToPdf(html);
    const url  = await servePdfBuffer(data, fileName);

    const chrome = findChrome();

    if (chrome) {
      spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, url, via: 'chrome' };
    }

    await shell.openExternal(url);
    return { ok: true, url, via: 'default-browser' };
  } catch (err) {
    console.error('view-pdf error', err);
    return { ok: false, error: String(err) };
  }
});

app.on('will-quit', () => {
  pdfStore.clear();
  if (pdfServer) {
    pdfServer.close();
    pdfServer = null;
  }
});

const statePath = path.join(app.getPath('userData'), 'state.json');
function saveState(data) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath + '.tmp', JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(statePath + '.tmp', statePath);
}
ipcMain.on('persist-state', (event, data) => {
  try { saveState(data); event.returnValue = {ok:true}; }
  catch (err) { event.returnValue = {ok:false, error:err.message}; }
});
ipcMain.handle('load-json', async () => {
  const source = fs.existsSync(statePath) ? statePath : paths.seedPath;
  return JSON.parse(fs.readFileSync(source, 'utf8'));
});
let localServer;
let appURL;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    icon: paths.iconPath,
    webPreferences: {
	  preload: paths.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    }
  });

  win.setTitle("EULC Screener");
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { label: 'Developer Tools', accelerator: 'CommandOrControl+Shift+I', click: () => win.webContents.toggleDevTools() },
      { label: 'Show / hide menu', accelerator: 'CommandOrControl+Shift+M', click: () => { menuVisible = !menuVisible; win.setMenuBarVisibility(menuVisible); } },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }
    ] }
  ]));
  win.setMenuBarVisibility(true);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault(); win.webContents.toggleDevTools();
    }
  });
  win.webContents.on('context-menu', (_event, params) => {
    Menu.buildFromTemplate([
      { role: 'copy', enabled: !!params.selectionText }, { role: 'paste', enabled: params.isEditable },
      { type: 'separator' },
      { label: 'Inspect element', click: () => win.webContents.inspectElement(params.x, params.y) },
      { label: 'Developer Tools', click: () => win.webContents.openDevTools() }
    ]).popup({window: win});
  });

  win.loadURL(appURL).catch(err => dialog.showErrorBox("EULC startup failed", err.message));
  win.webContents.setWindowOpenHandler(({url}) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return {action: "deny"};
  });


}



if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    try {
      const { startServer } = require('../server/server.cjs');
      const localCert = new crypto.X509Certificate(fs.readFileSync(path.join(paths.certsDir, 'localhost.crt')));
      if (Date.now() < Date.parse(localCert.validFrom) || Date.now() > Date.parse(localCert.validTo)) throw new Error('The localhost HTTPS certificate is not currently valid. Replace resources/certs/localhost.crt and localhost.key with a matching, valid pair.');
      session.defaultSession.setCertificateVerifyProc((request, callback) => {
        try {
          const cert = new crypto.X509Certificate(request.certificate.data);
          if (request.hostname === 'localhost' && cert.fingerprint256 === localCert.fingerprint256) return callback(0);
        } catch {}
        callback(-3); // Use normal Chromium verification for every other certificate.
      });
      // Chromium can build certificate chains and use OS trust/proxy settings.
      // Keep a separate upstream session with normal certificate verification;
      // the localhost certificate exception applies only to the UI session.
      const upstreamSession = session.fromPartition('eulc-upstream');
      localServer = await startServer({
        https: true,
        upstreamFetch: (url, init) => upstreamSession.fetch(url, init)
      });
      appURL = `https://localhost:${localServer.address().port}/`;
      createWindow();
    } catch (err) { dialog.showErrorBox('EULC startup failed', err.message); app.quit(); }
  });
}
app.on('will-quit', () => { if (localServer) localServer.close(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
