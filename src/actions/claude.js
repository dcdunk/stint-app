/* =====================================================================
   CLAUDE: chat actions and the tools Claude uses to work in Stint.
   The Mac app runs the user's `claude` CLI (src-tauri/src/claude.rs) with a
   local MCP server (src-tauri/src/mcp.rs) whose tools/list and tools/call are
   answered here, against the live store, so changes show up immediately.
   ===================================================================== */
import { $, TODAY, WDL, fmtQuarter, iso, uid } from '../core/utils.js';
import { bulletEnter, bulletize } from '../core/bullets.js';
import { LB, PR, PSTAT, ST } from '../core/constants.js';
import { D, S, canSee, commentsOf, isOver, logAct, me, mem, proj, save, task, tasksOf, teamsList, visibleProjects } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { ROUTE_NAMES, go, render } from '../shell/render.js';
import { claudeState, hasClaude, renderClaude } from '../features/claude.js';
import { A, IN, applyPatch, createProject, createTask, deleteProject, deleteTasks, restore, snapshot } from './actions.js';

/* ---------- lookups: Claude may pass an id, a key or a name ---------- */
const low = s =>
  String(s ?? '')
    .trim()
    .toLowerCase();
function pick(list, ref, what, fields) {
  const q = low(ref);
  const hit = list.filter(x => fields.some(f => low(x[f]) === q));
  if (hit.length === 1) return hit[0];
  const part = hit.length ? hit : list.filter(x => fields.some(f => low(x[f]).includes(q)));
  if (part.length === 1) return part[0];
  throw new Error(part.length ? `“${ref}” matches more than one ${what}: ${part.map(x => x.name || x.title).join(', ')}` : `No ${what} matches “${ref}”`);
}
const findProject = ref => pick(visibleProjects(), ref, 'project', ['id', 'key', 'name']);
const findMember = ref => (low(ref) === 'me' ? me() : pick(D().members, ref, 'member', ['id', 'name', 'email']));
function findTask(ref) {
  const q = low(ref);
  const t = D().tasks.find(x => !x.archived && (low(x.id) === q || low(x.key) === q));
  if (!t || !canSee(proj(t.project))) throw new Error(`No task with id or key “${ref}”`);
  return t;
}
function oneOf(v, map, what) {
  if (!(v in map)) throw new Error(`Unknown ${what} “${v}”. Use one of: ${Object.keys(map).join(', ')}`);
  return v;
}
const date = (v, what) => {
  if (v === null || v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${what} must be YYYY-MM-DD`);
  return v;
};
const quarter = v => {
  if (v === null || v === '') return null;
  if (!/^\d{4}-Q[1-4]$/.test(v)) throw new Error('quarter must look like 2026-Q4');
  return v;
};
function write(fn) {
  let out;
  if (!mutate(() => (out = fn()))) throw new Error("Stint is offline, so the change wasn't saved.");
  return out;
}
/* Deletes get the same Undo toast as deleting by hand. */
function remove(msg, fn) {
  const snap = snapshot();
  write(fn);
  toast(msg, { action: 'Undo', onAction: () => restore(snap) });
}

/* ---------- what Claude sees ---------- */
// Profiles can have a blank name (setup skipped), so fall back rather than look unassigned.
const who = id => {
  const m = mem(id);
  return m ? m.name || m.email || m.id : null;
};
const taskOut = t => ({
  id: t.id,
  key: t.key,
  title: t.title,
  project: proj(t.project)?.name,
  status: t.status,
  priority: t.priority,
  assignee: who(t.assignee),
  due: t.due,
  start: t.start,
  labels: t.labels,
  subtasks: t.subtasks.length ? `${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} done` : undefined,
});
const projOut = p => ({
  id: p.id,
  key: p.key,
  name: p.name,
  status: p.status,
  quarter: p.quarter || null,
  lead: who(p.lead),
  start: p.start,
  due: p.due,
  open_tasks: tasksOf(p.id).filter(t => t.status !== 'done').length,
});
function where() {
  const { route, params } = S.ui;
  const parts = [ROUTE_NAMES[route] || route];
  if (route === 'project' && proj(params.id)) parts[0] = `project “${proj(params.id).name}” (${params.tab} tab)`;
  if (S.ui.drawer && task(S.ui.drawer)) parts.push(`with task ${task(S.ui.drawer).key} “${task(S.ui.drawer).title}” open`);
  return parts.join(' ');
}

/* ---------- tools ---------- */
const str = description => ({ type: 'string', description });
const enumOf = (map, description) => ({ type: 'string', enum: Object.keys(map), description });
const nullable = s => ({ ...s, type: ['string', 'null'] });
const TASK_FIELDS = {
  title: str('Task title'),
  description: str('Task description (plain text)'),
  status: enumOf(ST, 'Workflow status'),
  priority: enumOf(PR, 'Priority'),
  assignee: nullable(str('Member id, name or email, or "me"; null to unassign')),
  due: nullable(str('Due date, YYYY-MM-DD; null to clear')),
  start: nullable(str('Start date, YYYY-MM-DD; null to clear')),
  labels: { type: 'array', items: { type: 'string', enum: Object.keys(LB) }, description: 'Replaces the labels' },
};
function taskPatch(a) {
  const p = {};
  if (a.title != null) p.title = String(a.title).trim() || 'Untitled';
  if (a.description != null) p.desc = a.description;
  if (a.status != null) p.status = oneOf(a.status, ST, 'status');
  if (a.priority != null) p.priority = oneOf(a.priority, PR, 'priority');
  if ('assignee' in a) p.assignee = a.assignee ? findMember(a.assignee).id : null;
  if ('due' in a) p.due = date(a.due, 'due');
  if ('start' in a) p.start = date(a.start, 'start');
  if (a.labels) p.labels = a.labels.map(l => oneOf(l, LB, 'label'));
  return p;
}

export const TOOLS = [
  {
    name: 'get_workspace',
    description:
      'Overview of the workspace: who the user is, members, teams, projects, the allowed status/priority/label values, and what the user is looking at right now. Call this first when you need ids.',
    inputSchema: { type: 'object', properties: {} },
    run: () => ({
      today: iso(TODAY),
      me: { id: me().id, name: me().name },
      viewing: where(),
      members: D().members.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
      teams: teamsList().map(t => ({ id: t.id, name: t.name })),
      projects: visibleProjects().map(projOut),
      task_statuses: Object.keys(ST),
      priorities: Object.keys(PR),
      labels: Object.keys(LB),
      project_statuses: Object.keys(PSTAT),
    }),
  },
  {
    name: 'list_tasks',
    description: 'Find tasks. All filters are optional and combine. Done tasks are left out unless you ask for status "done" or include_done.',
    inputSchema: {
      type: 'object',
      properties: {
        project: str('Project id, key or name'),
        assignee: str('Member id, name or email, or "me"'),
        status: enumOf(ST, 'Only this status'),
        overdue: { type: 'boolean', description: 'Only tasks past their due date' },
        due_before: str('Only tasks due on or before this date, YYYY-MM-DD'),
        query: str('Text to match in the title or key'),
        include_done: { type: 'boolean' },
        limit: { type: 'number', description: 'Default 50' },
      },
    },
    run: a => {
      // Resolve names up front so a bad one is an error, not an empty list.
      const pid = a.project && findProject(a.project).id;
      const mid = a.assignee && findMember(a.assignee).id;
      let ts = D().tasks.filter(t => !t.archived && canSee(proj(t.project)));
      if (pid) ts = ts.filter(t => t.project === pid);
      if (mid) ts = ts.filter(t => t.assignee === mid);
      if (a.status) ts = ts.filter(t => t.status === a.status);
      else if (!a.include_done) ts = ts.filter(t => t.status !== 'done');
      if (a.overdue) ts = ts.filter(isOver);
      if (a.due_before) ts = ts.filter(t => t.due && t.due <= a.due_before);
      if (a.query) ts = ts.filter(t => low(t.title).includes(low(a.query)) || low(t.key) === low(a.query));
      return { total: ts.length, tasks: ts.slice(0, a.limit || 50).map(taskOut) };
    },
  },
  {
    name: 'get_task',
    description: 'Everything about one task: description, subtasks and recent comments.',
    inputSchema: { type: 'object', properties: { task: str('Task id or key, e.g. WEB-214') }, required: ['task'] },
    run: a => {
      const t = findTask(a.task);
      return {
        ...taskOut(t),
        description: t.desc,
        subtasks: t.subtasks.map(s => ({ title: s.title, done: s.done, due: s.due || null })),
        comments: commentsOf(t.id)
          .slice(-20)
          .map(c => ({ id: c.id, by: who(c.by), at: new Date(c.at).toISOString(), text: c.text })),
      };
    },
  },
  {
    name: 'create_task',
    description: 'Create a task in a project.',
    inputSchema: { type: 'object', properties: { project: str('Project id, key or name'), ...TASK_FIELDS }, required: ['project', 'title'] },
    run: a => {
      const p = findProject(a.project);
      const patch = taskPatch(a);
      return taskOut(write(() => createTask({ ...patch, project: p.id })));
    },
  },
  {
    name: 'update_task',
    description: 'Change a task. Only the fields you pass change. Set status "done" to complete it.',
    inputSchema: {
      type: 'object',
      properties: { task: str('Task id or key'), project: str('Move to this project (id, key or name)'), ...TASK_FIELDS },
      required: ['task'],
    },
    run: a => {
      const t = findTask(a.task);
      const patch = taskPatch(a);
      if (a.project) patch.project = findProject(a.project).id;
      write(() => applyPatch(t, patch));
      return taskOut(t);
    },
  },
  {
    name: 'add_comment',
    description: 'Post a comment on a task as the user.',
    inputSchema: { type: 'object', properties: { task: str('Task id or key'), text: str('Comment text') }, required: ['task', 'text'] },
    run: a => {
      const t = findTask(a.task);
      write(() => {
        D().comments.push({ id: uid('c'), task: t.id, by: D().me, at: Date.now(), text: a.text, re: {} });
        logAct('commented on', t);
      });
      return { ok: true, task: t.key };
    },
  },
  {
    name: 'create_project',
    description: 'Create a new, empty project.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Project name'),
        description: str('What the project is about'),
        lead: str('Member id, name or email, or "me" (default)'),
        team: str('Team id or name'),
        due: str('Due date, YYYY-MM-DD (default 30 days out)'),
        quarter: str('Target quarter, e.g. 2026-Q4'),
        status: enumOf(PSTAT, 'Default planning'),
      },
      required: ['name'],
    },
    run: a => {
      const lead = a.lead ? findMember(a.lead) : me();
      const team = a.team ? pick(teamsList(), a.team, 'team', ['id', 'name']).id : me().team;
      const q = quarter(a.quarter ?? null);
      const status = a.status ? oneOf(a.status, PSTAT, 'project status') : 'planning';
      const due = a.due ? date(a.due, 'due') : undefined;
      const p = write(() => {
        const p = createProject({ name: String(a.name).trim(), desc: a.description, icon: 'folder', color: 'indigo', team, lead: lead.id, due }, 'blank');
        Object.assign(p, { quarter: q, status });
        return p;
      });
      return projOut(p);
    },
  },
  {
    name: 'update_project',
    description: 'Change a project. Only the fields you pass change.',
    inputSchema: {
      type: 'object',
      properties: {
        project: str('Project id, key or name'),
        name: str('New name'),
        description: str('New description'),
        status: enumOf(PSTAT, 'Project status'),
        quarter: nullable(str('Target quarter, e.g. 2026-Q4; null to clear')),
        lead: str('Member id, name or email'),
        start: str('Start date, YYYY-MM-DD'),
        due: str('Due date, YYYY-MM-DD'),
      },
      required: ['project'],
    },
    run: a => {
      const p = findProject(a.project);
      const patch = {};
      if (a.name != null) patch.name = String(a.name).trim() || p.name;
      if (a.description != null) patch.desc = a.description;
      if (a.status != null) patch.status = oneOf(a.status, PSTAT, 'project status');
      if ('quarter' in a) patch.quarter = quarter(a.quarter);
      if (a.lead != null) patch.lead = findMember(a.lead).id;
      if (a.start) patch.start = date(a.start, 'start');
      if (a.due) patch.due = date(a.due, 'due');
      write(() => {
        Object.assign(p, patch);
        if (patch.lead && !p.members.includes(patch.lead)) p.members.push(patch.lead);
        const extra = [
          patch.status && 'status to ' + PSTAT[patch.status].name,
          'quarter' in patch && (patch.quarter ? 'quarter to ' + fmtQuarter(patch.quarter) : 'quarter cleared'),
        ]
          .filter(Boolean)
          .join(', ');
        D().activity.unshift({ id: uid('a'), by: D().me, verb: 'updated project', task: null, project: p.id, at: Date.now(), extra });
      });
      return projOut(p);
    },
  },
  {
    name: 'delete_tasks',
    description:
      'Permanently delete tasks, with their subtasks and comments. Before calling, tell the user exactly which tasks will go and get their OK, unless they already named them. The app shows an Undo toast for a few seconds.',
    inputSchema: {
      type: 'object',
      properties: { tasks: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Task ids or keys' } },
      required: ['tasks'],
    },
    run: a => {
      const ts = [...new Set(a.tasks.map(findTask))];
      remove(ts.length === 1 ? `Claude deleted “${ts[0].title}”` : `Claude deleted ${ts.length} tasks`, () => deleteTasks(ts.map(t => t.id)));
      return { deleted: ts.map(t => `${t.key} ${t.title}`) };
    },
  },
  {
    name: 'delete_project',
    description:
      'Permanently delete a project with all its tasks, comments and files. Always confirm with the user first, naming the project and how many tasks it has. The app shows an Undo toast for a few seconds.',
    inputSchema: { type: 'object', properties: { project: str('Project id, key or name') }, required: ['project'] },
    run: a => {
      const p = findProject(a.project);
      const n = D().tasks.filter(t => t.project === p.id).length;
      remove(`Claude deleted ${p.name}`, () => {
        deleteProject(p);
        if (S.ui.route === 'project' && S.ui.params.id === p.id) go('projects');
      });
      return { deleted: p.name, tasks_deleted: n };
    },
  },
  {
    name: 'delete_comment',
    description: "Delete one of the user's own comments (get ids from get_task). Comments by other people can't be deleted.",
    inputSchema: { type: 'object', properties: { comment: str('Comment id') }, required: ['comment'] },
    run: a => {
      const c = D().comments.find(x => x.id === a.comment);
      if (!c || !canSee(proj(task(c.task)?.project))) throw new Error(`No comment with id “${a.comment}”`);
      if (c.by !== D().me) throw new Error('Only your own comments can be deleted');
      remove('Claude deleted a comment', () => {
        D().comments = D().comments.filter(x => x !== c);
      });
      return { deleted: true, task: task(c.task).key };
    },
  },
  {
    name: 'show',
    description: 'Bring something up on screen for the user: a task, a project tab, or a page.',
    inputSchema: {
      type: 'object',
      properties: {
        task: str('Task id or key to open'),
        project: str('Project id, key or name to open'),
        tab: { type: 'string', enum: ['overview', 'board', 'list', 'table', 'calendar', 'timeline', 'files', 'activity'] },
        page: { type: 'string', enum: Object.keys(ROUTE_NAMES).filter(r => r !== 'project') },
      },
    },
    run: a => {
      if (a.task) {
        const t = findTask(a.task);
        if (!(S.ui.route === 'project' && S.ui.params.id === t.project)) go('project', { id: t.project, tab: 'list' });
        S.ui.drawer = t.id;
      } else if (a.project) go('project', { id: findProject(a.project).id, tab: a.tab || 'overview' });
      else if (a.page) go(a.page);
      else throw new Error('Pass a task, project or page');
      render();
      return { ok: true, viewing: where() };
    },
  },
];

/* ---------- MCP bridge: requests forwarded by src-tauri/src/mcp.rs ---------- */
function answerMcp({ method, params }) {
  if (method === 'tools/list') return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
  const tool = TOOLS.find(t => t.name === params?.name);
  try {
    if (!tool) throw new Error(`Unknown tool ${params?.name}`);
    return { content: [{ type: 'text', text: JSON.stringify(tool.run(params.arguments || {})) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}

/* ---------- chat ---------- */
const invoke = (cmd, args) => import('@tauri-apps/api/core').then(m => m.invoke(cmd, args));
let frame = 0;
const paint = () => {
  if (!frame) frame = requestAnimationFrame(() => ((frame = 0), renderClaude()));
};

function systemPrompt() {
  return `You are Claude, built into Stint, ${me().name || 'the user'}'s project management app on their Mac. Use the stint tools to look things up and make the changes they ask for; check names and ids with tools instead of guessing. Make the change, then confirm in a sentence what you did. Ask first before changing many things at once, and always before deleting: say exactly what will be deleted and wait for a yes, unless the user already named it. Replies show in a small chat panel: keep them short, plain text or simple markdown. Today is ${WDL[TODAY.getDay()]}, ${iso(TODAY)}. The user is looking at: ${where()}.`;
}

const LOGIN_HINT = '\n\nIf you haven’t signed in yet, open Terminal, run `claude`, sign in with your Claude account, then try again.';
function onEvent(line) {
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return;
  }
  const c = claudeState();
  if (o.type === 'system' && o.subtype === 'init') c.session = o.session_id;
  else if (o.type === 'stream_event') {
    const e = o.event;
    if (e.type === 'content_block_start' && e.content_block.type === 'text') c.msgs.push({ role: 'assistant', text: '' });
    else if (e.type === 'content_block_start' && e.content_block.type === 'tool_use')
      c.msgs.push({ role: 'tool', name: e.content_block.name.replace(/^mcp__stint__/, '') });
    else if (e.type === 'content_block_delta' && e.delta.type === 'text_delta' && c.msgs.at(-1)?.role === 'assistant') c.msgs.at(-1).text += e.delta.text;
  } else if (o.type === 'result') {
    c.gotResult = true;
    c.session = o.session_id || c.session;
    if (o.is_error) {
      const msg = o.result || o.errors?.join('\n') || 'Something went wrong.';
      c.msgs.push({ role: 'error', text: msg + (/log ?in|api key|auth/i.test(msg) ? LOGIN_HINT : '') });
    }
  }
  paint();
}
function onDone({ code, stderr }) {
  const c = claudeState();
  c.busy = false;
  if (!c.gotResult && !c.stopped) {
    const msg = (stderr || '').trim().split('\n').slice(-4).join('\n') || `Claude stopped unexpectedly (exit code ${code}).`;
    c.msgs.push({ role: 'error', text: msg + (/log ?in|api key|auth/i.test(msg) ? LOGIN_HINT : '') });
  }
  paint();
}

A.claudeToggle = () => {
  const c = claudeState();
  c.open = !c.open;
  renderClaude();
  if (c.open) setTimeout(() => $('#claude-in')?.focus(), 30);
  else $('.cl-fab')?.focus({ preventScroll: true });
};
A.claudeNew = () => {
  const c = claudeState();
  if (c.busy) A.claudeStop();
  Object.assign(c, { msgs: [], session: null });
  renderClaude();
  $('#claude-in')?.focus();
};
// Remembered across launches; a change applies from the next message, in the same chat.
IN.claudeModel = el => {
  S.prefs.claudeModel = el.value;
  save();
};
IN.claudeEffort = el => {
  S.prefs.claudeEffort = el.value;
  save();
};
A.claudeStop = () => {
  claudeState().stopped = true;
  invoke('claude_stop');
};
A.claudeSend = () => {
  const c = claudeState();
  const inp = $('#claude-in');
  const text = inp.value.trim();
  if (!text || c.busy) return;
  inp.value = '';
  inp.style.height = '';
  c.msgs.push({ role: 'user', text });
  Object.assign(c, { busy: true, gotResult: false, stopped: false });
  renderClaude();
  invoke('claude_send', { prompt: text, session: c.session, system: systemPrompt(), model: S.prefs.claudeModel, effort: S.prefs.claudeEffort }).catch(e => {
    c.busy = false;
    c.msgs.push({ role: 'error', text: String(e) });
    renderClaude();
  });
};

// Grow the chat box with its text (CSS caps it and scrolls past that).
const fitInput = t => {
  t.style.height = '';
  t.style.height = t.scrollHeight + 'px';
};
if (hasClaude) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('claude-event', e => onEvent(e.payload));
    listen('claude-done', e => onDone(e.payload));
    listen('mcp-request', e => invoke('mcp_respond', { rid: e.payload.rid, result: answerMcp(e.payload) }));
  });
  // Enter sends, Shift+Enter is a new line, Esc closes. Capture phase, ahead of the app's global shortcuts.
  document.addEventListener(
    'keydown',
    e => {
      if (e.target.id !== 'claude-in') return;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        A.claudeSend();
      } else if (e.key === 'Enter' && e.shiftKey && bulletEnter(e.target)) {
        e.preventDefault();
        fitInput(e.target);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        A.claudeToggle();
      }
    },
    true,
  );
  document.addEventListener('input', e => {
    if (e.target.id !== 'claude-in') return;
    bulletize(e.target);
    fitInput(e.target);
  });
}
