// cdp-shot.js — 用 Edge DevTools Protocol 给页面截图（无需 puppeteer）
// 用法: node cdp-shot.js <url> <out.png> [debugPort] [waitMs]
const http = require('http');
const fs = require('fs');

function request(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const url = process.argv[2];
  const out = process.argv[3] || 'shot.png';
  const port = process.argv[4] || '9333';
  const waitMs = Number(process.argv[5] || 8000);

  let target = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = JSON.parse(await request(`http://127.0.0.1:${port}/json`));
      target = list.find((t) => t.type === 'page' && t.url.indexOf('7456') >= 0);
      if (target) break;
    } catch (e) { /* retry */ }
    await sleep(500);
  }
  if (!target) {
    try {
      const created = JSON.parse(await request(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, 'PUT'));
      target = created;
    } catch (e) { /* ignore */ }
  }
  if (!target) { console.error('no page target on port ' + port); process.exit(1); }
  console.log('target:', target.url);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(waitMs);
  const evald = await send('Runtime.evaluate', {
    expression: "JSON.stringify({iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio,scrollW:document.documentElement.scrollWidth,canvas:(()=>{const c=document.querySelector('canvas');if(!c)return null;const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()})",
    returnByValue: true,
  });
  console.log('layout:', evald && evald.result && evald.result.result ? evald.result.result.value : 'n/a');

  const cx = Number(process.argv[6] || '-1');
  const cy = Number(process.argv[7] || '-1');
  if (cx >= 0 && cy >= 0) {
    console.log('tap at', cx, cy);
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 1 });
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await sleep(80);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(3000);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (!shot.result || !shot.result.data) { console.error('screenshot failed'); process.exit(2); }
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', out);
  ws.close();
  process.exit(0);
})();
