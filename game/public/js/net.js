// Thin WebSocket client with typed message handlers.
export class Net {
  constructor() { this.handlers = {}; this.ws = null; }
  connect() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not reach the Emberfall server.'));
      ws.onclose = () => this.emit({ t: 'close' });
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.emit(m); };
    });
  }
  emit(m) { const hs = this.handlers[m.t]; if (hs) for (const h of hs) h(m); }
  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
}
