// Node-only: offloads crowd separation for zones with big waves to a worker thread.
// The result for tick N is applied on tick N+1 (one 50 ms tick of latency, invisible at enemy speeds).
import { Worker } from 'node:worker_threads';
import { pack } from './crowd.js';
export class CrowdWorker {
  constructor(threshold = 80) {
    this.threshold = threshold; this.results = new Map(); this.busy = new Set(); this.jobs = 0;
    this.w = new Worker(new URL('./crowd-worker.js', import.meta.url));
    this.w.on('message', ({ key, ids, out }) => { const m = new Map(); for (let i = 0; i < ids.length; i++) m.set(ids[i], [out[i * 2], out[i * 2 + 1]]); this.results.set(key, m); this.busy.delete(key); });
    this.w.unref();
  }
  /** returns the separation pushes computed from the previous tick (Map id -> [dx, dz]) and queues this tick's job */
  step(key, list) {
    if (!this.busy.has(key)) {
      const n = list.length, pos = pack(list, null), ids = new Float64Array(n);
      for (let i = 0; i < n; i++) ids[i] = list[i].id;
      this.busy.add(key); this.jobs++;
      this.w.postMessage({ key, ids, pos, n }, [ids.buffer, pos.buffer]);
    }
    return this.results.get(key) || null;
  }
  stop() { this.w.terminate(); }
}
