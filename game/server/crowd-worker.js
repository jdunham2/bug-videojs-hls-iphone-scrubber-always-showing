// Worker thread: computes crowd separation for big waves off the main simulation thread.
import { parentPort } from 'node:worker_threads';
import { separate } from './crowd.js';
parentPort.on('message', ({ key, ids, pos, n }) => {
  const out = separate(pos, n);
  parentPort.postMessage({ key, ids, out }, [ids.buffer, out.buffer]);
});
