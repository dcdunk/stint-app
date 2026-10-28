/* ---------- CLAUDE CHAT (Mac app only) ----------
   A floating button and chat panel. It lives in its own #claude container outside
   #app, so the full-shell render() never wipes the draft or a reply mid-stream;
   render() only calls syncClaude() to show or hide it. Actions are in actions/claude.js. */
import { $, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';

export const hasClaude = !!window.__TAURI_INTERNALS__;

export const claudeState = () => (S.ui.claude ||= { open: false, msgs: [], busy: false, session: null });

/* The Claude mark (Simple Icons, slug "claude"), drawn in currentColor. */
const CLAUDE_PATH =
  'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';
const logo = size => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${CLAUDE_PATH}"/></svg>`;

/* Tool names Claude calls, as shown in the chat. */
const TOOL_LABEL = {
  get_workspace: 'Read the workspace',
  list_tasks: 'Looked up tasks',
  get_task: 'Read a task',
  create_task: 'Created a task',
  update_task: 'Updated a task',
  add_comment: 'Added a comment',
  create_project: 'Created a project',
  update_project: 'Updated a project',
  show: 'Changed the view',
  delete_tasks: 'Deleted tasks',
  delete_project: 'Deleted a project',
  delete_comment: 'Deleted a comment',
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
  if (m.role === 'tool')
    return `<div class="cl-tool${m.name.startsWith('delete_') ? ' del' : ''}">${ic(m.name.startsWith('delete_') ? 'trash-2' : 'check', 12)}${esc(TOOL_LABEL[m.name] || m.name.replace(/_/g, ' '))}</div>`;
  if (m.role === 'error') return `<div class="cl-msg cl-err">${ic('circle-alert', 14)}<span>${md(m.text)}</span></div>`;
  return m.text.trim() ? `<div class="cl-msg cl-ai">${md(m.text)}</div>` : '';
}

function logHtml(c) {
  if (!c.msgs.length)
    return `<div class="cl-empty">${logo(26)}<b>Ask Claude</b><span>Claude can look things up and make changes for you, like “add a task to Website Redesign to review copy, due Friday” or “what's overdue for me?”</span></div>`;
  const last = c.msgs.at(-1);
  const thinking = c.busy && !(last.role === 'assistant' && last.text.trim());
  return c.msgs.map(msgHtml).join('') + (thinking ? `<div class="cl-thinking"><i></i><i></i><i></i></div>` : '');
}

/* Picker choices. The Mac app only accepts these (MODELS/EFFORTS in src-tauri/src/claude.rs). */
export const CLAUDE_MODELS = [
  ['claude-opus-5-5', 'Opus 5.5'],
  ['claude-sonnet-5-5', 'Sonnet 5.5'],
  ['claude-haiku-5-5', 'Haiku 5.5'],
];
export const CLAUDE_EFFORTS = [
  ['low', 'Low effort'],
  ['medium', 'Medium effort'],
  ['high', 'High effort'],
];
const picker = (list, cur, key, label) =>
  `<select class="select cl-pick" data-in="${key}" aria-label="${label}">${list.map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${n}</option>`).join('')}</select>`;

function mount() {
  const root = document.createElement('div');
  root.id = 'claude';
  root.innerHTML = `<button class="cl-fab" data-a="claudeToggle" aria-label="Ask Claude" data-tip="Ask Claude">${logo(22)}</button>
    <section class="cl-panel" role="dialog" aria-label="Claude">
      <header class="cl-h">${logo(16)}<b>Claude</b><span class="sp"></span><button class="ibtn ibtn-sm" data-a="claudeNew" data-tip="New chat" aria-label="New chat">${ic('square-pen', 15)}</button><button class="ibtn ibtn-sm" data-a="claudeToggle" aria-label="Close chat">${ic('x', 15)}</button></header>
      <div class="cl-log" id="claude-log" aria-live="polite"></div>
      <form class="cl-f" data-submit="claudeSend"><textarea id="claude-in" rows="1" placeholder="Ask Claude to do something…" aria-label="Message Claude"></textarea>
        <div class="cl-opts">${picker(CLAUDE_MODELS, S.prefs.claudeModel, 'claudeModel', 'Model')}${picker(CLAUDE_EFFORTS, S.prefs.claudeEffort, 'claudeEffort', 'Effort')}<span class="sp"></span><button class="cl-send" id="claude-go" aria-label="Send">${ic('arrow-up', 15)}</button></div></form>
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
