// index.js
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const app = express();
const server = http.createServer(app);

// ----- WebSocket: /ws-echo (path-scoped)
const wssEcho = new WebSocket.Server({ noServer: true });
wssEcho.on('connection', (ws) => {
  ws.on('message', (msg) => ws.send(msg));
});

// ----- WebSocket: /ws-ping (path-scoped)
const wssPing = new WebSocket.Server({ noServer: true });
wssPing.on('connection', (ws) => {
  const iv = setInterval(() => { try { ws.send('pong'); } catch {} }, 2000);
  ws.on('close', () => clearInterval(iv));
});

// ----- WebSocket: /web-demo/ws (handshake only demo)
const wssDemo = new WebSocket.Server({ noServer: true });
wssDemo.on('connection', (ws) => {
  ws.send('demo: handshake ok');
  // You can expand this later for your real audio pipeline
});

// HTTP→WS upgrade routing
server.on('upgrade', (req, socket, head) => {
  const { url } = req;
  if (url === '/ws-echo') {
    wssEcho.handleUpgrade(req, socket, head, (ws) => wssEcho.emit('connection', ws, req));
  } else if (url === '/ws-ping') {
    wssPing.handleUpgrade(req, socket, head, (ws) => wssPing.emit('connection', ws, req));
  } else if (url.startsWith('/web-demo/ws')) {
    wssDemo.handleUpgrade(req, socket, head, (ws) => wssDemo.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// -------- Serve the exported Next app (./out) at /
const OUT_DIR = path.join(__dirname, 'out');
app.use(express.static(OUT_DIR, { extensions: ['html'] }));

// If file not found, fall back to Next index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/smoke')) return next(); // let smoke page below handle
  res.sendFile(path.join(OUT_DIR, 'index.html'), (err) => {
    if (err) next(); // if out/index.html missing, fall through
  });
});

// ---- OPTIONAL: keep the old smoke page at /smoke
app.get('/smoke', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>WS Smoke</title>
<style>body{background:#111;color:#eee;font:16px/1.3 system-ui,Segoe UI,Roboto}
#log{white-space:pre;font:14px/1.3 ui-monospace,Consolas;background:#000;padding:16px;border-radius:8px}
button{margin-right:8px}</style></head>
<body>
<h1>WebSocket smoke test</h1>
<div>
  <button onclick="test('wss://' + location.host + '/ws-echo','echo')">Test /ws-echo</button>
  <button onclick="test('wss://' + location.host + '/ws-ping','ping')">Test /ws-ping</button>
  <button onclick="test('wss://' + location.host + '/web-demo/ws','demo')">Test /web-demo/ws</button>
</div>
<pre id="log"></pre>
<script>
const logEl=document.getElementById('log');
function add(){logEl.textContent += Array.from(arguments).join(' ') + "\\n";}
function test(url,name){
  add('[try]', JSON.stringify(url));
  const ws = new WebSocket(url);
  ws.onopen = () => { add('[open]', JSON.stringify(url)); if(name==='echo') ws.send(new Blob([new Uint8Array([1,2,3,4])])) };
  ws.onmessage = (e) => { add('[msg]', JSON.stringify(name), JSON.stringify(typeof e.data)); if(name==='demo' && typeof e.data==='string') add('[msg]', JSON.stringify(e.data)); };
  ws.onclose = (e) => add('[close]', JSON.stringify([e.code,e.reason,{clean:e.wasClean}]));
  ws.onerror = (e) => add('[err]', JSON.stringify(String(e)));
}
</script>
</body></html>`);
});

server.listen(PORT, () => {
  console.log('server_listen', { url: `http://0.0.0.0:${PORT}` });
  console.log('boot_env', { PORT: String(PORT), node: process.version });
});
