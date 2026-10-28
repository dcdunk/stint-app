import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulletEnter, bulletize } from '../src/core/bullets.js';

const box = (value, at = value.length) => ({ value, selectionStart: at, selectionEnd: at });

test('"- " at the start of a line becomes a bullet', () => {
  const t = box('- ');
  bulletize(t);
  assert.equal(t.value, '• ');
  const u = box('hi\n* ');
  bulletize(u);
  assert.equal(u.value, 'hi\n• ');
});

test('a dash mid-line is left alone', () => {
  const t = box('a - ');
  bulletize(t);
  assert.equal(t.value, 'a - ');
});

test('Shift+Enter continues a bullet list, and ends it on an empty bullet', () => {
  const t = box('• one');
  assert.equal(bulletEnter(t), true);
  assert.equal(t.value, '• one\n• ');
  assert.equal(bulletEnter(t), true);
  assert.equal(t.value, '• one\n');
  assert.equal(bulletEnter(box('plain')), false);
});
