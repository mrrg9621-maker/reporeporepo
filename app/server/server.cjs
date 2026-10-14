'use strict';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs/promises');
const path = require('node:path');
const paths = require('../paths.cjs');
const { version } = require('../package.json');
const ALLOWED_HOSTS = new Set(['www.eulc.edu.eg', 'eulc.edu.eg']);
// Upstream time limit. The renderer may ask for more (catalogue searches can
// take minutes on EULC's side) via ?timeout=<ms>, up to MAX_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 45000;
const MAX_TIMEOUT_MS = 300000;
function requestTimeout(value) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? Math.min(Math.max(ms, 1000), MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
}
function validateTarget(value) {
  const url = new URL(value);
  if (!ALLOWED_HOSTS.has(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
    throw new Error('Only EULC HTTP/HTTPS requests are allowed');
  }
  return url;
}
async function readBody(req, limit = 2 * 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function createServer({root = paths.uiRoot, upstreamFetch = globalThis.fetch, tls} = {}) {
  const cookies = new Map();
  let requestNumber = 0;
  async function upstream(target, method, body, contentType, timeoutMs = DEFAULT_TIMEOUT_MS) {
    let url = validateTarget(target);
    const signal = AbortSignal.timeout(timeoutMs);
    for (let redirects = 0; redirects <= 5; redirects++) {
      const headers = {'User-Agent': 'Mozilla/5.0 EULC-Screener/2.0', 'Accept': '*/*'};
      if (contentType) headers['Content-Type'] = contentType;
      if (cookies.size) headers.Cookie = [...cookies].map(([k,v]) => `${k}=${v}`).join('; ');
      const response = await upstreamFetch(url.href, {method, body: ['GET', 'HEAD'].includes(method) ? undefined : body, headers, redirect:'manual', signal});
      for (const cookie of response.headers.getSetCookie?.() || []) {
        const pair = cookie.split(';')[0]; const sep = pair.indexOf('=');
        if (sep > 0) cookies.set(pair.slice(0, sep), pair.slice(sep + 1));
      }
      if ([301,302,303,307,308].includes(response.status) && response.headers.has('location')) {
        url = validateTarget(new URL(response.headers.get('location'), url).href);
        await response.body?.cancel();
        if (response.status === 303 || ([301,302].includes(response.status) && method === 'POST')) { method = 'GET'; body = undefined; contentType = undefined; }
        continue;
      }
      return { response, finalUrl: url.href };
    }
    throw new Error('Too many EULC redirects');
  }
  const handler = async (req, res) => {
    let requestId = '', target = '';
    const fail = (status, message, source = 'local-server') => {
      res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8', 'X-EULC-Error-Source':source, 'Cache-Control':'no-store'});
      res.end(message);
    };
    try {
      const expectedHost = `${tls ? "localhost" : "127.0.0.1"}:${req.socket.localPort}`;
      const protocol = tls ? "https" : "http";
      if (req.headers.host !== expectedHost) return fail(403, 'Invalid local host');
      if (req.headers.origin && req.headers.origin !== `${protocol}://${expectedHost}`) return fail(403, 'Requests must come from this app');
      const url = new URL(req.url, `${protocol}://${expectedHost}`);
      if (url.pathname === '/health') {
        res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({app:'eulc-screener',version}));
      }
      if (url.pathname === '/fetch') {
        if (!['GET','POST','HEAD'].includes(req.method)) return fail(405, 'Method not supported');
        try { validateTarget(url.searchParams.get('url')); } catch (err) { return fail(400, err.message); }
        target = url.searchParams.get('url');
        requestId = `${Date.now().toString(36)}-${++requestNumber}`;
        res.setHeader('X-EULC-Request-Id', requestId);
        res.setHeader('X-EULC-Target-URL', encodeURIComponent(target));
        const started = Date.now();
        console.info(`[EULC ${requestId}] ${req.method} ${target}`);
        const timeoutMs = requestTimeout(url.searchParams.get('timeout'));
        const {response, finalUrl} = await upstream(target, req.method, await readBody(req), req.headers['content-type'], timeoutMs);
        const body = Buffer.from(await response.arrayBuffer());
        const duration = Date.now() - started;
        const responseHeaders = {
          'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
          'Cache-Control':'no-store', 'X-EULC-Upstream-Status':String(response.status),
          'X-EULC-Final-URL':encodeURIComponent(finalUrl), 'X-EULC-Duration-Ms':String(duration)
        };
        if (!response.ok) responseHeaders['X-EULC-Error-Source'] = 'upstream-http';
        console[response.ok ? 'info' : 'error'](`[EULC ${requestId}] upstream HTTP ${response.status} (${duration} ms) ${finalUrl}`);
        res.writeHead(response.status, responseHeaders);
        return res.end(req.method === 'HEAD' ? undefined : body);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return fail(405, 'Method not supported');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/icons/app.ico') {
        const icon = await fs.readFile(paths.iconPath);
        res.writeHead(200, {'Content-Type':'image/x-icon', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'});
        return res.end(req.method === 'HEAD' ? undefined : icon);
      }
      // Only renderer assets are served; data, Node source, and documentation stay private.
      const allowed = /^\/(index\.html|index\.js|bootstrap\.js)$/.test(pathname) || /^\/(app|core|configs|styles|utils)\/[\w./-]+\.(js|css)$/.test(pathname);
      if (pathname !== '/' && !allowed) return fail(404, 'Not found');
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(path.resolve(root) + path.sep)) return fail(403, 'Invalid path');
      const body = await fs.readFile(file);
      const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ico':'image/x-icon'};
      res.writeHead(200, {'Content-Type':mime[path.extname(file)], 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
      const details = [];
      let cause = err;
      for (let depth = 0; cause && depth < 5; depth++, cause = cause.cause) {
        details.push(`${cause.code || cause.name || 'Error'}: ${cause.message || String(cause)}`);
      }
      const explanation = details.join(' -> ');
      if (requestId) {
        // Electron's fetch reports our own time limit as "aborted due to timeout" or ABORT_ERR
        const timedOut = /TimeoutError|ETIMEDOUT|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|timeout|ABORT_ERR|AbortError/i.test(explanation);
        const status = timedOut ? 504 : 502;
        const message = `Local proxy failed before it could return a complete upstream response.\nRequest: ${requestId}\n${req.method} ${target}\n${explanation}`;
        console.error(`[EULC ${requestId}] local proxy HTTP ${status}: ${explanation}`, {target});
        fail(status, message, 'local-proxy');
      } else {
        fail(err.code === 'ENOENT' ? 404 : 500, err.code === 'ENOENT' ? 'Not found' : `Local server: ${explanation}`);
      }
    }
  };
  return tls ? https.createServer(tls, handler) : http.createServer(handler);
}
async function startServer(options = {}) {
  if (options.https) {
    const certsDir = options.certsDir || paths.certsDir;
    options = {...options, tls: {
      cert: await fs.readFile(path.join(certsDir, 'localhost.crt')),
      key: await fs.readFile(path.join(certsDir, 'localhost.key'))
    }};
  }
  const server = createServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 18761, '127.0.0.1', resolve);
  });
  return server;
}
module.exports = {createServer, startServer, validateTarget, requestTimeout};
