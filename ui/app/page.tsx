'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';

type Log = { t: number; level: 'info' | 'warn' | 'error'; msg: string; meta?: any };

function now() { return Math.round(performance.now()); }
function fmt(ms: number) { return ms.toString().padStart(6, ' '); }

function useLogger() {
  const [logs, setLogs] = useState<Log[]>([]);
  const add = useCallback((level: Log['level'], msg: string, meta?: any) => {
    const entry: Log = { t: now(), level, msg, meta };
    const tag = `[ui ${level}]`;
    if (level === 'error') console.error(tag, msg, meta ?? '');
    else if (level === 'warn') console.warn(tag, msg, meta ?? '');
    else console.log(tag, msg, meta ?? '');
    setLogs((l) => [...l, entry]);
  }, []);
  const clear = useCallback(() => setLogs([]), []);
  return { logs, add, clear };
}

function getWSBase(): string {
  const origin = process.env.NEXT_PUBLIC_BACKEND_ORIGIN;
  if (origin) {
    const u = new URL(origin);
    return `wss://${u.host}`;
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

async function wsTry(
  url: string,
  opts: {
    name: string;
    expect?: (ev: MessageEvent) => boolean;
    onOpen?: (ws: WebSocket) => void;
    timeoutMS?: number;
    closeAfter?: number;
    logger: (level: Log['level'], msg: string, meta?: any) => void;
  }
): Promise<void> {
  const { name, onOpen, expect, timeoutMS = 4000, closeAfter = 0, logger } = opts;
  logger('info', `[try] ${name} -> ${url}`);
  const started = now();

  return new Promise<void>((resolve, reject) => {
    let done = false;
    const ws = new WebSocket(url);

    const finish = (ok: boolean, why: any) => {
      if (done) return;
      done = true;
      const dur = now() - started;
      if (ok) logger('info', `[ok] ${name} in ${dur}ms`);
      else logger('error', `[fail] ${name} in ${dur}ms`, why);
      try { ws.close(); } catch {}
      ok ? resolve() : reject(why);
    };

    const to = setTimeout(() => finish(false, new Error(`timeout ${timeoutMS}ms`)), timeoutMS);

    ws.onopen = () => {
      logger('info', `[open] ${name}`);
      try { onOpen?.(ws); } catch (e) { clearTimeout(to); finish(false, e); }
    };
    ws.onerror = (e) => { clearTimeout(to); finish(false, e); };
    ws.onmessage = (e) => {
      logger('info', `[msg] ${name}`, typeof e.data);
      if (!expect) return;
      let ok = false;
      try { ok = expect(e); } catch (er) { clearTimeout(to); finish(false, er); return; }
      if (ok) {
        if (closeAfter > 0) setTimeout(() => { clearTimeout(to); finish(true, null); }, closeAfter);
        else { clearTimeout(to); finish(true, null); }
      }
    };
    ws.onclose = (e) => logger('warn', `[close] ${name}`, { code: e.code, reason: e.reason, clean: e.wasClean });
  });
}

export default function Page() {
  const { logs, add, clear } = useLogger();
  const runningRef = useRef(false);
  const base = useMemo(() => getWSBase(), []);
  const urls = useMemo(() => ({
    echo: `${base}/ws-echo`,
    ping: `${base}/ws-ping`,
    demo: `${base}/web-demo/ws`,
  }), [base]);

  const smoke = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    clear();
    add('info', `[smoke] begin`, { base });

    try {
      await wsTry(urls.echo, {
        name: 'ws-echo',
        onOpen: (ws) => ws.send(new Blob([new Uint8Array([1,2,3,4])])),
        expect: () => true,
        timeoutMS: 4000,
        closeAfter: 50,
        logger: add,
      });

      await wsTry(urls.ping, {
        name: 'ws-ping',
        expect: (e) => (typeof e.data === 'string' && e.data.toLowerCase().includes('pong')),
        timeoutMS: 6000,
        logger: add,
      });

      await wsTry(urls.demo, {
        name: 'web-demo',
        expect: () => true,
        timeoutMS: 4000,
        logger: add,
      });

      add('info', `[smoke] ✅ ALL PASS`);
    } catch (e) {
      add('error', `[smoke] ❌ FAIL`, e);
    } finally {
      add('info', `[smoke] end`);
      runningRef.current = false;
    }
  }, [urls, add, clear]);

  return (
    <main className="min-h-screen p-6 bg-black text-white">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Case Connect — WebSocket UI</h1>
        <p className="text-sm text-gray-400">Backend: <code className="text-gray-300">{base}</code></p>

        <div className="flex gap-3">
          <button onClick={smoke} className="px-4 py-2 rounded-xl bg-yellow-400 text-black font-semibold hover:brightness-95">
            Start (run smoke test)
          </button>
          <button onClick={clear} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700">
            Clear
          </button>
        </div>

        <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
          <div className="font-mono text-xs leading-6 whitespace-pre-wrap">
            {logs.length === 0
              ? <div className="text-zinc-500">Logs will appear here…</div>
              : logs.map((l, i) => {
                  const color = l.level === 'error' ? 'text-red-400'
                               : l.level === 'warn' ? 'text-amber-300'
                               : 'text-green-300';
                  return <div key={i} className={color}>[{fmt(l.t)}] {l.msg}{l.meta ? `  ${safeMeta(l.meta)}` : ''}</div>;
                })}
          </div>
        </section>
      </div>
    </main>
  );
}

function safeMeta(m: any) {
  try { if (m instanceof Event) return `{Event type="${(m as any).type}"}`; return JSON.stringify(m); }
  catch { return String(m); }
}
