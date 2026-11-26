// Applies full ('ents') and delta ('entsD') entity snapshots to a Map id -> row. Shared by the client and tests.
export function applySnapshot(state, m) {
  if (m.t === 'ents' || state.zone !== m.zone) { state.zone = m.zone; state.rows = new Map((m.list || []).map((r) => [r[0], r.slice()])); }
  if (m.t === 'entsD') {
    for (const r of m.add) state.rows.set(r[0], r.slice());
    for (const u of m.upd) { const r = state.rows.get(u[0]); if (!r) continue; r[2] = u[1] / 20; r[3] = u[2] / 20; r[4] = u[3] / 40; if (u.length > 4) { r[5] = u[4]; r[8] = u[5]; r[6] = u[6]; } }
    for (const id of m.del) state.rows.delete(id);
  }
  state.allies = m.allies;
  return { t: 'ents', zone: m.zone, list: [...state.rows.values()], allies: m.allies };
}
