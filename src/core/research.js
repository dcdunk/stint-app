/* ---------- RESEARCH: rules for competitor comparisons. Pure: no store, no DOM. ----------
   A comparison holds features, competitor ids and cells keyed "<feature>|<product>",
   where the product is a competitor id or ME (the user's own column, never written by Claude). */
import { uid } from './utils.js';

export const ME = 'me';
export const OLD_DAYS = 90;
export const FINDINGS = {
  yes: { label: 'Yes', icon: 'check', color: 'var(--green)', rank: 2 },
  partial: { label: 'Partial', icon: 'contrast', color: 'var(--amber)', rank: 1 },
  no: { label: 'No', icon: 'x', color: 'var(--red)', rank: 0 },
  unknown: { label: 'Unknown', icon: 'circle-help', color: 'var(--text-3)', rank: null },
};

export const cellKey = (fid, pid) => fid + '|' + pid;
export const cellOf = (c, fid, pid) => c.cells[cellKey(fid, pid)];

export function newComparison({ name, brief = '', competitors = [] }) {
  return { id: uid('cmp'), name, brief, competitors, features: [], cells: {}, writeups: {}, thread: [], plan: [], session: null, created: Date.now() };
}

/* Reuse a saved competitor by name; add it otherwise, filling in a missing website. */
export function ensureCompetitor(list, { name, site }) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('A competitor needs a name');
  const url = safeUrl(site);
  let c = list.find(x => x.name.toLowerCase() === n.toLowerCase());
  if (!c) list.push((c = { id: uid('rv'), name: n, site: url, note: '' }));
  else if (url && !c.site) c.site = url;
  return c;
}

/* Only web links: a page could hand us javascript: or file: urls. */
export function safeUrl(s) {
  let raw = String(s ?? '').trim();
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/* What Claude may record: evidence or an honest Unknown, never an unsourced claim. */
export function validFinding({ status, note, source, quote }) {
  if (!FINDINGS[status]) throw new Error(`Unknown status “${status}”. Use one of: ${Object.keys(FINDINGS).join(', ')}`);
  const src = safeUrl(source);
  if (status !== 'unknown' && !src)
    throw new Error(`A “${status}” finding needs the web address of the page that supports it. If you found no evidence, use status "unknown".`);
  return { s: status, note: String(note ?? '').slice(0, 160), src, quote: String(quote ?? '').slice(0, 400) };
}

/* Claude's write to a cell. The user's own edits are protected; a reviewed finding that
   changes goes back to unreviewed and remembers what it used to say. */
export function applyFinding(c, fid, pid, input, now = Date.now()) {
  if (pid === ME) throw new Error("That column is the user's own product. Only they fill it in.");
  const k = cellKey(fid, pid);
  const was = c.cells[k];
  if (was?.by === 'me') throw new Error('The user wrote this cell by hand, so it was left as is.');
  const f = validFinding(input);
  const prev = was?.reviewed && was.s !== f.s ? was.s : was?.prev;
  c.cells[k] = { ...f, by: 'claude', at: now, reviewed: false, ...(prev ? { prev } : {}) };
  return c.cells[k];
}

export const isOld = (cell, now = Date.now()) => !!cell && now - cell.at > OLD_DAYS * 864e5;
const rank = cell => (cell ? FINDINGS[cell.s].rank : null);

/* Empty or Unknown competitor cells are the ones worth (re)checking. */
export function progress(c) {
  const total = c.features.length * c.competitors.length;
  let filled = 0;
  c.features.forEach(f => c.competitors.forEach(p => cellOf(c, f.id, p) && filled++));
  return { filled, total };
}

/* Sort every feature by how you compare with the best competitor evidence. */
export function gapsOf(c) {
  const out = { behind: [], advantage: [], open: [], level: [], unchecked: [] };
  for (const f of c.features) {
    const you = rank(cellOf(c, f.id, ME));
    const others = c.competitors.map(p => ({ pid: p, cell: cellOf(c, f.id, p) })).filter(o => rank(o.cell) !== null);
    if (you === null || !others.length) {
      out.unchecked.push({ feature: f, others });
      continue;
    }
    const top = Math.max(...others.map(o => rank(o.cell)));
    const entry = { feature: f, others: others.sort((a, b) => rank(b.cell) - rank(a.cell)), unreviewed: others.some(o => !o.cell.reviewed) };
    if (you < 2 && top === 2) out.behind.push(entry);
    else if (you === 2 && top < 2) out.advantage.push(entry);
    else if (you < 2 && top < 2) out.open.push(entry);
    else out.level.push(entry);
  }
  return out;
}

/* A write-up goes stale when a finding in its column changes after it was written. */
export function writeupStale(c, pid) {
  const w = c.writeups[pid];
  return !!w && c.features.some(f => (cellOf(c, f.id, pid)?.at || 0) > w.at);
}
