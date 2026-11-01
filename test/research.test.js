import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ME,
  applyFinding,
  cellKey,
  ensureCompetitor,
  gapsOf,
  isOld,
  newComparison,
  progress,
  safeUrl,
  validFinding,
  writeupStale,
} from '../src/core/research.js';

const cmp = () => {
  const c = newComparison({ name: 'T', competitors: ['a', 'b'] });
  c.features = [{ id: 'f', name: 'SSO' }];
  return c;
};
const yes = { status: 'yes', note: 'n', source: 'https://a.example/docs' };
const set = (c, fid, pid, s) => (c.cells[cellKey(fid, pid)] = { s, by: 'me', at: 1, reviewed: true });

test('only web links count as sources', () => {
  assert.equal(safeUrl('a.example/x'), 'https://a.example/x');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('file:///etc/passwd'), '');
  assert.equal(safeUrl(''), '');
});

test('a claim needs evidence, an Unknown does not', () => {
  assert.throws(() => validFinding({ status: 'yes', note: 'n' }), /web address/);
  assert.throws(() => validFinding({ status: 'no', source: 'javascript:x' }), /web address/);
  assert.throws(() => validFinding({ status: 'maybe', source: 'https://a.example' }), /Unknown status/);
  assert.equal(validFinding({ status: 'unknown', note: 'No docs' }).s, 'unknown');
});

test('Claude cannot write your column or overwrite your edits', () => {
  const c = cmp();
  assert.throws(() => applyFinding(c, 'f', ME, yes), /own product/);
  set(c, 'f', 'a', 'no');
  assert.throws(() => applyFinding(c, 'f', 'a', yes), /by hand/);
  assert.equal(c.cells[cellKey('f', 'a')].s, 'no');
});

test('a reviewed finding that changes needs review again and remembers the old answer', () => {
  const c = cmp();
  applyFinding(c, 'f', 'a', yes);
  assert.equal(c.cells[cellKey('f', 'a')].reviewed, false);
  c.cells[cellKey('f', 'a')].reviewed = true;
  applyFinding(c, 'f', 'a', { ...yes, status: 'partial' });
  const cell = c.cells[cellKey('f', 'a')];
  assert.equal(cell.reviewed, false);
  assert.equal(cell.prev, 'yes');
});

test('gaps sort features by you against the best competitor', () => {
  const c = cmp();
  c.features = ['behind', 'adv', 'open', 'level', 'nodata', 'nome'].map(id => ({ id, name: id }));
  const row = (id, me, a, b) => {
    if (me) set(c, id, ME, me);
    if (a) set(c, id, 'a', a);
    if (b) set(c, id, 'b', b);
  };
  row('behind', 'partial', 'yes', 'no');
  row('adv', 'yes', 'partial', 'no');
  row('open', 'partial', 'no', 'partial');
  row('level', 'yes', 'yes', 'no');
  row('nodata', 'yes', 'unknown', null);
  row('nome', null, 'yes', 'yes');
  const g = gapsOf(c);
  const ids = k => g[k].map(e => e.feature.id);
  assert.deepEqual(ids('behind'), ['behind']);
  assert.deepEqual(ids('advantage'), ['adv']);
  assert.deepEqual(ids('open'), ['open']);
  assert.deepEqual(ids('level'), ['level']);
  assert.deepEqual(ids('unchecked'), ['nodata', 'nome']);
});

test('age, progress and stale write-ups', () => {
  const c = cmp();
  assert.deepEqual(progress(c), { filled: 0, total: 2 });
  applyFinding(c, 'f', 'a', yes, 1000);
  assert.deepEqual(progress(c), { filled: 1, total: 2 });
  assert.equal(isOld({ at: 0 }, 91 * 864e5), true);
  assert.equal(isOld({ at: 0 }, 89 * 864e5), false);
  c.writeups.a = { text: 'x', at: 500 };
  assert.equal(writeupStale(c, 'a'), true);
  c.writeups.a.at = 2000;
  assert.equal(writeupStale(c, 'a'), false);
});

test('competitors are reused by name, not duplicated', () => {
  const list = [];
  const a = ensureCompetitor(list, { name: 'Linear' });
  assert.equal(ensureCompetitor(list, { name: ' linear ', site: 'linear.app' }), a);
  assert.equal(list.length, 1);
  assert.equal(a.site, 'https://linear.app/');
  assert.equal(ensureCompetitor(list, { name: 'Bad', site: 'javascript:x' }).site, '');
  assert.throws(() => ensureCompetitor(list, { name: ' ' }), /needs a name/);
});
