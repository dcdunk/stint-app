/* ---------------- AUTH ---------------- */
import { esc } from '../core/utils.js';
import { LOGO, ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { effectiveDark } from '../core/theme.js';
import { TEMPLATES } from '../overlays/modals.js';

export function authShell(inner, topRight = '') {
  return `<div class="auth"><div class="auth-top"><span class="brand">${LOGO(22)}</span><div class="row">${topRight}<button class="ibtn" data-a="toggleDark" data-tip="Toggle theme" aria-label="Toggle theme">${ic(effectiveDark() ? 'sun' : 'moon', 16)}</button></div></div>
    <div class="auth-c">${inner}</div>
    <div class="auth-foot" style="padding:18px;font-size:12px" ><span class="faint">© 2026 Stint</span></div></div>`;
}
export function renderAuth() {
  return renderOnboarding();
}

/* ---------------- ONBOARDING ---------------- */
export function renderOnboarding() {
  const st = S.ui.onb;
  const o = S.ui.onbData;
  const N = 6;
  const nav = (next = 'Continue', skip = false) =>
    `<div class="row" style="margin-top:6px">${st > 0 && st < 5 ? `<button class="btn btn-ghost" data-a="onbBack">${ic('arrow-left', 14)}Back</button>` : ''}<span class="sp"></span>${skip ? `<button class="btn btn-ghost" data-a="onbNext" data-skip="1">Skip for now</button>` : ''}<button class="btn btn-primary btn-lg" data-a="onbNext" id="onb-next">${next}${ic('arrow-right', 15)}</button></div>`;
  const opt = (k, v, icon, n, s) =>
    `<button class="opt ${o[k] === v ? 'on' : ''}" role="radio" aria-checked="${o[k] === v}" data-a="onbSet" data-k="${k}" data-v="${v}">${ic(icon, 18)}<b>${n}</b>${s ? `<span>${s}</span>` : ''}</button>`;
  let body;
  if (st === 0)
    body = `<h1>What are you working on?</h1><p class="sub">We'll tailor templates and views to fit. You can change this later.</p><div class="opts" role="radiogroup">${[
      ['product', 'target', 'Product', 'Roadmaps & launches'],
      ['design', 'palette', 'Design', 'Reviews & handoff'],
      ['marketing', 'megaphone', 'Marketing', 'Campaigns & content'],
      ['engineering', 'code', 'Engineering', 'Sprints & releases'],
      ['personal', 'user', 'Personal', 'Goals & side projects'],
      ['other', 'sparkles', 'Other', 'Something else'],
    ]
      .map(x => opt('use', ...x))
      .join('')}</div>${nav()}`;
  if (st === 1) {
    const e = S.ui.errors.ws;
    const en = S.ui.errors.name;
    body = `<h1>Create your workspace</h1><p class="sub">A workspace is where your team's projects live.</p>
    ${o.fresh ? `<div class="field"><label class="label" for="o-name">Your name</label><input class="input input-lg ${en ? 'is-error' : ''}" id="o-name" data-in="onbName" value="${esc(o.name)}" autocomplete="name" autofocus>${en ? `<span class="err">${ic('circle-alert', 12)}${en}</span>` : ''}</div>` : ''}
    <div class="field"><label class="label" for="o-ws">Workspace name</label><input class="input input-lg ${e ? 'is-error' : ''}" id="o-ws" data-in="onbWs" value="${esc(o.ws)}" placeholder="e.g. Personal" ${o.fresh ? '' : 'autofocus'}>${e ? `<span class="err">${ic('circle-alert', 12)}${e}</span>` : ''}</div>
    <div class="field"><label class="label" for="o-url">Workspace URL</label><div class="row" style="gap:0"><span class="input input-lg" style="width:auto;background:var(--surface-2);border-right:0;border-radius:6px 0 0 6px;display:flex;align-items:center;color:var(--text-2)">stint.app/</span><input class="input input-lg" id="o-url" value="${esc(o.url || '')}" data-in="onbUrl" style="border-radius:0 6px 6px 0" placeholder="personal"></div>${o.url ? `<span class="hint" style="color:var(--green);display:flex;gap:4px;align-items:center">${ic('check', 12)}stint.app/${esc(o.url)} is available</span>` : ''}</div>${nav()}`;
  }
  if (st === 2)
    body = `<h1>How does your team work?</h1><p class="sub">We'll set your default project view.</p><div class="opts" role="radiogroup" style="grid-template-columns:repeat(2,minmax(0,1fr))">${[
      ['kanban', 'square-kanban', 'Boards', 'Move cards through stages'],
      ['list', 'list-checks', 'Lists', 'Checklists and priorities'],
      ['timeline', 'chart-gantt', 'Timelines', 'Plan with dates & dependencies'],
      ['table', 'table-2', 'Tables', 'Spreadsheet-style tracking'],
    ]
      .map(x => opt('team', ...x))
      .join('')}</div>
    <div class="field"><span class="label">Team size</span><div class="seg" style="width:fit-content">${['Just me', '2-10', '11-50', '51-200', '200+'].map(s => `<button class="${o.size === s ? 'on' : ''}" data-a="onbSet" data-k="size" data-v="${s}">${s}</button>`).join('')}</div></div>${nav()}`;
  if (st === 3)
    body = `<h1>Create your first project</h1><p class="sub">Start from a template or a blank project.</p><div class="field"><label class="label" for="o-proj">Project name</label><input class="input input-lg" id="o-proj" data-in="onbProj" value="${esc(o.proj)}" autofocus></div><div class="tmpls" role="radiogroup">${TEMPLATES.filter(
      t => t.id !== 'blank',
    )
      .map(t => opt('tmpl', t.id, t.icon, t.name, t.tasks.length + ' starter tasks'))
      .join('')}</div>${nav()}`;
  if (st === 4)
    body = `<h1>Invite your team</h1><p class="sub">Stint works best with your teammates. They'll get an email invite.</p><div class="col" style="gap:8px">${[0, 1, 2].map(i => `<input class="input input-lg" id="o-inv-${i}" placeholder="teammate@company.com" type="email" value="${esc((o.invites || '').split(',')[i] || '')}" data-in="onbInv" data-i="${i}" aria-label="Teammate email ${i + 1}">`).join('')}</div><button class="btn btn-ghost btn-sm" style="align-self:flex-start" data-a="copyInviteLink">${ic('link', 13)}Copy invite link instead</button>${nav('Send invites', true)}`;
  if (st === 5) {
    const n = (o.invites || '').split(',').filter(x => x.includes('@')).length;
    body = `<div style="display:flex;justify-content:center"><span class="ftype ready-badge" style="--c:var(--green);width:48px;height:48px;border-radius:12px">${ic('circle-check', 22)}</span></div><h1>Your workspace is ready</h1><p class="sub">Here's what we set up for you.</p>
    <div class="panel">${[
      ['building-2', `Workspace “${esc(o.ws || 'My Workspace')}”`, 'stint.app/' + esc(o.url || 'workspace')],
      [
        TEMPLATES.find(t => t.id === o.tmpl)?.icon || 'folder',
        `Project “${esc(o.proj)}”`,
        `${TEMPLATES.find(t => t.id === o.tmpl)?.tasks.length || 0} starter tasks · ${{ kanban: 'Board', list: 'List', timeline: 'Timeline', table: 'Table' }[o.team]} view`,
      ],
      [
        'user-plus',
        n ? `${n} invite${n > 1 ? 's' : ''} sent` : 'No invites yet',
        n ? "They'll appear in Members once they join" : 'Invite people any time from the sidebar',
      ],
    ]
      .map(
        ([i, t, s]) =>
          `<div class="row ready-row" style="padding:12px 14px;border-top:1px solid var(--divider);gap:12px"><span class="ftype" style="--c:var(--accent)">${ic(i, 14)}</span><div class="grow"><div style="font-weight:500">${t}</div><div class="faint" style="font-size:12px">${s}</div></div><span class="ok" style="color:var(--green);display:inline-flex">${ic('check', 15)}</span></div>`,
      )
      .join('')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="onbFinish">Open workspace${ic('arrow-right', 15)}</button>`;
  }
  return authShell(
    `<div class="auth-card onb${S.ui.fx.step ? ' fx-step' : ''}" style="max-width:${st === 5 ? 440 : 560}px">
    <div class="steps" aria-label="Step ${st + 1} of ${N}">${Array.from({ length: N }, (_, i) => `<i class="${i <= st ? 'on' : ''} ${i === st ? 'cur' : ''}"></i>`).join('')}</div>
    <div class="faint" style="text-align:center;font-size:12px">Step ${st + 1} of ${N}</div>
    ${body}</div>`,
    o.fresh ? '' : `<button class="btn btn-ghost btn-sm" data-a="onbExit">Exit setup</button>`,
  );
}
