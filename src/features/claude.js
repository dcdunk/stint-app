/* ---------- CLAUDE CHAT (Mac app only) ----------
   A floating button and chat panel. It lives in its own #claude container outside
   #app, so the full-shell render() never wipes the draft or a reply mid-stream;
   render() only calls syncClaude() to show or hide it. Actions are in actions/claude.js. */
import { $, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';

export const hasClaude = !!window.__TAURI_INTERNALS__;

export const claudeState = () => (S.ui.claude ||= { open: false, msgs: [], busy: false, session: null });

/* Tool names Claude calls, as shown in the chat. */
const TOOL_LABEL = {
  get_workspace: 'Read the workspace',
  list_tasks: 'Looked up tasks',
  get_task: 'Opened a task',
  create_task: 'Created a task',
  update_task: 'Updated a task',
  add_comment: 'Added a comment',
  create_project: 'Created a project',
  update_project: 'Updated a project',
  show: 'Changed the view',
};

/* Just enough markdown for chat replies: code, bold, italics, links-as-text, bullets. */
function md(s) {
  const inline = t =>
    esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const out = [];
  let list = null,
    rows = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    if (rows)
      out.push(
        `<div class="cl-table"><table>${rows.map((r, i) => `<tr>${r.map(c => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</table></div>`,
      );
    list = rows = null;
  };
  for (const line of s.split('\n')) {
    const li = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    const tr = line.trim().startsWith('|') && line.trim().endsWith('|');
    if (!li) list && flush();
    if (!tr) rows && flush();
    if (li) (list ||= []).push(`<li>${inline(li[1])}</li>`);
    else if (tr) {
      const cells = line.trim().slice(1, -1).split('|');
      // Skip the |---|---| separator row.
      if (!cells.every(c => /^\s*:?-+:?\s*$/.test(c))) (rows ||= []).push(cells.map(c => inline(c.trim())));
    } else {
      const h = line.match(/^#{1,6}\s+(.*)$/);
      if (h) out.push(`<p><b>${inline(h[1])}</b></p>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return out.join('');
}

function msgHtml(m) {
  if (m.role === 'user') return `<div class="cl-msg cl-user">${esc(m.text)}</div>`;
  if (m.role === 'tool') return `<div class="cl-tool">${ic('check', 12)}${esc(TOOL_LABEL[m.name] || m.name.replace(/_/g, ' '))}</div>`;
  if (m.role === 'error') return `<div class="cl-msg cl-err">${ic('circle-alert', 14)}<span>${md(m.text)}</span></div>`;
  return m.text.trim() ? `<div class="cl-msg cl-ai">${md(m.text)}</div>` : '';
}

function logHtml(c) {
  if (!c.msgs.length)
    return `<div class="cl-empty">${ic('sparkles', 22)}<b>Ask Claude</b><span>Claude can look things up and make changes for you, like “add a task to Website Redesign to review copy, due Friday” or “what's overdue for me?”</span></div>`;
  const last = c.msgs.at(-1);
  const thinking = c.busy && !(last.role === 'assistant' && last.text.trim());
  return c.msgs.map(msgHtml).join('') + (thinking ? `<div class="cl-thinking"><i></i><i></i><i></i></div>` : '');
}

function mount() {
  const root = document.createElement('div');
  root.id = 'claude';
  root.innerHTML = `<button class="cl-fab" data-a="claudeToggle" aria-label="Ask Claude" data-tip="Ask Claude">${ic('sparkles', 20)}</button>
    <section class="cl-panel" role="dialog" aria-label="Claude">
      <header class="cl-h">${ic('sparkles', 15)}<b>Claude</b><span class="sp"></span><button class="ibtn ibtn-sm" data-a="claudeNew" data-tip="New chat" aria-label="New chat">${ic('square-pen', 15)}</button><button class="ibtn ibtn-sm" data-a="claudeToggle" aria-label="Close chat">${ic('x', 15)}</button></header>
      <div class="cl-log" id="claude-log" aria-live="polite"></div>
      <form class="cl-f" data-submit="claudeSend"><textarea id="claude-in" rows="1" placeholder="Ask Claude to do something…" aria-label="Message Claude"></textarea><button class="cl-send" id="claude-go" aria-label="Send">${ic('arrow-up', 15)}</button></form>
    </section>`;
  document.body.appendChild(root);
  document.documentElement.classList.add('has-claude');
  return root;
}

/* Cheap enough to run on every app render: only toggles visibility. */
export function syncClaude() {
  if (!hasClaude) return;
  const root = $('#claude') || (renderClaude(), $('#claude'));
  root.hidden = !!S.ui.auth;
}

export function renderClaude() {
  if (!hasClaude) return;
  const c = claudeState();
  const root = $('#claude') || mount();
  root.classList.toggle('open', c.open);
  root.querySelector('.cl-fab').setAttribute('aria-expanded', c.open);
  const log = $('#claude-log');
  const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = logHtml(c);
  if (pinned) log.scrollTop = log.scrollHeight;
  const go = $('#claude-go');
  go.innerHTML = ic(c.busy ? 'square' : 'arrow-up', 15);
  go.setAttribute('aria-label', c.busy ? 'Stop' : 'Send');
  // While busy the button stops the run; otherwise it's a plain submit for the form.
  if (c.busy) go.dataset.a = 'claudeStop';
  else go.removeAttribute('data-a');
}
