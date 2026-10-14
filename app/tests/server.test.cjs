const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {startServer, validateTarget} = require('../server/server.cjs');
const { uiRoot: root, certsDir } = require('../paths.cjs');
const fixture = async (t, upstreamFetch) => {
  const server = await startServer({root, port:0, upstreamFetch});
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
};
test('UI and module assets are served; private files stay private', async t => {
  const base = await fixture(t);
  const html = await (await fetch(base)).text();
  assert.match(html, /EULC Screener/); assert.doesNotMatch(html, /localhost:6969|<base/);
  for (const file of ['/styles/styles.css','/bootstrap.js','/index.js','/utils/external/pdfmake.js','/configs/configs.js','/icons/app.ico']) {
    assert.equal((await fetch(base + file)).status,200,file);
  }
  for (const file of ['/data/initial-state.json','/desktop/main.cjs','/server/server.cjs','/package.json','/resources/certs/localhost.key','/resources/data/initial-state.json','/app/../../data/initial-state.json']) {
    assert.equal((await fetch(base + file)).status,404,file);
  }
});
test('proxy preserves form fields, binary responses, and session cookies', async t => {
  let count = 0;
  const base = await fixture(t, async (url, options) => {
    assert.match(url, /^https:\/\/www.eulc.edu.eg/);
    if (++count === 1) {
      assert.equal(options.method,'POST'); assert.match(options.body.toString(), /SearchText=hello/);
      return new Response('<div>Arabic: مرحبا</div>', {headers:{'content-type':'text/html; charset=utf-8','set-cookie':'session=abc; Path=/'}});
    }
    assert.equal(options.headers.Cookie,'session=abc');
    return new Response(Uint8Array.from([0,128,255]), {headers:{'content-type':'image/gif'}});
  });
  const target = '/fetch?url=' + encodeURIComponent('https://www.eulc.edu.eg/eulc_v5/test');
  const html = await fetch(base + target,{method:'POST',body:'SearchText=hello',headers:{'content-type':'application/x-www-form-urlencoded'}});
  assert.match(await html.text(), /مرحبا/);
  const image = await fetch(base + target);
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()),Uint8Array.from([0,128,255]));
});
test('rejects arbitrary targets, cross-origin requests, and unsafe redirects', async t => {
  for (const target of ['http://localhost/','file:///tmp/a','https://evil.example/','https://www.eulc.edu.eg:9999/']) assert.throws(()=>validateTarget(target));
  const base = await fixture(t, async () => new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}));
  assert.equal((await fetch(base+'/fetch?url=https://evil.example/')).status,400);
  assert.equal((await fetch(base+'/health',{headers:{origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(base+'/fetch?url=https://www.eulc.edu.eg/')).status,502);
});
test('network failures finish with a visible error rather than hanging', async t => {
  const base = await fixture(t, async () => {throw new Error('offline');});
  const response = await fetch(base+'/fetch?url=https://www.eulc.edu.eg/');
  assert.equal(response.status,502); assert.match(await response.text(),/offline/);
});
test('bundled HTTPS certificate/key serve the UI with certificate validation', async t => {
  const https = require('node:https');
  const fs = require('node:fs');
  const server = await startServer({root,port:0,https:true});
  t.after(()=>server.close());
  const body = await new Promise((resolve,reject)=> {
    https.get({hostname:'127.0.0.1',port:server.address().port,path:'/',servername:'localhost',ca:fs.readFileSync(path.join(certsDir,'localhost.crt')),headers:{Host:`localhost:${server.address().port}`}},response=> {
      assert.equal(response.statusCode,200); let body=''; response.on('data',data=>body+=data);response.on('end',()=>resolve(body));
    }).on('error',reject);
  });
  assert.match(body,/EULC Screener/);
});
test('upstream HTTP failures retain status/body and identify their source', async t => {
  const base = await fixture(t, async () => new Response('Remote service unavailable', {status:503}));
  const url = 'https://www.eulc.edu.eg/eulc_v5/test';
  const response = await fetch(base + '/fetch?url=' + encodeURIComponent(url));
  assert.equal(response.status,503);
  assert.equal(response.headers.get('X-EULC-Error-Source'),'upstream-http');
  assert.equal(response.headers.get('X-EULC-Upstream-Status'),'503');
  assert.equal(decodeURIComponent(response.headers.get('X-EULC-Final-URL')),url);
  assert.ok(response.headers.get('X-EULC-Request-Id'));
  assert.equal(await response.text(),'Remote service unavailable');
});
test('TLS causes identify a local proxy failure, not an upstream HTTP status', async t => {
  const base = await fixture(t, async () => { const cause = new Error('certificate has expired'); cause.code='CERT_HAS_EXPIRED'; throw new Error('fetch failed',{cause}); });
  const response = await fetch(base+'/fetch?url=https://www.eulc.edu.eg/');
  assert.equal(response.status,502);
  assert.equal(response.headers.get('X-EULC-Error-Source'),'local-proxy');
  assert.equal(response.headers.get('X-EULC-Upstream-Status'),null);
  assert.match(await response.text(),/CERT_HAS_EXPIRED/);
});
test('local timeouts identify the proxy and use HTTP 504', async t => {
  const base = await fixture(t, async () => { const err = new Error('request timed out'); err.name='TimeoutError'; throw err; });
  const response = await fetch(base+'/fetch?url=https://www.eulc.edu.eg/');
  assert.equal(response.status,504);
  assert.equal(response.headers.get('X-EULC-Error-Source'),'local-proxy');
});
