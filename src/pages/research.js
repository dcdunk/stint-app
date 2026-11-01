/* ---------- RESEARCH: competitor comparisons. Home, matrix, gaps and write-up. ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { FINDINGS, ME, cellOf, gapsOf, hostOf, isOld, progress, writeupStale } from '../core/research.js';
import { claudePicks, hasClaude, md } from '../features/claude.js';

const rival = id => D().competitors.find(c => c.id === id);
const prodName = pid => (pid === ME ? 'Your product' : rival(pid)?.name || 'Removed');
export const comparison = id => D().comparisons.find(c => c.id === id);
const runOf = c => (S.ui.research?.busy && S.ui.research.id === c.id ? S.ui.research : null);
const link = url => `<button class="r-link" data-a="rOpen" data-url="${esc(url)}">${esc(hostOf(url))}${ic('external-link', 11)}</button>`;

const picks = () => (hasClaude ? `<div class="cl-opts">${claudePicks()}</div>` : '');

/* ---------- home: one prompt is the way in ---------- */
const EXAMPLES = [
  'Compare Linear, Jira and Asana on enterprise readiness',
  'How do Notion and Coda handle onboarding?',
  'Which of Figma and Sketch has the better developer handoff?',
];
export function pageResearch() {
  const d = D();
  const dr = (S.ui.rDraft ||= { ask: '' });
  return `<div class="page r-home">
    <form class="r-hero" data-submit="rCreate">
      <h1><label for="r-start">What do you want to compare?</label></h1>
      <p class="muted">Tell Claude who and what. It plans the work, reads their public pages and fills in a sheet with a source for every answer.</p>
      <div class="r-box">
        <textarea id="r-start" rows="3" data-in="rDraft" data-f="ask" placeholder="Compare Linear and Jira on enterprise readiness">${esc(dr.ask)}</textarea>
        <div class="row">${picks()}<span class="sp"></span><button class="btn btn-primary" type="submit">${hasClaude ? 'Start' : 'Create sheet'}${ic('arrow-right', 14)}</button></div>
      </div>
      <div class="r-chips">${EXAMPLES.map(t => `<button type="button" class="r-chip" data-a="rExample" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      ${hasClaude ? '' : '<p class="muted r-c">Claude research needs the Mac app. Here you can fill a sheet in by hand.</p>'}
    </form>
    ${
      d.comparisons.length
        ? `<section class="r-sec"><h2>Your comparisons</h2><div class="panel r-list">${d.comparisons
            .map(c => {
              const p = progress(c);
              const g = gapsOf(c);
              return `<button class="r-row" data-a="rOpenCmp" data-id="${c.id}"><span class="grow trunc"><b>${esc(c.name)}</b><span class="muted">${esc(c.competitors.map(prodName).join(', ') || 'No competitors yet')}</span></span><span class="muted r-c">${p.filled} of ${p.total} cells</span><span class="r-c" ${g.behind.length ? 'style="color:var(--amber)"' : ''}>${g.behind.length} behind</span>${ic('chevron-right', 14)}</button>`;
            })
            .join('')}</div></section>`
        : ''
    }
    ${
      d.competitors.length
        ? `<section class="r-sec"><h2>Competitors</h2><p class="muted r-c">Claude adds these as you go and reuses them. Your notes here guide its research.</p><div class="r-cards">${d.competitors
            .map(
              c => `<article class="panel r-card">
              <div class="row"><b class="grow trunc">${esc(c.name)}</b><button class="ibtn ibtn-xs" data-a="rDelCompetitor" data-id="${c.id}" aria-label="Remove ${esc(c.name)}" data-tip="Remove">${ic('x', 13)}</button></div>
              ${c.site ? link(c.site) : '<span class="muted">No website</span>'}
              <label class="sr" for="rn-${c.id}">Notes on ${esc(c.name)}</label>
              <textarea class="textarea" id="rn-${c.id}" rows="2" data-in="rCompNote" data-id="${c.id}" placeholder="Your notes">${esc(c.note || '')}</textarea>
            </article>`,
            )
            .join('')}</div></section>`
        : ''
    }
  </div>`;
}

/* ---------- one comparison: the conversation on the left, the sheet on the right ---------- */
export function pageComparison() {
  const c = comparison(S.ui.params.id);
  if (!c) return pageResearch();
  const tab = S.ui.params.tab || 'matrix';
  const seg = (t, label) => `<button class="${tab === t ? 'on' : ''}" data-a="rTab" data-id="${c.id}" data-tab="${t}">${label}</button>`;
  const body = tab === 'gaps' ? gapsView(c) : tab === 'writeup' ? writeupView(c) : matrixView(c);
  return `<div class="r-page">
    ${threadView(c, tab)}
    <section class="r-sheet" aria-label="Sheet">
      <div class="row r-tabs"><b class="trunc r-title">${esc(c.name)}</b><div class="seg">${seg('matrix', 'Matrix')}${seg('gaps', 'Gaps')}${seg('writeup', 'Write-up')}</div><span class="sp"></span>${statusLine(c)}<button class="ibtn" data-a="rDelCmp" data-id="${c.id}" aria-label="Delete comparison" data-tip="Delete comparison">${ic('trash-2', 15)}</button></div>
      <div class="r-body" data-keep="r-body">${body}</div>
      ${tab === 'matrix' && S.ui.rCell ? cellPanel(c) : ''}
    </section>
  </div>`;
}

const STEP_ICON = { done: 'circle-check', active: 'loader-circle', todo: 'circle' };
function planCard(c) {
  const steps = c.plan || [];
  if (!steps.length) return '';
  const p = progress(c);
  const running = !!runOf(c);
  return `<div class="panel r-plan">
    <div class="r-plan-h"><b>Plan</b><span class="muted r-c">${p.total ? `${p.filled} of ${p.total} cells` : ''}</span></div>
    ${p.total ? `<div class="r-bar"><i style="width:${Math.round((p.filled / p.total) * 100)}%"></i></div>` : ''}
    <ol>${steps.map(st => `<li class="r-step ${st.status}">${ic(STEP_ICON[st.status] || 'circle', 14)}<span>${esc(st.text)}</span></li>`).join('')}</ol>
    ${running ? `<div class="r-live">${ic('loader-circle', 13)}${esc(S.ui.research.activity)}</div>` : ''}
  </div>`;
}
const msgHtml = m =>
  m.role === 'user'
    ? `<div class="r-msg me">${esc(m.text)}</div>`
    : m.role === 'err'
      ? `<div class="r-msg err">${ic('circle-alert', 14)}<span>${esc(m.text)}</span></div>`
      : `<div class="r-msg ai">${md(m.text)}</div>`;
/* The plan sits under your latest message, above Claude's answer to it. */
function threadHtml(c) {
  const t = c.thread || [];
  const cut = t.findLastIndex(m => m.role === 'user') + 1;
  return t.slice(0, cut).map(msgHtml).join('') + planCard(c) + t.slice(cut).map(msgHtml).join('');
}
function threadView(c, tab) {
  const running = !!runOf(c);
  const p = progress(c);
  const old = c.features.some(f => c.competitors.some(id => isOld(cellOf(c, f.id, id))));
  const say = t => `<button type="button" class="r-chip" data-a="rSay" data-id="${c.id}" data-t="${esc(t)}">${esc(t)}</button>`;
  const chips = running
    ? []
    : [
        c.competitors.length && !c.features.length ? say('Suggest features to compare') : '',
        p.filled < p.total ? say('Fill in the empty cells') : '',
        c.features.length && tab === 'writeup' && c.competitors.some(id => !c.writeups[id]) ? say('Write side-by-side notes') : '',
        old ? say('Re-check the old cells') : '',
      ].filter(Boolean);
  return `<section class="r-thread" aria-label="Conversation with Claude">
    <div class="r-log" id="r-log" data-keep="r-log" aria-live="polite">
      ${threadHtml(c)}
      ${running && !(c.plan || []).length ? `<div class="r-live">${ic('loader-circle', 13)}${esc(S.ui.research.activity)}</div>` : ''}
      ${(c.thread || []).length ? '' : `<div class="r-hint muted">${hasClaude ? 'Tell Claude who to compare and what you want to learn. It will build the sheet on the right.' : 'Claude research needs the Mac app. You can fill in the sheet by hand.'}</div>`}
    </div>
    <form class="r-ask" data-submit="rSend" data-id="${c.id}">
      ${chips.length ? `<div class="r-chips">${chips.join('')}</div>` : ''}
      <div class="r-box">
        <label class="sr" for="r-ask">Message Claude</label>
        <textarea id="r-ask" rows="2" data-in="rAskDraft" placeholder="${running ? 'Claude is working…' : 'Ask Claude to compare, dig deeper or change the sheet'}">${esc(S.ui.rAsk || '')}</textarea>
        <div class="row">${picks()}<span class="sp"></span>${running ? `<button type="button" class="btn btn-secondary btn-sm" data-a="rStop">${ic('square', 12)}Stop</button>` : `<button type="submit" class="btn btn-primary btn-sm" aria-label="Send">${ic('arrow-up', 14)}</button>`}</div>
      </div>
    </form>
  </section>`;
}

function statusLine(c) {
  const p = progress(c);
  const un = Object.values(c.cells).filter(x => !x.reviewed).length;
  if (!p.total) return '';
  return `<span class="muted r-c">${p.filled} of ${p.total} cells${un ? ` · ${un} not reviewed` : ''}</span>`;
}

/* ---------- matrix ---------- */
function cellHtml(c, f, pid) {
  const cell = cellOf(c, f.id, pid);
  const on = S.ui.rCell?.f === f.id && S.ui.rCell?.p === pid;
  const running = runOf(c) && pid !== ME && !cell;
  const st = cell && FINDINGS[cell.s];
  const label = `${prodName(pid)}, ${f.name}: ${st ? st.label : 'empty'}`;
  const inner = st
    ? `<span class="r-st" style="color:${st.color}">${ic(st.icon, 13)}${st.label}${cell.reviewed ? '' : '<i class="r-unrev" title="Not reviewed yet"></i>'}${isOld(cell) ? `<span class="r-old" title="Checked over 90 days ago">${ic('clock', 11)}</span>` : ''}</span><span class="r-note">${esc(cell.note)}</span>`
    : running
      ? '<span class="r-wait"></span>'
      : `<span class="r-empty">${pid === ME ? 'Add yours' : '—'}</span>`;
  return `<td><button class="r-cell ${on ? 'on' : ''}" data-a="rCell" data-f="${f.id}" data-p="${pid}" aria-label="${esc(label)}">${inner}</button></td>`;
}

function matrixView(c) {
  const cols = [ME, ...c.competitors];
  const head = cols
    .map(
      p =>
        `<th scope="col"><div class="row"><span class="grow trunc">${esc(prodName(p))}</span>${p === ME ? '' : `<button class="ibtn ibtn-xs r-x" data-a="rDropCol" data-id="${c.id}" data-p="${p}" aria-label="Remove ${esc(prodName(p))} from this comparison">${ic('x', 12)}</button>`}</div>${p === ME ? '' : rival(p)?.site ? `<span class="muted r-sub">${esc(hostOf(rival(p).site))}</span>` : ''}</th>`,
    )
    .join('');
  const rows = c.features
    .map(
      f =>
        `<tr><th scope="row"><div class="row"><span class="grow">${esc(f.name)}</span><button class="ibtn ibtn-xs r-x" data-a="rDropFeature" data-id="${c.id}" data-f="${f.id}" aria-label="Remove ${esc(f.name)}">${ic('x', 12)}</button></div></th>${cols.map(p => cellHtml(c, f, p)).join('')}</tr>`,
    )
    .join('');
  return `<div class="r-main">
      <div class="panel r-scroll"><table class="r-t" style="min-width:${190 + cols.length * 150}px"><thead><tr><th scope="col">Feature</th>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${cols.length + 1}" class="muted r-none">${c.competitors.length ? 'No features yet.' : 'Nothing here yet.'} ${hasClaude ? 'The sheet fills in here as Claude works.' : 'Add features and competitors below.'}</td></tr>`}</tbody></table></div>
      <div class="row r-foot">
        <form class="row" data-submit="rAddFeature" data-id="${c.id}"><label class="sr" for="r-feat">New feature</label><input class="input" id="r-feat" data-in="rFeatDraft" value="${esc(S.ui.rFeat || '')}" placeholder="Add a feature"><button class="btn btn-secondary" type="submit">Add</button></form>
        <form class="row" data-submit="rAddCol" data-id="${c.id}"><label class="sr" for="r-col">New competitor</label><input class="input" id="r-col" data-in="rColDraft" value="${esc(S.ui.rCol || '')}" placeholder="Add a competitor"><button class="btn btn-secondary" type="submit">Add</button></form>
        <span class="sp"></span>
        <span class="r-legend">${Object.values(FINDINGS)
          .map(s => `<span style="color:${s.color}">${ic(s.icon, 12)}<span class="muted">${s.label}</span></span>`)
          .join('')}<span><i class="r-unrev"></i><span class="muted">Not reviewed</span></span></span>
      </div>
    </div>`;
}

function cellPanel(c) {
  const { f: fid, p: pid } = S.ui.rCell;
  const f = c.features.find(x => x.id === fid);
  if (!f) return '';
  const cell = cellOf(c, fid, pid);
  return `<aside class="panel r-side" aria-label="Evidence">
    <div class="row"><span class="grow muted trunc">${esc(prodName(pid))} · ${esc(f.name)}</span><button class="ibtn ibtn-xs" data-a="rCellClose" aria-label="Close">${ic('x', 13)}</button></div>
    <div class="r-pick" role="group" aria-label="Status">${Object.entries(FINDINGS)
      .map(
        ([k, s]) =>
          `<button class="${cell?.s === k ? 'on' : ''}" aria-pressed="${cell?.s === k}" data-a="rSetStatus" data-id="${c.id}" data-s="${k}"><span style="color:${s.color}">${ic(s.icon, 13)}</span>${s.label}</button>`,
      )
      .join('')}</div>
    <label class="label" for="r-note">Note</label>
    <input class="input" id="r-note" data-in="rCellField" data-id="${c.id}" data-k="note" value="${esc(cell?.note || '')}" placeholder="A few words">
    <label class="label" for="r-src">Source</label>
    <input class="input" id="r-src" data-blur="rCellSrc" data-id="${c.id}" value="${esc(cell?.src || '')}" placeholder="${pid === ME ? 'Optional' : 'Web address'}">
    ${cell?.src ? link(cell.src) : ''}
    ${cell?.quote ? `<blockquote class="r-quote">${esc(cell.quote)}</blockquote>` : ''}
    ${cell?.prev ? `<div class="r-was">${ic('history', 12)}Used to say ${FINDINGS[cell.prev].label}</div>` : ''}
    ${
      cell
        ? `<div class="muted r-meta">${cell.by === 'claude' ? 'Claude' : 'You'} · ${ago(cell.at)}${isOld(cell) ? ' · due a re-check' : ''}</div>
    <div class="row">${cell.reviewed ? `<span class="r-ok">${ic('check', 13)}Reviewed</span>` : `<button class="btn btn-primary btn-sm" data-a="rReview" data-id="${c.id}">Looks right</button>`}<span class="sp"></span><button class="btn btn-ghost btn-sm" data-a="rClearCell" data-id="${c.id}">Clear</button></div>`
        : ''
    }
  </aside>`;
}

/* ---------- gaps ---------- */
function gapCard(c, e) {
  const sources = e.others.filter(o => o.cell.src).length;
  return `<article class="panel r-gap">
    <b>${esc(e.feature.name)}</b>
    <div class="r-who"><div><span class="muted">Your product</span><span>${FINDINGS[cellOf(c, e.feature.id, ME).s].label}</span></div>
    ${e.others.map(o => `<div><span class="muted trunc">${esc(prodName(o.pid))}</span><span class="trunc">${esc(FINDINGS[o.cell.s].label)}${o.cell.note ? ' · ' + esc(o.cell.note) : ''}</span></div>`).join('')}</div>
    <div class="row"><button class="btn btn-secondary btn-sm" data-a="rGapTask" data-id="${c.id}" data-f="${e.feature.id}">Create task</button><span class="sp"></span><span class="muted r-c">${sources} source${sources === 1 ? '' : 's'}${e.unreviewed ? ' · not all reviewed' : ''}</span></div>
  </article>`;
}
function gapsView(c) {
  const g = gapsOf(c);
  const col = (title, sub, items) =>
    `<section class="r-gapcol"><h2>${title} <span class="muted">${items.length}</span></h2><p class="muted">${sub}</p>${items.map(e => gapCard(c, e)).join('') || '<div class="r-none muted">Nothing here yet.</div>'}</section>`;
  return `${g.unchecked.length ? `<p class="muted r-unch">${g.unchecked.length} feature${g.unchecked.length === 1 ? '' : 's'} left out until your column and at least one competitor are filled: ${esc(g.unchecked.map(u => u.feature.name).join(', '))}.</p>` : ''}
  <div class="r-gaps">
    ${col('You’re behind', 'A competitor fully has it. You don’t.', g.behind)}
    ${col('Your advantage', 'You fully have it. No competitor does.', g.advantage)}
    ${col('Nobody does it well', 'Partial or missing for everyone checked. Possible openings.', g.open)}
  </div>`;
}

/* ---------- write-up ---------- */
function writeupView(c) {
  const col = pid => {
    const w = c.writeups[pid];
    const editing = S.ui.rEditW === pid;
    return `<article class="panel r-w">
      <div class="row"><b class="grow trunc">${esc(prodName(pid))}</b><button class="btn btn-ghost btn-sm" data-a="rEditWriteup" data-p="${pid}">${editing ? 'Done' : 'Edit'}</button></div>
      ${
        editing
          ? `<label class="sr" for="r-wtext">Notes on ${esc(prodName(pid))}</label><textarea class="textarea" id="r-wtext" rows="14" data-in="rWriteup" data-id="${c.id}" data-p="${pid}">${esc(w?.text || '')}</textarea>`
          : w?.text
            ? `<div class="r-md">${md(w.text)}</div>`
            : `<p class="muted">${pid === ME ? 'Your own notes on how your product handles this.' : 'Nothing written yet.'}</p>`
      }
      ${w?.sources?.length ? `<div class="r-srcs">${w.sources.map(link).join('')}</div>` : ''}
      ${w ? `<div class="muted r-meta">${w.by === 'claude' ? 'Claude' : 'You'} · ${ago(w.at)}${writeupStale(c, pid) ? ' · findings changed since this was written' : ''}</div>` : ''}
    </article>`;
  };
  return `<div class="r-wgrid">${[ME, ...c.competitors].map(col).join('')}</div>`;
}
