import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blank, seed } from '../src/data/seed.js';

test('empty workspace has every field the demo workspace has', () => {
  const missing = Object.keys(seed()).filter(k => !(k in blank()));
  assert.deepEqual(missing, []);
});

test('empty workspace holds only you', () => {
  const d = blank();
  assert.equal(d.members.length, 1);
  assert.equal(d.members[0].id, d.me);
  for (const k of ['projects', 'tasks', 'comments', 'activity', 'notifs', 'files', 'events', 'teams']) assert.deepEqual(d[k], [], k);
});
