/* Bullet lists in a plain textarea. Each takes the textarea (or anything with value/selectionStart/selectionEnd). */
// Typing "- " or "* " at the start of a line turns it into a bullet, like Claude's own chat box.
export const bulletize = t => {
  const i = t.selectionStart;
  const start = t.value.lastIndexOf('\n', i - 1) + 1;
  if (i - start !== 2 || !/^[-*] $/.test(t.value.slice(start, i))) return;
  t.value = t.value.slice(0, start) + '• ' + t.value.slice(i);
  t.selectionStart = t.selectionEnd = i;
};
// Shift+Enter on a bullet line starts the next bullet; on an empty bullet it ends the list.
export const bulletEnter = t => {
  const i = t.selectionStart;
  const start = t.value.lastIndexOf('\n', i - 1) + 1;
  const line = t.value.slice(start, i);
  if (!line.startsWith('• ')) return false;
  const empty = line === '• ';
  const ins = empty ? '' : '\n• ';
  const from = empty ? start : i;
  t.value = t.value.slice(0, from) + ins + t.value.slice(t.selectionEnd);
  t.selectionStart = t.selectionEnd = from + ins.length;
  return true;
};
