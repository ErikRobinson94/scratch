import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3000;
const app = express();

// --- Simple test page ---
app.get('/', (_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html>
<head><meta charset="utf-8"/><title>WS Smoke</title></head>
<body style="font-family:system-ui;margin:2rem">
  <h1>WebSocket smoke test</h1>
  <p>
    <button id="echoBtn">Test /ws-echo</button>
    <button id="pingBtn">Test /ws-ping</button>
    <button id="demoBtn">Test /web-demo/ws</button>
  </p>
  <pre id="log" style="background:#111;color:#0f0;padding:1rem;height:320px;overflow:auto"></pre>
  <script>
    const log = (m,...a)=>{ console.log(m,...a); logEl.textContent += m + (a.length?(" "+JSON.stringify(a)):"") + "\\n"; };
    const logEl = document.getElementById('log');

    function test(path, onopen) {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + path;
      log('[try]', url);
      const ws = new WebSocket(url);
      ws.onopen   = () => { log('[open]', url); onopen?.(ws); };
      ws.onmessage= e  => log('[msg]', String(e.data));
      ws.onerror  = e  => log('[error]', e);
      ws.onclose  = e  => log('[close]', e.code, e.reason, 'clean='+e.wasClean);
    }

    document.getElementById('echoBtn').onclick = () => {
      test('/ws-echo', ws => { ws.send('hello'); setTimeout(()=>ws.close(1000,'done'), 500); });
    };

    document.getElementById('pingBtn').onclick = () => {
      test('/ws-ping'); // server will push "pong" every 2s
    };

    document.getElementById('demoBtn').onclick = () => {
      test('/web-demo/ws'); // handshake only
    };
  </script>
</body>
</html>`);
});

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// --- HTTP server + WS upgrade routing ---
const server = http.createServer(app);

const wssEcho = new WebSocketServer({ noServer: true });
const wssPing = new WebSocketServer({ noServer: true });
const wssDemo = new WebSocketServer({ noServer: true });

wssEcho.on('connection', ws => {
  ws.on('message', msg => ws.send(msg));
});

wssPing.on('connection', ws => {
  const t = setInterval(()=>ws.readyState===ws.OPEN && ws.send('pong'), 2000);
  ws.on('close', ()=> clearInterval(t));
});

wssDemo.on('connection', ws => {
  // handshake OK; send a hello once
  ws.send('demo: handshake ok');
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  console.log('upgrade_request', { path: url.pathname, headers: req.headers['sec-websocket-key'] ? 'has-ws-headers' : 'no-ws-headers' });

  const route = url.pathname;
  const accept = (wss) => wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));

  if (route === '/ws-echo') return accept(wssEcho);
  if (route === '/ws-ping') return accept(wssPing);
  if (route === '/web-demo/ws') return accept(wssDemo);

  // Unknown path -> 404 for WS upgrade
  socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
  socket.destroy();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('server_listen', { url: `http://0.0.0.0:${PORT}` });
  console.log('boot_env', { PORT, node: process.version });
});

// Extra crash visibility
process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); });
