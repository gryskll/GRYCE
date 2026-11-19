import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { helpView } from './help-full.js';

const app = document.getElementById('app');

// Small DOM helper. Everything from the database goes in as text, never HTML.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
// Empty sections come back as null. Drop them, or the page prints "null".
const show = (...nodes) => app.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
const fmtDate = (d) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
const isPast = (d) => d && new Date(`${d}T23:59:59`) < new Date();
const slug = (s) => (s || '').toLowerCase().replace(/\s+/g, '-');

if (SUPABASE_URL.startsWith('REPLACE') || SUPABASE_PUBLISHABLE_KEY.startsWith('REPLACE')) {
  show(el('section', { class: 'card' },
    el('h1', {}, 'Almost there'),
    el('p', {}, 'docs/config.js still needs the Supabase project URL and publishable key.')));
  throw new Error('gryCE config not set');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
});

document.getElementById('sign-out').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

function signInView(error) {
  show(el('section', { class: 'hero' },
    el('div', { class: 'wordmark-plate' }, el('img', { src: 'img/wordmark.png', alt: 'GRYSKLL', width: '800', height: '385' })),
    el('p', { class: 'eyebrow' }, 'GRYSKLL members'),
    el('h1', {}, 'Your takes. Your catalog.'),
    el('p', { class: 'muted' }, 'Sign in with the Google account GRYSKLL has on file for you.'),
    error && el('p', { class: 'error' }, error),
    el('p', { class: 'small muted' }, 'First time here? ', el('a', { href: 'help.html' }, 'Here’s how to get in.')),
    el('button', {
      class: 'primary', type: 'button',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        const { error: err } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: location.origin + location.pathname },
        });
        if (err) signInView(err.message);
      },
    }, 'Sign in with Google')));
}

function notLinkedView(email) {
  show(el('section', { class: 'card' },
    el('h1', {}, 'You’re signed in, but not linked yet'),
    el('p', {}, 'There’s no GRYSKLL artist record for ', el('strong', {}, email), '.'),
    el('p', { class: 'muted' }, 'Text this email to Shaah so it can be added to your artist profile. Your page fills in within about 30 minutes after that.'),
    el('p', { class: 'small muted' }, 'gryCE is for GRYSKLL members right now. ', el('a', { href: 'help.html' }, 'Help getting in'))));
}

// Member updates ----------------------------------------------------------
// Members never edit synced rows. They add a member_updates row, and the sync
// carries it to Notion on its next run.

let pendingByItem = new Map();   // "take:<id>" or "task:<id>" -> latest unsent update

function pendingNote(kind, id) {
  const u = pendingByItem.get(`${kind}:${id}`);
  if (!u) return null;
  if (u.attempts >= 5) {
    return el('p', { class: 'error small' }, 'Your update didn’t reach Notion. Tell Shaah so he can check it.');
  }
  const what = u.new_status ? `Marked ${u.new_status.toLowerCase()}` : 'Note sent';
  return el('p', { class: 'pending small' }, `${what}. It shows up in Notion within 30 minutes.`);
}

// Inline form for one item. newStatus is what the main button sets
// (Submitted for takes, Done for tasks). Add a note sends a note only.
function updateForm(kind, id, newStatus, { askLink }) {
  const box = el('div', { class: 'update' });
  const closed = () => box.replaceChildren(
    newStatus && el('button', { class: 'ghost', type: 'button', onclick: () => open(newStatus) },
      kind === 'take' ? 'Mark submitted' : 'Mark done'),
    el('button', { class: 'link', type: 'button', onclick: () => open(null) }, 'Add a note'));

  function open(status) {
    const note = el('textarea', { rows: '2', maxlength: '1000', placeholder: status ? 'Note for Shaah (optional)' : 'Your note' });
    const link = askLink && el('input', { type: 'url', maxlength: '500', placeholder: 'Link to the file (optional)' });
    const msg = el('p', { class: 'error small', hidden: true });
    const send = el('button', { class: 'primary small', type: 'submit' }, status ? 'Send' : 'Send note');
    const form = el('form', {
      class: 'update-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const row = {
          item_type: kind,
          item_id: id,
          new_status: status,
          note: note.value.trim() || null,
          link: link ? link.value.trim() || null : null,
        };
        if (row.link && !safeUrl(row.link)) return fail('Links need to start with https://');
        if (!row.new_status && !row.note && !row.link) return fail('Write a note first.');
        send.disabled = true;
        const { error } = await supabase.from('member_updates').insert(row);
        if (error) {
          send.disabled = false;
          return fail(`Couldn’t send that: ${error.message}. Try again, or tell Shaah if it keeps happening.`);
        }
        await refresh();
      },
    },
      status && el('p', { class: 'small muted' },
        kind === 'take' ? 'This tells Shaah your take is in. He marks it accepted.' : 'This marks the task done in Notion.'),
      link, note, msg,
      el('div', { class: 'row' },
        send,
        el('button', { class: 'link', type: 'button', onclick: closed }, 'Cancel')));
    function fail(t) { msg.textContent = t; msg.hidden = false; }
    box.replaceChildren(form);
    (link || note).focus();
  }

  closed();
  return box;
}

// Layout ------------------------------------------------------------------
// Home is a grid of square tiles. A tile opens its section full screen, and the
// section's address (#owe, #news, ...) means the phone's back button works.

function panel(title, badge, ...body) {
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, title), badge),
    ...body);
}
const countTag = (n, hot) => el('span', { class: hot ? 'count hot' : 'count' }, String(n));
const backLink = () => el('a', { class: 'back', href: '#' }, '‹ All sections');

// Announcements -----------------------------------------------------------
// Type Request = something members owe (shown under What you owe).
// Type News, or blank = just to read (shown under Crew news).

const isRequest = (a) => a.type === 'Request';

function announcementRow(a, acked) {
  const msg = el('p', { class: 'error small', hidden: true });
  return el('li', { class: acked ? 'take announcement read' : 'take announcement' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, a.title),
      a.publish_date && el('span', { class: 'take-name' }, fmtDate(a.publish_date))),
    isRequest(a) && el('div', { class: 'take-meta' }, el('span', { class: 'tag status-owed' }, 'Request')),
    a.body && el('p', { class: 'ann-body' }, a.body),
    acked
      ? el('p', { class: 'small muted' }, `Acknowledged ${fmtDate(acked.acknowledged_at)}`)
      : el('button', {
        class: 'primary small', type: 'button',
        onclick: async (e) => {
          e.currentTarget.disabled = true;
          const { error } = await supabase.from('announcement_acks').insert({ announcement_id: a.id });
          // 23505 means it was already acknowledged, maybe in another tab. That's fine.
          if (error && error.code !== '23505') {
            e.currentTarget.disabled = false;
            msg.textContent = `Couldn’t save that: ${error.message}. Try again.`;
            msg.hidden = false;
            return;
          }
          await refresh();
        },
      }, 'Acknowledge'),
    msg);
}

function splitRead(list, ackBy) {
  const sorted = [...list].sort((a, b) => (b.publish_date ?? '').localeCompare(a.publish_date ?? ''));
  return { unread: sorted.filter((a) => !ackBy.has(a.id)), read: sorted.filter((a) => ackBy.has(a.id)) };
}

// Takes and tasks -----------------------------------------------------------

const OPEN = ['Owed', 'Needs Decision'];
const isOpenTake = (t) => !t.status || OPEN.includes(t.status);
const TASK_DONE = ['Done', 'Complete', 'Completed', 'Archived', 'Canceled', 'Cancelled'];
const isOpenTask = (k) => !TASK_DONE.includes(k.status);
const byDue = (a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.name.localeCompare(b.name);

function takeRow(t) {
  const due = fmtDate(t.due_date);
  const overdue = t.status === 'Owed' && isPast(t.due_date);
  const pending = pendingNote('take', t.id);
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, t.song?.name ?? 'No song linked'),
      el('span', { class: 'take-name' }, t.name)),
    el('div', { class: 'take-meta' },
      t.type && el('span', { class: 'tag' }, t.type),
      t.status && el('span', { class: `tag status-${slug(t.status)}` }, t.status),
      due && el('span', { class: overdue ? 'due overdue' : 'due' }, overdue ? `Overdue · ${due}` : `Due ${due}`)),
    t.notes && el('p', { class: 'take-notes' }, t.notes),
    pending,
    isOpenTake(t) && !pending && updateForm('take', t.id, 'Submitted', { askLink: true }));
}

function taskRow(k, mine) {
  const due = fmtDate(k.due_date);
  const overdue = isOpenTask(k) && isPast(k.due_date);
  const pending = mine && pendingNote('task', k.id);
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, k.name)),
    el('div', { class: 'take-meta' },
      k.is_crew && el('span', { class: 'tag' }, 'Crew'),
      k.status && el('span', { class: `tag task-${slug(k.status)}` }, k.status),
      due && el('span', { class: overdue ? 'due overdue' : 'due' }, overdue ? `Overdue · ${due}` : `Due ${due}`)),
    pending,
    mine && isOpenTask(k) && !pending && updateForm('task', k.id, 'Done', { askLink: true }));
}

// What you owe: requests, takes and your own tasks, in one place.
function owed(d) {
  const ackBy = new Map(d.acks.map((k) => [k.announcement_id, k]));
  const requests = splitRead(d.announcements.filter(isRequest), ackBy);
  const takes = d.takes;
  const openTakes = takes.filter(isOpenTake);
  const mine = d.tasks.filter((k) => (k.assignee_ids ?? []).includes(me.id));
  const openTasks = mine.filter(isOpenTask).sort(byDue);
  const overdue = openTakes.some((t) => t.status === 'Owed' && isPast(t.due_date))
    || openTasks.some((k) => isPast(k.due_date));
  return { ackBy, requests, takes, openTakes, mine, openTasks, overdue,
    count: requests.unread.length + openTakes.length + openTasks.length };
}

function oweView(d) {
  const o = owed(d);
  const submitted = o.takes.filter((t) => t.status === 'Submitted');
  // Not used: the take was looked at and left off the song. Nothing is owed.
  const accepted = o.takes.filter((t) => t.status === 'Accepted' || t.status === 'Not used');
  const doneTasks = o.mine.filter((k) => !isOpenTask(k));
  return panel('What you owe', countTag(o.count, o.count > 0),
    o.count === 0 && el('p', { class: 'muted' }, 'Nothing owed right now.'),
    o.requests.unread.length > 0 && el('h3', {}, 'Requests'),
    o.requests.unread.length > 0 && el('ul', { class: 'takes' }, o.requests.unread.map((a) => announcementRow(a, null))),
    o.openTakes.length > 0 && el('h3', {}, 'Takes'),
    o.openTakes.length > 0 && el('ul', { class: 'takes' }, o.openTakes.map(takeRow)),
    o.openTasks.length > 0 && el('h3', {}, 'Tasks'),
    o.openTasks.length > 0 && el('ul', { class: 'takes' }, o.openTasks.map((k) => taskRow(k, true))),
    submitted.length > 0 && el('h3', {}, 'Submitted, waiting on review'),
    submitted.length > 0 && el('ul', { class: 'takes' }, submitted.map(takeRow)),
    (accepted.length + doneTasks.length + o.requests.read.length) > 0 && el('details', {},
      el('summary', {}, `Done (${accepted.length + doneTasks.length + o.requests.read.length})`),
      el('ul', { class: 'takes' },
        o.requests.read.map((a) => announcementRow(a, o.ackBy.get(a.id))),
        accepted.map(takeRow),
        doneTasks.map((k) => taskRow(k, true)))));
}

function newsView(d) {
  const ackBy = new Map(d.acks.map((k) => [k.announcement_id, k]));
  const { unread, read } = splitRead(d.announcements.filter((a) => !isRequest(a)), ackBy);
  return panel('Crew news', unread.length > 0 && countTag(unread.length, true),
    unread.length
      ? el('ul', { class: 'takes' }, unread.map((a) => announcementRow(a, null)))
      : el('p', { class: 'muted' }, 'You’re caught up.'),
    read.length > 0 && el('details', {},
      el('summary', {}, `Read (${read.length})`),
      el('ul', { class: 'takes' }, read.map((a) => announcementRow(a, ackBy.get(a.id))))));
}

const crewTasksOf = (d) => d.tasks.filter((k) => k.is_crew && !(k.assignee_ids ?? []).includes(me.id));

function crewView(d) {
  const crew = crewTasksOf(d);
  const open = crew.filter(isOpenTask).sort(byDue);
  const done = crew.filter((k) => !isOpenTask(k));
  return panel('Crew tasks', countTag(open.length),
    open.length
      ? el('ul', { class: 'takes' }, open.map((k) => taskRow(k, false)))
      : el('p', { class: 'muted' }, 'No crew tasks open right now.'),
    done.length > 0 && el('details', {},
      el('summary', {}, `Done (${done.length})`),
      el('ul', { class: 'takes' }, done.map((k) => taskRow(k, false)))));
}

// Project updates: where each active project stands, songs and funding --------

const STAGE_ORDER = ['Released', 'Release Ready', 'Mastering', 'Re-Mastering', 'Mixing', 'Mixing Prep',
  'Recording', 'Arrangement', 'Songwriting', 'Pending Review', 'Idea/Concept', 'Artwork Needed'];
const stageRank = (s) => { const i = STAGE_ORDER.indexOf(s); return i < 0 ? 99 : i; };

const money = (n) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(n);
const needsQuote = (i) => i.quote == null || i.status === 'Needs quote';
const goalOf = (items) => items.reduce((sum, i) => sum + (Number(i.quote) || 0), 0);
const stageLabel = (s) => (s.stage_number ? `Stage ${s.stage_number}, ${s.name}` : s.name);

function itemRow(i) {
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, i.name),
      i.quote != null && el('span', { class: 'take-name' }, money(i.quote))),
    el('div', { class: 'take-meta' },
      i.status && el('span', { class: `tag item-${slug(i.status)}` }, i.status)),
    i.notes && el('p', { class: 'take-notes' }, i.notes));
}

function moneyLine(stage, items) {
  const goal = goalOf(items);
  const waiting = items.filter(needsQuote).length;
  const raised = Number(stage.raised) || 0;
  const waitText = waiting > 0 && `${waiting} ${waiting === 1 ? 'item is' : 'items are'} waiting on quotes.`;
  if (goal === 0) {
    return el('div', { class: 'money' },
      el('p', {}, el('strong', {}, money(raised)), ' raised. The goal comes once quotes are in.'),
      waitText && el('p', { class: 'small muted' }, waitText));
  }
  const pct = Math.min(100, Math.round((raised / goal) * 100));
  return el('div', { class: 'money' },
    el('p', {}, el('strong', {}, money(raised)), ` raised of ${money(goal)}`, waiting > 0 ? ' so far' : '', '.'),
    el('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
      el('span', { style: `width: ${pct}%` })),
    waitText && el('p', { class: 'small muted' }, `${waitText} The goal goes up as they come in.`));
}

function owedLine(stages, itemsByStage, mine) {
  const owedRows = mine.filter((c) => c.repayment === 'Owed');
  if (owedRows.length === 0) return null;
  const known = owedRows.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const unknown = owedRows.filter((c) => c.amount == null).length;
  const repayStage = stages.find((s) => (itemsByStage.get(s.id) ?? []).some((i) => /^repay/i.test(i.name)));
  return el('div', { class: 'owed' },
    el('p', {},
      'You’ve put in ', el('strong', {}, money(known)),
      unknown > 0 ? `, plus ${unknown === 1 ? 'one payment' : `${unknown} payments`} still being confirmed` : '',
      '. ',
      repayStage ? `It’s paid back at face value in ${stageLabel(repayStage)}.` : 'It’s paid back at face value.'));
}

function fundingBlock(stages, itemsByStage, contributions) {
  if (stages.length === 0) return null;
  const list = [...stages].sort((a, b) => (a.stage_number ?? 99) - (b.stage_number ?? 99));
  const current = list.find((s) => s.status === 'Underway') ?? list.find((s) => s.status !== 'Complete');
  const currentItems = current ? itemsByStage.get(current.id) ?? [] : [];
  return el('div', { class: 'block' },
    el('h3', {}, current ? `Funding · Stage ${current.stage_number ?? ''} of ${list.length}, ${current.name}` : 'Funding · complete'),
    current && moneyLine(current, currentItems),
    currentItems.length > 0 && el('ul', { class: 'takes' }, currentItems.map(itemRow)),
    owedLine(list, itemsByStage, contributions),
    el('details', {},
      el('summary', {}, `All funding stages (${list.length})`),
      el('ul', { class: 'takes' }, list.map((s) => {
        const its = itemsByStage.get(s.id) ?? [];
        const goal = goalOf(its);
        const raised = money(Number(s.raised) || 0);
        return el('li', { class: 'take' },
          el('div', { class: 'take-main' },
            el('span', { class: 'take-song' }, stageLabel(s)),
            el('span', { class: 'take-name' }, goal > 0 ? `${raised} of ${money(goal)}` : `${raised} raised`)),
          el('div', { class: 'take-meta' }, s.status && el('span', { class: `tag stage-${slug(s.status)}` }, s.status)),
          s.id !== current?.id && its.length > 0 && el('ul', { class: 'takes nested' }, its.map(itemRow)));
      }))));
}

function songsBlock(songs) {
  if (!songs?.length) return null;
  const sorted = [...songs].sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.name.localeCompare(b.name));
  const counts = new Map();
  for (const s of sorted) counts.set(s.stage ?? 'No stage', (counts.get(s.stage ?? 'No stage') ?? 0) + 1);
  const out = songs.filter((s) => s.released).length;
  return el('div', { class: 'block' },
    el('h3', {}, `Songs · ${songs.length}`),
    out > 0 && el('p', { class: 'small muted' }, `${out} of ${songs.length} already out. Album versions follow the stages below.`),
    el('div', { class: 'take-meta' }, [...counts].map(([stage, n]) => el('span', { class: `tag dev-${slug(stage)}` }, `${n} ${stage}`))),
    el('details', {},
      el('summary', {}, 'Song by song'),
      el('ul', { class: 'songs' }, sorted.map((s) => el('li', { class: 'song' },
        el('div', { class: 'song-main' }, el('span', {}, s.name)),
        el('div', { class: 'song-meta' },
          s.stage && el('span', { class: `tag dev-${slug(s.stage)}` }, s.stage),
          s.released && s.stage !== 'Released' && el('span', { class: 'tag dev-released' }, 'Out now'))))))); 
}

// Who still owes what on this project, grouped by person. Everyone sees it.
function outstandingBlock(songs) {
  const byWho = new Map();
  for (const s of songs ?? []) {
    for (const o of s.owed ?? []) {
      if (!byWho.has(o.who)) byWho.set(o.who, []);
      byWho.get(o.who).push(`${o.what}, ${s.name}`);
    }
  }
  if (byWho.size === 0) return null;
  const total = [...byWho.values()].reduce((n, l) => n + l.length, 0);
  const people = [...byWho].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return el('div', { class: 'block' },
    el('h3', {}, `Outstanding · ${total}`),
    el('p', { class: 'small muted' }, 'What the project is still waiting on, from everyone.'),
    el('ul', { class: 'takes' }, people.map(([who, list]) => el('li', { class: 'take' },
      el('div', { class: 'take-main' },
        el('span', { class: 'take-song' }, who),
        el('span', { class: 'take-name' }, `${list.length} owed`)),
      el('div', { class: 'take-meta' }, list.sort().map((x) => el('span', { class: 'tag status-owed' }, x)))))));
}

function projectsOf(d) {
  const ids = new Set([...d.projects.map((p) => p.id), ...d.stages.map((s) => s.project_id).filter(Boolean)]);
  return [...ids].map((id) => {
    const p = d.projects.find((x) => x.id === id);
    const stages = d.stages.filter((s) => s.project_id === id);
    return { id, name: p?.name ?? stages[0]?.project_name ?? 'Project', p, stages };
  }).sort((a, b) => (a.p?.release_date ?? '9999').localeCompare(b.p?.release_date ?? '9999'));
}

function projectsView(d) {
  const itemsByStage = new Map();
  for (const i of d.items) {
    if (!itemsByStage.has(i.stage_id)) itemsByStage.set(i.stage_id, []);
    itemsByStage.get(i.stage_id).push(i);
  }
  const list = projectsOf(d);
  if (list.length === 0) return panel('Project updates', null, el('p', { class: 'muted' }, 'No active projects right now.'));
  return list.map(({ id, name, p, stages }) => panel(name, p?.status && el('span', { class: 'pill' }, p.status),
    p?.release_date && el('p', { class: 'release' }, `Release: ${new Date(`${p.release_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`),
    p?.summary && el('p', { class: 'ann-body' }, p.summary),
    outstandingBlock(p?.songs),
    songsBlock(p?.songs),
    fundingBlock(stages, itemsByStage, d.contributions.filter((c) => c.project_id === id))));
}

// In the works and Discography -----------------------------------------------

const isReleased = (s) => s.development_stage === 'Released' || s.status === 'Released';

function songRow(s) {
  const link = safeUrl(s.song_link) || safeUrl(s.bandcamp_link);
  const when = isReleased(s) ? fmtDate(s.release_date) : (s.target_release_date && `Target ${fmtDate(s.target_release_date)}`);
  return el('li', { class: 'song' },
    el('div', { class: 'song-main' },
      link ? el('a', { href: link, target: '_blank', rel: 'noopener' }, s.name) : el('span', {}, s.name),
      el('span', { class: 'roles' }, s.roles.join(' · '))),
    el('div', { class: 'song-meta' },
      !isReleased(s) && s.development_stage && el('span', { class: 'tag' }, s.development_stage),
      s.owes && el('span', { class: 'tag status-owed' }, 'Take owed'),
      when && el('span', { class: 'muted' }, when)));
}

// Songs come from credits, plus songs where you owe a take but have no credit yet.
function collectSongs(credits, takes) {
  const bySong = new Map();
  for (const c of credits) {
    if (!c.song) continue;
    const s = bySong.get(c.song.id) ?? { ...c.song, roles: [], owes: false };
    if (!s.roles.includes(c.role)) s.roles.push(c.role);
    bySong.set(c.song.id, s);
  }
  for (const t of takes) {
    if (!t.song || !isOpenTake(t)) continue;
    const s = bySong.get(t.song.id) ?? { ...t.song, roles: [], owes: false };
    s.owes = true;
    if (s.roles.length === 0) s.roles.push(t.type ? `${t.type} owed` : 'Take owed');
    bySong.set(t.song.id, s);
  }
  return [...bySong.values()];
}

const releasedOf = (songs) => songs.filter(isReleased)
  .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.name.localeCompare(b.name));
const workingOf = (songs) => songs.filter((s) => !isReleased(s))
  .sort((a, b) => Number(b.owes) - Number(a.owes)
    || (a.target_release_date ?? '9999').localeCompare(b.target_release_date ?? '9999')
    || a.name.localeCompare(b.name));

function worksView(d) {
  const working = workingOf(d.songs);
  return panel('In the works', countTag(working.length),
    working.length
      ? el('ul', { class: 'songs' }, working.map(songRow))
      : el('p', { class: 'muted' }, 'No songs in the works with your name on them.'));
}

function discographyView(d) {
  const released = releasedOf(d.songs);
  return panel('Discography', countTag(released.length),
    released.length
      ? el('ul', { class: 'songs' }, released.map(songRow))
      : el('p', { class: 'muted' }, 'Nothing released with your name on it yet.'));
}

// Home tiles ------------------------------------------------------------------

function tile(hash, title, count, sub, state) {
  return el('a', { class: `tile${state ? ` ${state}` : ''}`, href: `#${hash}` },
    el('span', { class: 'tile-count' }, count),
    el('span', { class: 'tile-title' }, title),
    sub && el('span', { class: 'tile-sub' }, sub));
}

function homeView(d) {
  const o = owed(d);
  const ackBy = new Map(d.acks.map((k) => [k.announcement_id, k]));
  const news = splitRead(d.announcements.filter((a) => !isRequest(a)), ackBy);
  const crewOpen = crewTasksOf(d).filter(isOpenTask).length;
  const projects = projectsOf(d);
  const working = workingOf(d.songs).length;
  const released = releasedOf(d.songs).length;
  return el('nav', { class: 'tiles', 'aria-label': 'Sections' },
    tile('owe', 'What you owe', String(o.count),
      o.overdue ? 'Something’s overdue' : o.count ? 'Waiting on you' : 'All clear',
      o.overdue ? 'bad' : o.count ? 'hot' : null),
    tile('news', 'Crew news', String(news.unread.length), news.unread.length ? 'Unread' : 'Caught up', news.unread.length ? 'hot' : null),
    tile('crew', 'Crew tasks', String(crewOpen), crewOpen ? 'Open' : 'None open'),
    tile('projects', 'Project updates', String(projects.length),
      projects.length === 1 ? projects[0].name : projects.length ? 'Active projects' : 'None active'),
    tile('works', 'In the works', String(working), working === 1 ? 'Song' : 'Songs'),
    tile('discography', 'Discography', String(released), 'Released'));
}
const homeHelp = () => el('p', { class: 'small muted home-help' }, el('a', { href: '#help' }, 'How gryCE works'));

const VIEWS = { owe: oweView, news: newsView, crew: crewView, projects: projectsView, works: worksView, discography: discographyView, help: helpView };
const VIEW_TITLES = { owe: 'What you owe', news: 'Crew news', crew: 'Crew tasks', projects: 'Project updates', works: 'In the works', discography: 'Discography', help: 'Help' };

// Main --------------------------------------------------------------------

const SONG_FIELDS = 'id, name, development_stage, status, release_date, target_release_date, song_link, bandcamp_link';
let me = null;
let current = null;   // last loaded data

// Newer tables may not exist yet while setup is in progress. A missing one
// shows as empty instead of breaking the page.
async function optionalRows(query, label) {
  const { data, error } = await query;
  if (error) {
    console.warn(`gryCE: ${label} not loaded: ${error.message}`);
    return [];
  }
  return data ?? [];
}

function draw() {
  if (!current) return;
  const view = VIEWS[location.hash.slice(1)];
  if (view) {
    const key = location.hash.slice(1);
    show(el('nav', { class: 'crumbs' }, backLink(), el('span', { class: 'here' }, VIEW_TITLES[key])), view(current));
  } else {
    show(el('p', { class: 'eyebrow' }, `What’s up, ${me.name}`), homeView(current), homeHelp());
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', draw);

async function refresh() {
  const [takesRes, creditsRes, tasks, announcements, acks, updates, stages, items, contributions, projects] = await Promise.all([
    supabase.from('takes')
      .select(`id, name, type, status, due_date, notes, song:songs(${SONG_FIELDS})`)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('song_credits').select(`role, song:songs(${SONG_FIELDS})`),
    optionalRows(supabase.from('tasks').select('id, name, status, due_date, assignee_ids, is_crew'), 'tasks'),
    optionalRows(supabase.from('announcements').select('*'), 'announcements'),
    optionalRows(supabase.from('announcement_acks').select('announcement_id, acknowledged_at'), 'acknowledgements'),
    optionalRows(supabase.from('member_updates')
      .select('item_type, item_id, new_status, created_at, attempts')
      .is('processed_at', null)
      .order('created_at', { ascending: true }), 'updates'),
    optionalRows(supabase.from('funding_stages').select('id, project_id, project_name, stage_number, name, status, raised'), 'funding stages'),
    optionalRows(supabase.from('funding_items').select('id, stage_id, name, quote, status, notes'), 'funding items'),
    optionalRows(supabase.from('contributions').select('id, project_id, amount, repayment'), 'contributions'),
    optionalRows(supabase.from('projects').select('id, name, status, release_date, summary, songs'), 'projects'),
  ]);
  const err = takesRes.error || creditsRes.error;
  if (err) return show(el('p', { class: 'error' }, `Couldn’t load your data: ${err.message}. Refresh to try again.`));

  pendingByItem = new Map(updates.map((u) => [`${u.item_type}:${u.item_id}`, u]));
  current = {
    takes: takesRes.data, tasks, announcements, acks, stages, items, contributions, projects,
    songs: collectSongs(creditsRes.data, takesRes.data),
  };
  const y = window.scrollY;
  draw();
  window.scrollTo(0, y);
}

async function render(session) {
  if (!session) return signInView();

  const email = session.user.email;
  const { data, error: meErr } = await supabase.from('artists').select('id, name').maybeSingle();
  if (meErr) return show(el('p', { class: 'error' }, `Couldn’t load your profile: ${meErr.message}`));
  if (!data) return notLinkedView(email);
  me = data;
  // Linked members get the full help inside gryCE. Everyone else gets the sign-in help page.
  document.getElementById('help-link').href = '#help';

  document.getElementById('who-name').textContent = me.name;
  document.getElementById('who').hidden = false;
  await refresh();
}

let renderedFor;
const renderOnce = (s) => {
  const key = s?.user?.id ?? 'signed-out';
  if (key === renderedFor) return;
  renderedFor = key;
  render(s);
};

const { data: { session } } = await supabase.auth.getSession();
renderOnce(session);
supabase.auth.onAuthStateChange((event, s) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') renderOnce(s);
});
