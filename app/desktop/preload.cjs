const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {

    document.addEventListener('click', (event) => {

        const target = event.target.closest('a[href]');
        if (!target) return;

        // Programmatic download anchors (blob:/data: + [download]) must be left
        // alone -- handing them to shell.openExternal makes Windows ask for
        // "a new app to open this blob link".
        if (target.hasAttribute('download')) return;
        if (!/^https?:$/i.test(target.protocol)) return;

        event.preventDefault();
        ipcRenderer.send('open-external', target.href);
    });

    ipcRenderer.on('renderer-log', (event, message) => {
        console.log(message);
    });
});

contextBridge.exposeInMainWorld('appAPI', {
  persistState: (data) => { const r = ipcRenderer.sendSync('persist-state', data); if (!r.ok) throw new Error(r.error); },
  loadJSON:   (filename)         => ipcRenderer.invoke('load-json', filename),

  // html -> PDF via Chromium's own layout engine (correct Arabic shaping + bidi)
  htmlToPdf:  (html, fileName, opts = {}) =>
                  ipcRenderer.invoke('html-to-pdf', { html, fileName, ...opts }),

  // same renderer, but the bytes come back instead of hitting the disk, so a
  // batch of PDFs can be zipped in the renderer (screener "Download All")
  htmlToPdfBuffer: (html) => ipcRenderer.invoke('html-to-pdf-buffer', { html }),

  openInChrome: (filePath) => ipcRenderer.invoke('open-in-chrome', filePath),

  // renders the html, keeps the PDF in memory, opens it in a Chrome tab
  viewPdf:      (html, fileName) => ipcRenderer.invoke('view-pdf', { html, fileName }),
  revealFile:   (filePath) => ipcRenderer.invoke('reveal-file', filePath)
});
