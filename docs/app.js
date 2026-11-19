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

// GRYSKLL Creative Engine, where the C cycles through Creative, Community and
// Collaborative. Screen readers get the plain name once. With reduced motion
// turned on, it stays on Creative.
const C_WORDS = ['reative', 'ommunity', 'ollaborative'];
function productName() {
  const word = el('span', { class: 'pn-word' }, C_WORDS[0]);
  const node = el('p', { class: 'product-name' },
    el('span', { class: 'sr-only' }, 'GRYSKLL Creative Engine'),
    el('span', { 'aria-hidden': 'true' },
      el('span', { class: 'pn-crew' }, 'GRYSKLL'), ' ',
      el('span', { class: 'pn-c' }, 'C'), word, ' ',
      el('span', { class: 'pn-c' }, 'E'), 'ngine'));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let i = 0;
    const timer = setInterval(() => {
      if (!node.isConnected) return clearInterval(timer);
      word.classList.add('out');
      setTimeout(() => {
        i = (i + 1) % C_WORDS.length;
        word.textContent = C_WORDS[i];
        word.classList.remove('out');
      }, 350);
    }, 2600);
  }
  return node;
}

function signInView(error) {
  show(el('section', { class: 'hero' },
    el('img', { class: 'signin-mark', src: 'img/skull-green.png', alt: 'GRYSKLL', width: '182', height: '256' }),
    productName(),
    el('h1', {}, 'Don’t let it die on your hard drive.'),
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
// A colored group inside a card: tinted box, colored edge and heading.
// Tones: green, amber, orange, blue, red, gray.
function group(tone, title, right, ...body) {
  return el('div', { class: `group tone-${tone}` },
    el('div', { class: 'group-head' }, el('h4', {}, title), right),
    ...body);
}
const groupCount = (n) => el('span', { class: 'group-count' }, String(n));
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
  // Leadership: documents submitted for review count as something you owe.
  const docsToReview = me?.leadership ? docsWaiting(d) : [];
  return { ackBy, requests, takes, openTakes, mine, openTasks, overdue, docsToReview,
    count: requests.unread.length + openTakes.length + openTasks.length + docsToReview.length };
}

function oweView(d) {
  const o = owed(d);
  const submitted = o.takes.filter((t) => t.status === 'Submitted');
  // Not used: the take was looked at and left off the song. Nothing is owed.
  const accepted = o.takes.filter((t) => t.status === 'Accepted' || t.status === 'Not used');
  const doneTasks = o.mine.filter((k) => !isOpenTask(k));
  return panel('What you owe', countTag(o.count, o.count > 0),
    o.count === 0 && el('p', { class: 'muted' }, 'Nothing owed right now.'),
    o.requests.unread.length > 0 && group('amber', 'Requests', groupCount(o.requests.unread.length),
      el('ul', { class: 'takes' }, o.requests.unread.map((a) => announcementRow(a, null)))),
    o.openTakes.length > 0 && group('red', 'Takes', groupCount(o.openTakes.length),
      el('ul', { class: 'takes' }, o.openTakes.map(takeRow))),
    o.openTasks.length > 0 && group('blue', 'Tasks', groupCount(o.openTasks.length),
      el('ul', { class: 'takes' }, o.openTasks.map((k) => taskRow(k, true)))),
    docGroups(o.docsToReview),
    submitted.length > 0 && group('gray', 'Submitted, waiting on review', groupCount(submitted.length),
      el('ul', { class: 'takes' }, submitted.map(takeRow))),
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
  'Awaiting Mix Funding', 'Recording', 'Arrangement', 'Songwriting', 'Pending Review', 'Idea/Concept', 'Artwork Needed'];
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

// Funding opens on the current stage. Two buttons switch between it and every stage.
function stageRow(s, itemsByStage) {
  const its = itemsByStage.get(s.id) ?? [];
  const goal = goalOf(its);
  const raised = money(Number(s.raised) || 0);
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, stageLabel(s)),
      el('span', { class: 'take-name' }, goal > 0 ? `${raised} of ${money(goal)}` : `${raised} raised`)),
    el('div', { class: 'take-meta' }, s.status && el('span', { class: `tag stage-${slug(s.status)}` }, s.status)),
    its.length > 0 && el('ul', { class: 'takes nested' }, its.map(itemRow)));
}

function fundingBlock(stages, itemsByStage, contributions) {
  if (stages.length === 0) return null;
  const list = [...stages].sort((a, b) => (a.stage_number ?? 99) - (b.stage_number ?? 99));
  const current = list.find((s) => s.status === 'Underway') ?? list.find((s) => s.status !== 'Complete');
  const currentItems = current ? itemsByStage.get(current.id) ?? [] : [];

  const currentPane = el('div', { class: 'pane' },
    current
      ? [el('p', { class: 'stage-now' }, stageLabel(current)),
        moneyLine(current, currentItems),
        currentItems.length > 0 && el('ul', { class: 'takes' }, currentItems.map(itemRow))]
      : el('p', { class: 'muted' }, 'Every stage is complete.'));
  const allPane = el('div', { class: 'pane', hidden: true },
    el('ul', { class: 'takes' }, list.map((s) => stageRow(s, itemsByStage))));

  const btnCurrent = el('button', { class: 'seg on', type: 'button', 'aria-pressed': 'true' }, 'Current stage');
  const btnAll = el('button', { class: 'seg', type: 'button', 'aria-pressed': 'false' }, `All stages (${list.length})`);
  const pick = (showAll) => {
    allPane.hidden = !showAll;
    currentPane.hidden = showAll;
    btnAll.classList.toggle('on', showAll);
    btnCurrent.classList.toggle('on', !showAll);
    btnAll.setAttribute('aria-pressed', String(showAll));
    btnCurrent.setAttribute('aria-pressed', String(!showAll));
  };
  btnCurrent.addEventListener('click', () => pick(false));
  btnAll.addEventListener('click', () => pick(true));

  return group('green', current ? `Funding · Stage ${current.stage_number ?? ''} of ${list.length}` : 'Funding · complete', null,
    el('div', { class: 'segs', role: 'group', 'aria-label': 'Funding stages' }, btnCurrent, btnAll),
    currentPane,
    allPane,
    owedLine(list, itemsByStage, contributions));
}

function songsBlock(songs) {
  if (!songs?.length) return null;
  const sorted = [...songs].sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.name.localeCompare(b.name));
  const counts = new Map();
  for (const s of sorted) counts.set(s.stage ?? 'No stage', (counts.get(s.stage ?? 'No stage') ?? 0) + 1);
  const out = songs.filter((s) => s.released).length;
  return group('blue', 'Songs', groupCount(songs.length),
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
  return group('red', 'Outstanding', groupCount(total),
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

// ISRC codes (ISRC Admins only) -----------------------------------------------
// Admins see every song. Issuing goes through issue_isrc() in Supabase, which
// picks the next number and refuses duplicates. The sync writes it to Notion.

const isrcOf = (s) => s.isrc || s.isrc_reissue;

function copyButton(value) {
  return el('button', {
    class: 'link', type: 'button',
    onclick: async (e) => {
      try { await navigator.clipboard.writeText(value); e.currentTarget.textContent = 'Copied'; } catch { /* clipboard blocked */ }
    },
  }, 'Copy');
}

function issueControl(song) {
  const box = el('div', { class: 'update' });
  const closed = () => box.replaceChildren(
    el('button', { class: 'ghost', type: 'button', onclick: open }, 'Issue code'));
  function open() {
    let kind = 'Original';
    const msg = el('p', { class: 'error small', hidden: true });
    const btnOrig = el('button', { class: 'seg on', type: 'button', 'aria-pressed': 'true' }, 'Original');
    const btnRe = el('button', { class: 'seg', type: 'button', 'aria-pressed': 'false' }, 'Reissue');
    const pick = (k) => {
      kind = k;
      btnOrig.classList.toggle('on', k === 'Original');
      btnRe.classList.toggle('on', k === 'Reissue');
      btnOrig.setAttribute('aria-pressed', String(k === 'Original'));
      btnRe.setAttribute('aria-pressed', String(k === 'Reissue'));
    };
    btnOrig.addEventListener('click', () => pick('Original'));
    btnRe.addEventListener('click', () => pick('Reissue'));
    const go = el('button', { class: 'primary small', type: 'button' }, 'Issue');
    go.addEventListener('click', async () => {
      go.disabled = true;
      const { data, error } = await supabase.rpc('issue_isrc', { p_song_id: song.id, p_kind: kind });
      if (error) {
        go.disabled = false;
        msg.textContent = `Couldn’t issue a code: ${error.message}`;
        msg.hidden = false;
        return;
      }
      box.replaceChildren(el('p', { class: 'pending small' },
        el('strong', {}, data), ` issued. It reaches Notion within 30 minutes. `, copyButton(data)));
      loadIsrc().then(draw);
    });
    box.replaceChildren(el('div', { class: 'update-form' },
      el('p', { class: 'small muted' }, 'Original for a first release. Reissue for a song GRYSKLL is putting out again. A code can never be reused.'),
      el('div', { class: 'segs', role: 'group', 'aria-label': 'Code type' }, btnOrig, btnRe),
      msg,
      el('div', { class: 'row' }, go, el('button', { class: 'link', type: 'button', onclick: closed }, 'Cancel'))));
  }
  closed();
  return box;
}

function codeStatus(c) {
  if (!c) return null;
  if (c.pushed_at) return el('span', { class: 'tag status-accepted' }, 'In Notion');
  if (c.push_attempts >= 5) return el('span', { class: 'tag status-owed', title: c.push_error ?? '' }, 'Didn’t reach Notion');
  return el('span', { class: 'tag status-submitted' }, 'Going to Notion');
}

function isrcView(d) {
  const songs = d.isrc?.songs ?? [];
  const codes = d.isrc?.codes ?? [];
  const bySong = new Map();
  for (const c of codes) {
    if (!bySong.has(c.song_id)) bySong.set(c.song_id, []);
    bySong.get(c.song_id).push(c);
  }
  const issuedHere = codes.filter((c) => c.issued_by).sort((a, b) => b.issued_at.localeCompare(a.issued_at)).slice(0, 10);
  const nameOf = new Map(songs.map((s) => [s.id, s.name]));
  // A song counts as coded if Notion has a code or one was just issued here.
  const coded = (s) => isrcOf(s) || bySong.has(s.id);
  const without = songs.filter((s) => !coded(s)).sort((a, b) => a.name.localeCompare(b.name));
  const withCode = songs.filter(coded).sort((a, b) => (isrcOf(a) ?? '').localeCompare(isrcOf(b) ?? ''));

  const search = el('input', { type: 'search', placeholder: 'Find a song', 'aria-label': 'Find a song' });
  const list = el('ul', { class: 'songs' });
  const drawList = () => {
    const q = search.value.trim().toLowerCase();
    const shown = without.filter((s) => !q || s.name.toLowerCase().includes(q));
    list.replaceChildren(...(shown.length ? shown.map((s) => el('li', { class: 'song' },
      el('div', { class: 'song-main' }, el('span', {}, s.name)),
      el('div', { class: 'song-meta' },
        s.development_stage && el('span', { class: `tag dev-${slug(s.development_stage)}` }, s.development_stage),
        isReleased(s) && s.development_stage !== 'Released' && el('span', { class: 'tag dev-released' }, 'Out now')),
      issueControl(s))) : [el('li', { class: 'muted' }, q ? 'No match.' : 'Every song has a code.')]));
  };
  search.addEventListener('input', drawList);
  drawList();

  return [
    issuedHere.length > 0 && panel('Issued in gryCE', null,
      el('ul', { class: 'takes' }, issuedHere.map((c) => el('li', { class: 'take' },
        el('div', { class: 'take-main' },
          el('span', { class: 'take-song' }, c.code),
          el('span', { class: 'take-name' }, nameOf.get(c.song_id) ?? 'Song')),
        el('div', { class: 'take-meta' }, el('span', { class: 'tag' }, c.kind), codeStatus(c), copyButton(c.code)))))),
    panel('Songs without a code', countTag(without.length),
      el('p', { class: 'small muted' }, 'Codes run QT-3ZB-YY-NNNNN and pick up from the last number used this year.'),
      el('div', { class: 'update-form' }, search),
      list),
    panel('Songs with a code', countTag(withCode.length),
      el('details', {},
        el('summary', {}, 'Show all'),
        el('ul', { class: 'songs' }, withCode.map((s) => el('li', { class: 'song' },
          el('div', { class: 'song-main' }, el('span', {}, s.name)),
          el('div', { class: 'song-meta' },
            s.isrc && el('span', { class: 'tag' }, `Original ${s.isrc}`),
            s.isrc_reissue && el('span', { class: 'tag' }, `Reissue ${s.isrc_reissue}`),
            (bySong.get(s.id) ?? []).filter((c) => !c.pushed_at).flatMap((c) => [el('span', { class: 'tag' }, `${c.kind} ${c.code}`), codeStatus(c)]))))))),
  ];
}

// Leadership (Leadership only) ------------------------------------------------

// Two kinds of document wait on Leadership:
// Needs Input = a draft that wants everyone's input. Submitted = final, waiting on approval.
const DOC_WAITING = ['Needs Input', 'Submitted'];
const docsWaiting = (d) => (d.leadership?.documents ?? [])
  .filter((x) => DOC_WAITING.includes(x.status))
  .sort((a, b) => (a.date_submitted ?? '9999').localeCompare(b.date_submitted ?? '9999') || a.number.localeCompare(b.number));

function docRow(x) {
  const link = safeUrl(x.link);
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, x.number),
      link ? el('a', { href: link, target: '_blank', rel: 'noopener', class: 'take-name' }, x.name ?? 'Open') : el('span', { class: 'take-name' }, x.name ?? '')),
    el('div', { class: 'take-meta' },
      x.status && el('span', { class: `tag doc-${slug(x.status)}` }, x.status),
      x.date_submitted && el('span', { class: 'muted' }, `Submitted ${fmtDate(x.date_submitted)}`),
      x.date_approved && el('span', { class: 'muted' }, `Approved ${fmtDate(x.date_approved)}`),
      !link && el('span', { class: 'muted' }, 'No link yet')),
    x.notes && el('p', { class: 'take-notes' }, x.notes));
}

// Input needed first, then ready for approval. Used by What you owe and Leadership.
function docGroups(list) {
  const input = list.filter((x) => x.status === 'Needs Input');
  const approve = list.filter((x) => x.status === 'Submitted');
  return [
    input.length > 0 && group('orange', 'Documents: input needed', groupCount(input.length),
      el('p', { class: 'small muted' }, 'Drafts that want your thoughts. Open each one and comment in the doc.'),
      el('ul', { class: 'takes' }, input.map(docRow))),
    approve.length > 0 && group('amber', 'Documents: ready for approval', groupCount(approve.length),
      el('p', { class: 'small muted' }, 'Final drafts submitted to Leadership under the Document Approval Policy.'),
      el('ul', { class: 'takes' }, approve.map(docRow))),
  ];
}

// Registry sections below the waiting list, in the order a document moves.
const DOC_SECTIONS = [
  ['Draft', 'blue', 'Being written. Not ready for Leadership yet.'],
  ['Approved', 'green', 'Approved by Leadership. These are in force.'],
  ['Reserved', 'gray', 'Numbers set aside for documents not started yet.'],
  ['Retired', 'gray', 'No longer in force.'],
];

function leadershipView(d) {
  const docs = [...(d.leadership?.documents ?? [])].sort((a, b) => a.number.localeCompare(b.number));
  const contribs = d.leadership?.contributions ?? [];
  const toReview = docsWaiting(d);
  const waiting = toReview.length;

  const sum = (list, pred = () => true) => list.filter(pred).reduce((n, c) => n + (Number(c.amount) || 0), 0);
  const groupBy = (list, keyOf) => {
    const m = new Map();
    for (const x of list) {
      const k = keyOf(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  // Stages sort by their number from the funding card. Types in a fixed order.
  const stageNo = new Map(d.stages.map((st) => [`${st.project_name}|${st.name}`, st.stage_number ?? 99]));
  const TYPE_ORDER = ['Crew', 'Crewmunity', 'Family loan'];
  const typeRank = (t) => { const i = TYPE_ORDER.indexOf(t); return i < 0 ? 99 : i; };
  const totals = (list) => el('span', { class: 'take-name' },
    `${money(sum(list))} in`,
    sum(list, (c) => c.repayment === 'Owed') > 0 ? ` · ${money(sum(list, (c) => c.repayment === 'Owed'))} owed back` : '');

  const contribRow = (c) => el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, c.artist_name ?? c.contributor_name ?? 'Unnamed'),
      el('span', { class: 'take-name' }, c.amount != null ? money(c.amount) : 'Amount pending')),
    el('div', { class: 'take-meta' },
      c.repayment && el('span', { class: `tag ${c.repayment === 'Owed' ? 'status-owed' : c.repayment === 'Repaid' ? 'status-accepted' : ''}` }, c.repayment),
      c.linked === false && el('span', { class: 'tag status-needs-decision' }, 'Link to a person in Notion'),
      c.contributed_on && el('span', { class: 'muted' }, fmtDate(c.contributed_on))));

  const typeBlock = ([type, list]) => el('div', { class: `contrib-type type-${slug(type)}` },
    el('div', { class: 'contrib-head' }, el('h5', {}, type), totals(list)),
    el('ul', { class: 'takes' }, list.map(contribRow)));

  const stageBlock = (project) => ([stage, list]) => group(stage === BEFORE ? 'amber' : 'green', stage, totals(list),
    [...groupBy(list, (c) => c.type ?? 'No type')]
      .sort((a, b) => typeRank(a[0]) - typeRank(b[0]) || a[0].localeCompare(b[0]))
      .map(typeBlock));

  // Money with no stage came in before the album campaign started.
  const BEFORE = 'Before the album';
  const byProject = [...groupBy(contribs, (c) => c.project_name ?? 'No project')]
    .sort((a, b) => a[0].localeCompare(b[0]));

  const rest = docs.filter((x) => !DOC_WAITING.includes(x.status));
  return [
    panel('Waiting on Leadership', countTag(waiting, waiting > 0),
      waiting
        ? docGroups(toReview)
        : el('p', { class: 'muted' }, 'No documents waiting on Leadership.')),
    panel('Document registry', countTag(docs.length),
      rest.length === 0 && el('p', { class: 'muted' }, 'Nothing else in the registry yet.'),
      DOC_SECTIONS.map(([status, tone, blurb]) => {
        const list = rest.filter((x) => (x.status ?? 'Draft') === status);
        return list.length > 0 && group(tone, status, groupCount(list.length),
          el('p', { class: 'small muted' }, blurb),
          el('ul', { class: 'takes' }, list.map(docRow)));
      }),
      (() => {
        const other = rest.filter((x) => !DOC_SECTIONS.some(([st]) => st === (x.status ?? 'Draft')));
        return other.length > 0 && group('gray', 'Other', groupCount(other.length), el('ul', { class: 'takes' }, other.map(docRow)));
      })()),
    panel('Contributions', countTag(contribs.length),
      el('p', { class: 'small muted' }, 'Everyone’s contributions. Only Leadership sees this. Members see only their own.'),
      contribs.length === 0 && el('p', { class: 'muted' }, 'No contributions yet.'),
      byProject.map(([project, list]) => el('div', { class: 'block' },
        el('div', { class: 'contrib-head' }, el('h3', {}, project), totals(list)),
        [...groupBy(list, (c) => c.stage_name ?? BEFORE)]
          // Before the album first, then stages in order.
          .sort((a, b) => (a[0] === BEFORE ? -1 : b[0] === BEFORE ? 1 : 0)
            || (stageNo.get(`${project}|${a[0]}`) ?? 99) - (stageNo.get(`${project}|${b[0]}`) ?? 99) || a[0].localeCompare(b[0]))
          .map(([stage, sl]) => {
            const n = stageNo.get(`${project}|${stage}`);
            return stageBlock(project)([n && n !== 99 ? `Stage ${n}, ${stage}` : stage, sl]);
          })))),
  ];
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
    tile('discography', 'Discography', String(released), 'Released'),
    me?.isrc_admin && (() => {
      const songs = d.isrc?.songs ?? [];
      const codedIds = new Set((d.isrc?.codes ?? []).map((c) => c.song_id));
      const open = songs.filter((s) => !isrcOf(s) && !codedIds.has(s.id)).length;
      return tile('isrc', 'ISRC codes', String(open), open === 1 ? 'Song without a code' : 'Songs without a code');
    })(),
    me?.leadership && (() => {
      const waiting = docsWaiting(d).length;
      return tile('leadership', 'Leadership', String(waiting), waiting ? (waiting === 1 ? 'Doc waiting on you' : 'Docs waiting on you') : 'Nothing waiting', waiting ? 'hot' : null);
    })());
}
const homeHelp = () => el('a', { class: 'ghost help-button', href: '#help' }, 'How gryCE works');

const VIEWS = { owe: oweView, news: newsView, crew: crewView, projects: projectsView, works: worksView, discography: discographyView, help: helpView, isrc: isrcView, leadership: leadershipView };
const VIEW_TITLES = { owe: 'What you owe', news: 'Crew news', crew: 'Crew tasks', projects: 'Project updates', works: 'In the works', discography: 'Discography', help: 'Help', isrc: 'ISRC codes', leadership: 'Leadership' };
// Sections only some members get. Anyone else who types the address lands on Home.
const allowed = (key) => (key === 'isrc' ? me?.isrc_admin : key === 'leadership' ? me?.leadership : true);

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
  const key = location.hash.slice(1);
  const view = allowed(key) ? VIEWS[key] : null;
  if (view) {
    show(el('nav', { class: 'crumbs' }, backLink(), el('span', { class: 'here' }, VIEW_TITLES[key])), view(current));
  } else {
    show(el('div', { class: 'home-head' }, el('p', { class: 'eyebrow' }, `Peace, ${me.name}`), homeHelp()), homeView(current));
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', draw);

// Extra data for ISRC Admins and Leadership. The database decides what comes
// back, so these only fill in for the right people.
async function loadIsrc() {
  if (!me?.isrc_admin || !current) return;
  const [songs, codes] = await Promise.all([
    optionalRows(supabase.from('songs').select('id, name, development_stage, status, isrc, isrc_reissue'), 'ISRC songs'),
    optionalRows(supabase.from('isrc_codes').select('code, song_id, kind, issued_by, issued_at, pushed_at, push_attempts, push_error'), 'ISRC codes'),
  ]);
  current.isrc = { songs, codes };
}
async function loadLeadership() {
  if (!me?.leadership || !current) return;
  const [documents, contributions] = await Promise.all([
    optionalRows(supabase.from('documents').select('id, number, name, status, date_submitted, date_approved, link, notes'), 'documents'),
    optionalRows(supabase.rpc('leadership_contributions'), 'all contributions'),
  ]);
  current.leadership = { documents, contributions };
}

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
  await Promise.all([loadIsrc(), loadLeadership()]);
  const y = window.scrollY;
  draw();
  window.scrollTo(0, y);
}

async function render(session) {
  if (!session) return signInView();

  const email = session.user.email;
  // Leadership and ISRC Admin come with v0.4.1. Before its SQL runs, those columns
  // don't exist, so fall back to the basics.
  let { data, error: meErr } = await supabase.from('artists').select('id, name, leadership, isrc_admin').maybeSingle();
  if (meErr && /column/i.test(meErr.message)) {
    ({ data, error: meErr } = await supabase.from('artists').select('id, name').maybeSingle());
  }
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
