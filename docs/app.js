// gryCE member portal: the whole site in one module.
// Flow: sign in with Google (Supabase Auth) -> load the member's artist row ->
// refresh() loads everything they're allowed to see in one go -> draw() renders
// the view named in location.hash. The database (row level security) decides
// what comes back; this file only lays it out. Sections are marked "// Name ----".
// See DEVELOPERS.md for the map, and dev/preview.html to run it with made-up data.

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
const show = (...nodes) => app.replaceChildren(...[viewBanner(), ...nodes].flat().filter((n) => n != null && n !== false));

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

// Links show as buttons, not raw URLs. The label says where the link goes.
function linkLabel(url) {
  let u;
  try { u = new URL(url); } catch { return 'Open link'; }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;
  if (host === 'docs.google.com') {
    if (path.startsWith('/document')) return 'Open doc';
    if (path.startsWith('/spreadsheets')) return 'Open sheet';
    if (path.startsWith('/presentation')) return 'Open slides';
    if (path.startsWith('/forms')) return 'Open form';
  }
  if (host === 'drive.google.com') return path.includes('/folders/') ? 'Open folder' : 'Open file';
  if (host.endsWith('bandcamp.com')) return 'Bandcamp';
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'YouTube';
  if (host.endsWith('spotify.com')) return 'Spotify';
  if (host.endsWith('soundcloud.com')) return 'SoundCloud';
  if (host.endsWith('notion.so') || host.endsWith('notion.site')) return 'Open in Notion';
  if (host.endsWith('dropbox.com')) return 'Dropbox';
  return `Open ${host}`;
}
function linkButton(url, label) {
  const href = safeUrl(url);
  if (!href) return null;
  return el('a', { class: 'link-button', href, target: '_blank', rel: 'noopener' }, label ?? linkLabel(href));
}
// Free text from Notion with any URLs turned into link buttons. Text stays text.
const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/g;
function richText(tag, attrs, text) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(URL_IN_TEXT)) {
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]]+$/);   // punctuation after a URL isn't part of it
    if (trail) url = url.slice(0, -trail[0].length);
    parts.push(text.slice(last, m.index));
    parts.push(linkButton(url));
    last = m.index + url.length;
  }
  // "...sheet: <url> . Used for" reads better without the space before the period.
  let rest = text.slice(last);
  parts.push(rest);
  for (let i = 1; i < parts.length; i += 1) {
    if (typeof parts[i] === 'string' && parts[i - 1] && typeof parts[i - 1] !== 'string') parts[i] = parts[i].replace(/^ +([.,;:])/, '$1');
  }
  return el(tag, attrs, ...parts.filter((x) => x !== ''));
}
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

// Demo mode: dev/preview.html sets window.gryceDemo to a fake client with
// made-up data, so developers can click through gryCE without an account.
// The live site never sets it, so this is always the real client there.
const supabase = window.gryceDemo?.client ?? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
    el('p', { class: 'small muted' }, 'First time here? ', el('a', { class: 'link-button', href: 'help.html' }, 'How to get in')),
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
    el('p', { class: 'muted' }, 'Text this email to Shaah so it can be added to your artist profile. Your page fills in within about 10 minutes after that.'),
    el('p', { class: 'small muted' }, 'gryCE is for GRYSKLL members right now. ', el('a', { class: 'link-button', href: 'help.html' }, 'Help getting in'))));
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
  return el('p', { class: 'pending small' }, `${what}. It shows up in Notion within 10 minutes.`);
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

// Section cards at the top of a page with several parts. Each one jumps to its
// group further down the same page, so nothing is hidden behind an extra tap.
function jumpCards(cards) {
  const shown = cards.filter(Boolean);
  if (shown.length < 2) return null;
  return el('div', { class: 'tiles jump' }, shown.map(({ title, count, sub, state, target }) =>
    el('button', {
      class: `tile${state ? ` ${state}` : ''}`, type: 'button',
      onclick: () => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    el('span', { class: 'tile-count' }, String(count)),
    el('span', { class: 'tile-title' }, title),
    sub && el('span', { class: 'tile-sub' }, sub))));
}
// A group with an id, so a jump card can find it.
const anchored = (id, node) => { if (node) node.id = id; return node; };
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
    richText('p', { class: 'ann-body' }, a.body),
    acked
      ? el('p', { class: 'small muted' }, `Acknowledged ${fmtDate(acked.acknowledged_at)}`)
      : viewingAs() ? el('p', { class: 'small muted' }, 'Not acknowledged yet')
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
    richText('p', { class: 'take-notes' }, t.notes),
    pending,
    isOpenTake(t) && !pending && updateForm('take', t.id, 'Submitted', { askLink: true }));
}

// Your tasks, grouped by their Project in Notion. Within a project: Now, then
// This week, then Later, then by due date. Projects with something marked Now come first.
const PRIORITY_RANK = { Now: 0, 'This week': 1, Later: 2 };
const priorityRank = (k) => PRIORITY_RANK[k.priority] ?? 1.5;
function tasksByProject(list) {
  const groups = new Map();
  for (const k of list) {
    const key = k.project || 'No project';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(k);
  }
  for (const g of groups.values()) g.sort((a, b) => priorityRank(a) - priorityRank(b) || byDue(a, b));
  const best = (g) => Math.min(...g.map(priorityRank));
  return [...groups].sort(([a, ga], [b, gb]) =>
    (a === 'No project') - (b === 'No project') || best(ga) - best(gb) || a.localeCompare(b));
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
      k.priority === 'Now' && el('span', { class: 'tag status-owed' }, 'Now'),
      k.priority === 'This week' && el('span', { class: 'tag doc-needs-input' }, 'This week'),
      k.status && el('span', { class: `tag task-${slug(k.status)}` }, k.status),
      due && el('span', { class: overdue ? 'due overdue' : 'due' }, overdue ? `Overdue · ${due}` : `Due ${due}`),
      linkButton(k.link)),
    richText('p', { class: 'take-notes' }, k.gryce_note),
    k.waiting_on && el('p', { class: 'take-notes' }, `Waiting on: ${k.waiting_on}`),
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
  // Not used: the deliverable was looked at and left off the song. Nothing is owed.
  const accepted = o.takes.filter((t) => t.status === 'Accepted' || t.status === 'Not used');
  const doneTasks = o.mine.filter((k) => !isOpenTask(k));
  const overdueTakes = o.openTakes.filter((t) => t.status === 'Owed' && isPast(t.due_date)).length;
  const doneCount = accepted.length + doneTasks.length + o.requests.read.length;
  return [
    jumpCards([
      o.requests.unread.length > 0 && { title: 'Requests', count: o.requests.unread.length, sub: 'Asked of everyone', state: 'hot', target: 'owe-requests' },
      o.openTakes.length > 0 && { title: 'Deliverables', count: o.openTakes.length, sub: overdueTakes ? `${overdueTakes} overdue` : 'Verses, beats, lyrics', state: overdueTakes ? 'bad' : 'hot', target: 'owe-takes' },
      o.openTasks.length > 0 && (() => {
        const late = o.openTasks.filter((k) => isPast(k.due_date)).length;
        return { title: 'Tasks', count: o.openTasks.length, sub: late ? `${late} overdue` : 'Assigned to you', state: late ? 'bad' : null, target: 'owe-tasks' };
      })(),
      o.docsToReview.length > 0 && { title: 'Documents', count: o.docsToReview.length, sub: 'For Leadership', state: 'hot', target: 'owe-docs' },
      submitted.length > 0 && { title: 'Submitted', count: submitted.length, sub: 'Waiting on review', target: 'owe-submitted' },
      doneCount > 0 && { title: 'Done', count: doneCount, sub: 'Finished', target: 'owe-done' },
    ]),
    panel('What you owe', countTag(o.count, o.count > 0),
      o.count === 0 && el('p', { class: 'muted' }, 'Nothing owed right now.'),
      anchored('owe-requests', o.requests.unread.length > 0 && group('amber', 'Requests', groupCount(o.requests.unread.length),
        el('ul', { class: 'takes' }, o.requests.unread.map((a) => announcementRow(a, null))))),
      anchored('owe-takes', o.openTakes.length > 0 && group('red', 'Deliverables', groupCount(o.openTakes.length),
        el('ul', { class: 'takes' }, o.openTakes.map(takeRow)))),
      anchored('owe-tasks', o.openTasks.length > 0 && group('blue', 'Tasks', groupCount(o.openTasks.length),
        ...tasksByProject(o.openTasks).map(([project, list]) => [
          el('h5', { class: 'sub-head' }, project, el('span', { class: 'muted' }, ` · ${list.length}`)),
          el('ul', { class: 'takes' }, list.map((k) => taskRow(k, true)))]).flat())),
      o.docsToReview.length > 0 && anchored('owe-docs', el('div', {}, docGroups(o.docsToReview))),
      anchored('owe-submitted', submitted.length > 0 && group('gray', 'Submitted, waiting on review', groupCount(submitted.length),
        el('ul', { class: 'takes' }, submitted.map(takeRow)))),
      anchored('owe-done', doneCount > 0 && group('green', 'Done', groupCount(doneCount),
        el('details', {},
          el('summary', {}, 'Show what’s finished'),
          el('ul', { class: 'takes' },
            o.requests.read.map((a) => announcementRow(a, o.ackBy.get(a.id))),
            accepted.map(takeRow),
            doneTasks.map((k) => taskRow(k, true))))))),
  ];
}

// Demos ---------------------------------------------------------------------
// Members share a demo (a Boombox or Google Drive link) for crew consideration.
// It shows here for everyone. The crew reacts; a comment goes only to the
// person who shared it and Leadership, and to Notion.

const REACTIONS = [['feeling', 'Feeling it'], ['want_on', 'Want on it'], ['not_for_me', 'Not for me']];
const DEMO_ROLES = [['Producer', 'the beat or track (Producer)'], ['Vocals', 'vocals'], ['Producer and vocals', 'the beat and vocals']];
const DEMO_STATUS_TONE = { Maybe: 'doc-needs-input', 'Picked up': 'status-accepted', Passed: '' };

function shareDemoForm() {
  const box = el('div', { class: 'update' });
  const closed = () => box.replaceChildren(
    el('button', { class: 'primary small', type: 'button', onclick: open }, 'Share a demo'));
  function open() {
    const title = el('input', { type: 'text', maxlength: '120', placeholder: 'Song title', required: true });
    const link = el('input', { type: 'url', maxlength: '500', placeholder: 'Boombox or Google Drive link (https://…)', required: true });
    const note = el('textarea', { rows: '3', maxlength: '1000', placeholder: 'What should the crew listen for? (optional)' });
    const role = el('select', { required: true },
      el('option', { value: '' }, 'Choose one'),
      DEMO_ROLES.map(([v, label]) => el('option', { value: v }, label)));
    const msg = el('p', { class: 'error small', hidden: true });
    const send = el('button', { class: 'primary small', type: 'submit' }, 'Share with the crew');
    box.replaceChildren(el('form', {
      class: 'update-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const row = { title: title.value.trim(), link: link.value.trim(), note: note.value.trim() || null, credit_role: role.value || null };
        if (!row.title) { msg.textContent = 'Give it a title.'; msg.hidden = false; return; }
        if (!row.credit_role) { msg.textContent = 'Pick how you’d be credited if it becomes a song.'; msg.hidden = false; return; }
        if (!/^https:\/\//i.test(row.link)) { msg.textContent = 'Links need to start with https://'; msg.hidden = false; return; }
        send.disabled = true;
        const { error } = await supabase.from('demos').insert(row);
        if (error) { send.disabled = false; msg.textContent = `Couldn’t share that: ${error.message}`; msg.hidden = false; return; }
        await refresh();
      },
    },
    el('p', { class: 'small muted' }, 'The whole crew sees it in Crew news. For a Google Drive file, set sharing to anyone with the link first.'),
    title, link, note,
    el('label', { class: 'small' }, 'If it becomes a GRYSKLL song, credit me for ', role),
    msg,
    el('div', { class: 'row' }, send, el('button', { class: 'link', type: 'button', onclick: closed }, 'Cancel'))));
    title.focus();
  }
  closed();
  return box;
}

function reactionControls(dm, mine) {
  const box = el('div', {});
  const draw = (picked, commentOpen) => {
    const comment = el('textarea', { rows: '2', maxlength: '280', placeholder: 'A line for whoever shared it (optional)' });
    if (mine?.comment) comment.value = mine.comment;
    const save = async (reaction, withComment) => {
      const row = { demo_id: dm.id, reaction, comment: withComment ? (comment.value.trim() || null) : (mine?.comment ?? null) };
      const { error } = await supabase.from('demo_reactions').upsert(row, { onConflict: 'demo_id,artist_id' });
      if (error) { box.append(el('p', { class: 'error small' }, `Couldn’t save that: ${error.message}`)); return; }
      await refresh();
    };
    box.replaceChildren(...[
      el('div', { class: 'reactions' }, REACTIONS.map(([k, label]) =>
        el('button', { class: `reaction${picked === k ? ' on' : ''}`, type: 'button', 'aria-pressed': String(picked === k),
          onclick: () => (viewingAs() ? null : save(k, false)) },
        `${label} `, el('span', { class: 'reaction-count' }, String(dm[k] ?? 0))))),
      picked && !commentOpen && !viewingAs() && el('button', { class: 'link', type: 'button', onclick: () => draw(picked, true) },
        mine?.comment ? 'Edit your comment' : 'Add a comment'),
      commentOpen && el('div', { class: 'update-form' }, comment,
        el('div', { class: 'row' },
          el('button', { class: 'primary small', type: 'button', onclick: () => save(picked, true) }, 'Send'),
          el('button', { class: 'link', type: 'button', onclick: () => draw(picked, false) }, 'Cancel'))),
      mine?.comment && !commentOpen && el('p', { class: 'small muted' }, `Your comment: ${mine.comment}`)].filter(Boolean));
  };
  draw(mine?.reaction ?? null, false);
  return box;
}

function demoRow(dm, d) {
  const mineDemo = dm.artist_id === me.id;
  const mine = (d.demoReactions ?? []).find((r) => r.demo_id === dm.id && r.artist_id === me.id);
  const comments = (d.demoComments ?? []).filter((c) => c.demo_id === dm.id);
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, dm.title),
      el('span', { class: 'take-name' }, `${mineDemo ? 'You' : dm.artist_name ?? 'A member'} · ${fmtDate(dm.created_at)}`)),
    el('div', { class: 'take-meta' },
      linkButton(dm.link, 'Listen'),
      dm.status && dm.status !== 'New' && el('span', { class: `tag ${DEMO_STATUS_TONE[dm.status] ?? ''}` }, dm.status),
      dm.hidden && el('span', { class: 'tag' }, 'Hidden')),
    dm.song_name && el('p', { class: 'pending small' }, `Now a GRYSKLL song: ${dm.song_name}. It’s in the works at Idea/Concept.`),
    richText('p', { class: 'ann-body' }, dm.note),
    mineDemo
      ? el('p', { class: 'small muted' }, REACTIONS.map(([k, label]) => `${label} ${dm[k] ?? 0}`).join(' · '))
      : reactionControls(dm, mine),
    comments.length > 0 && el('ul', { class: 'demo-comments' }, comments.map((c) =>
      el('li', {}, el('strong', {}, c.who), ` (${REACTIONS.find(([k]) => k === c.reaction)?.[1] ?? c.reaction}): ${c.comment}`))));
}

function demosOf(d) {
  const summary = new Map((d.demoSummary ?? []).map((x) => [x.demo_id, x]));
  return (d.demos ?? []).map((dm) => ({ ...dm, ...(summary.get(dm.id) ?? {}), id: dm.id }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
// Demos from others shared in the last 30 days that you haven't reacted to yet.
function demosToHear(d) {
  const reacted = new Set((d.demoReactions ?? []).filter((r) => r.artist_id === me.id).map((r) => r.demo_id));
  const since = Date.now() - 30 * 864e5;
  return demosOf(d).filter((x) => x.artist_id !== me.id && !reacted.has(x.id) && !x.hidden && new Date(x.created_at) > since);
}

function demosPanel(d) {
  const all = demosOf(d);
  const hear = new Set(demosToHear(d).map((x) => x.id));
  const fresh = all.filter((x) => hear.has(x.id));
  const rest = all.filter((x) => !hear.has(x.id));
  return panel('Demos', fresh.length > 0 && countTag(fresh.length, true),
    el('p', { class: 'small muted' }, 'New music from the crew, for crew consideration. Listen, react, and leave a line for whoever shared it.'),
    !viewingAs() && shareDemoForm(),
    fresh.length > 0 && group('blue', 'New to you', groupCount(fresh.length), el('ul', { class: 'takes' }, fresh.map((x) => demoRow(x, d)))),
    rest.length > 0 && group('gray', fresh.length ? 'Earlier' : 'Shared demos', groupCount(rest.length), el('ul', { class: 'takes' }, rest.map((x) => demoRow(x, d)))),
    all.length === 0 && el('p', { class: 'muted' }, 'No demos yet. Be the first.'));
}

function newsView(d) {
  const ackBy = new Map(d.acks.map((k) => [k.announcement_id, k]));
  const { unread, read } = splitRead(d.announcements.filter((a) => !isRequest(a)), ackBy);
  return [panel('Crew news', unread.length > 0 && countTag(unread.length, true),
    unread.length
      ? group('amber', 'New', groupCount(unread.length), el('ul', { class: 'takes' }, unread.map((a) => announcementRow(a, null))))
      : el('p', { class: 'muted' }, 'You’re caught up.'),
    read.length > 0 && group('gray', 'Read', groupCount(read.length),
      el('details', {},
        el('summary', {}, 'Show read news'),
        el('ul', { class: 'takes' }, read.map((a) => announcementRow(a, ackBy.get(a.id))))))),
  demosPanel(d)];
}

const crewTasksOf = (d) => d.tasks.filter((k) => k.is_crew && !(k.assignee_ids ?? []).includes(me.id));

// Group effort: a crew task linked to the takes it depends on. Leads with
// progress and who's in, then who's still to go, in amber, never red.
const IN_STATUSES = ['Submitted', 'Accepted'];
function effortCard(k, takes) {
  const mine = takes.filter((t) => t.task_id === k.id && t.status !== 'Not used');
  const done = mine.filter((t) => IN_STATUSES.includes(t.status));
  const toGo = mine.filter((t) => !IN_STATUSES.includes(t.status));
  const pct = mine.length ? Math.round((done.length / mine.length) * 100) : 0;
  const byPerson = (list) => {
    const m = new Map();
    for (const t of list) {
      const who = t.who ?? 'Someone';
      if (!m.has(who)) m.set(who, []);
      m.get(who).push(t.song ?? t.type ?? 'Deliverable');
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const link = safeUrl(k.link);
  return group(toGo.length === 0 && mine.length ? 'green' : 'blue', k.name, groupCount(`${done.length}/${mine.length}`),
    richText('p', { class: 'small' }, k.gryce_note),
    link && el('p', { class: 'small' }, linkButton(link)),
    el('p', { class: 'effort-line' },
      toGo.length === 0 && mine.length
        ? 'All in. Thank you, crew.'
        : `${done.length} of ${mine.length} in. ${toGo.length === 1 ? 'One to go.' : `${toGo.length} to go.`}`),
    el('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
      el('span', { style: `width: ${pct}%` })),
    done.length > 0 && group('green', 'In, thank you', groupCount(done.length),
      el('p', { class: 'small' }, byPerson(done).map(([who]) => who).join(', '))),
    toGo.length > 0 && group('amber', 'Still to go', groupCount(toGo.length),
      el('p', { class: 'small muted' }, 'If you know these folks, check in and see if they need a hand.'),
      el('ul', { class: 'takes' }, byPerson(toGo).map(([who, songs]) => el('li', { class: 'take' },
        el('div', { class: 'take-main' },
          el('span', { class: 'take-song' }, who),
          el('span', { class: 'take-name' }, songs.join(', '))))))));
}

function crewView(d) {
  const crew = crewTasksOf(d);
  // Crew tasks with linked takes are group efforts and get their own card.
  const efforts = crew.filter((k) => (k.linked_take_ids ?? []).length > 0 && isOpenTask(k));
  const effortIds = new Set(efforts.map((k) => k.id));
  const open = crew.filter(isOpenTask).filter((k) => !effortIds.has(k.id)).sort(byDue);
  const done = crew.filter((k) => !isOpenTask(k));
  const late = open.filter((k) => isPast(k.due_date));
  const notLate = open.filter((k) => !isPast(k.due_date));
  const byStatus = (st) => notLate.filter((k) => (k.status ?? 'Not started') === st);
  const known = ['In progress', 'Waiting on someone', 'Not started'];
  const otherOpen = notLate.filter((k) => !known.includes(k.status ?? 'Not started'));
  const g = (tone, title, list) => list.length > 0 && group(tone, title, groupCount(list.length),
    el('ul', { class: 'takes' }, list.map((k) => taskRow(k, false))));
  return [
    efforts.length > 0 && panel(efforts.length === 1 ? 'Group effort' : 'Group efforts', countTag(efforts.length, true),
      el('p', { class: 'small muted' }, 'Things the whole crew is finishing together. Everyone can see where they stand.'),
      efforts.map((k) => effortCard(k, d.effortTakes ?? []))),
    panel('Crew tasks', countTag(open.length),
    open.length === 0 && el('p', { class: 'muted' }, 'No crew tasks open right now.'),
    g('red', 'Overdue', late),
    g('blue', 'In progress', byStatus('In progress')),
    g('orange', 'Waiting on someone', byStatus('Waiting on someone')),
    g('amber', 'Not started', byStatus('Not started')),
    g('gray', 'Open', otherOpen),
    done.length > 0 && group('green', 'Done', groupCount(done.length),
      el('details', {},
        el('summary', {}, 'Show finished tasks'),
        el('ul', { class: 'takes' }, done.map((k) => taskRow(k, false)))))),
  ];
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
    richText('p', { class: 'take-notes' }, i.notes));
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
  // Each stage is its own colored box: done green, open amber, not started gray.
  const tone = s.status === 'Complete' ? 'green' : s.status === 'Underway' ? 'amber' : 'gray';
  return group(tone, stageLabel(s), el('span', { class: 'take-name' }, goal > 0 ? `${raised} of ${money(goal)}` : `${raised} raised`),
    el('div', { class: 'take-meta' }, s.status && el('span', { class: `tag stage-${slug(s.status)}` }, s.status)),
    its.length > 0 && el('ul', { class: 'takes' }, its.map(itemRow)));
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
  const allPane = el('div', { class: 'pane', hidden: true }, list.map((s) => stageRow(s, itemsByStage)));

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

function projectsView(d, onlyId) {
  const itemsByStage = new Map();
  for (const i of d.items) {
    if (!itemsByStage.has(i.stage_id)) itemsByStage.set(i.stage_id, []);
    itemsByStage.get(i.stage_id).push(i);
  }
  const list = projectsOf(d).filter((x) => !onlyId || x.id === onlyId);
  if (list.length === 0) return panel('Active project', null, el('p', { class: 'muted' }, 'No active projects right now.'));
  return list.map(({ id, name, p, stages }) => panel(name, p?.status && el('span', { class: 'pill' }, p.status),
    p?.release_date && el('p', { class: 'release' }, `Release: ${new Date(`${p.release_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`),
    richText('p', { class: 'ann-body' }, p?.summary),
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
      el('span', {}, s.name),
      el('span', { class: 'roles' }, s.roles.join(' · '))),
    el('div', { class: 'song-meta' },
      !isReleased(s) && s.development_stage && el('span', { class: 'tag' }, s.development_stage),
      s.owes && el('span', { class: 'tag status-owed' }, 'Owed'),
      link && linkButton(link, 'Listen'),
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
    if (s.roles.length === 0) s.roles.push(t.type ? `${t.type} owed` : 'Deliverable owed');
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
  const owes = working.filter((s) => s.owes);
  const rest = working.filter((s) => !s.owes);
  const stages = [...new Set(rest.map((s) => s.development_stage ?? 'No stage yet'))]
    .sort((a, b) => stageRank(a) - stageRank(b));
  // Closer to release reads greener.
  const toneFor = (st) => {
    const r = stageRank(st);
    return r <= 3 ? 'green' : r <= 6 ? 'orange' : r <= 9 ? 'blue' : 'gray';
  };
  return panel('In the works', countTag(working.length),
    working.length === 0 && el('p', { class: 'muted' }, 'No songs in the works with your name on them.'),
    owes.length > 0 && group('red', 'You owe something', groupCount(owes.length), el('ul', { class: 'songs' }, owes.map(songRow))),
    stages.map((st) => {
      const list = rest.filter((s) => (s.development_stage ?? 'No stage yet') === st);
      return group(toneFor(st), st, groupCount(list.length), el('ul', { class: 'songs' }, list.map(songRow)));
    }));
}

function discographyView(d) {
  const released = releasedOf(d.songs);
  const yearOf = (s) => (s.release_date ? s.release_date.slice(0, 4) : 'Date not set');
  const years = [...new Set(released.map(yearOf))].sort((a, b) => b.localeCompare(a));
  return panel('Discography', countTag(released.length),
    released.length === 0 && el('p', { class: 'muted' }, 'Nothing released with your name on it yet.'),
    years.map((y, i) => {
      const list = released.filter((s) => yearOf(s) === y);
      return group(i === 0 && y !== 'Date not set' ? 'green' : 'blue', y, groupCount(list.length), el('ul', { class: 'songs' }, list.map(songRow)));
    }));
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
        el('strong', {}, data), ` issued. It reaches Notion within 10 minutes. `, copyButton(data)));
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

// Mix queue (Mix Queue members only) ------------------------------------------
// Every unreleased song in a mix stage, in the order the work happens. Q runs
// the queue and Shaah backs him up. Stages change in Notion; this reads them.

const MIX_GROUPS = [
  { order: 1, tone: 'blue', title: 'Mixing now' },
  { order: 2, tone: 'amber', title: 'Up next: mix prep' },
  { order: 3, tone: 'orange', title: 'Mastering' },
  { order: 4, tone: 'orange', title: 'Re-mastering' },
  { order: 5, tone: 'red', title: 'Waiting on mix funding' },
];

const MIX_EDIT_STAGES = ['Awaiting Mix Funding', 'Mixing Prep', 'Mixing', 'Mastering', 'Re-Mastering', 'Release Ready'];
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// Edit a queued song: stage, mixer, mastering engineer. Goes to Notion on the next sync.
function mixEditor(q) {
  const box = el('div', { class: 'update' });
  const people = current.mixPeople ?? [];
  const closed = () => box.replaceChildren(
    el('button', { class: 'ghost', type: 'button', onclick: open }, 'Edit'));
  function picks(name, filterFn, chosen) {
    return el('fieldset', { class: 'picks' }, el('legend', {}, name),
      people.filter((x) => filterFn(x) || chosen.includes(x.id)).map((x) =>
        el('label', { class: 'pick' }, el('input', { type: 'checkbox', value: x.id, ...(chosen.includes(x.id) && { checked: true }) }), ` ${x.name}`)));
  }
  function open() {
    const stage = el('select', {}, MIX_EDIT_STAGES.map((st) => el('option', { value: st, ...(st === q.stage && { selected: true }) }, st)));
    const mixers = picks('Mixing', (x) => x.mixes, q.mixer_ids ?? []);
    const masters = picks('Mastering', (x) => x.masters, q.mastering_ids ?? []);
    const msg = el('p', { class: 'error small', hidden: true });
    const send = el('button', { class: 'primary small', type: 'submit' }, 'Save');
    const checked = (fs) => [...fs.querySelectorAll('input:checked')].map((i) => i.value);
    box.replaceChildren(el('form', {
      class: 'update-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const row = { song_id: q.song_id };
        if (stage.value !== q.stage) row.new_stage = stage.value;
        const m = checked(mixers), ms = checked(masters);
        if (!sameSet(m, q.mixer_ids ?? [])) row.mixer_ids = m;
        if (!sameSet(ms, q.mastering_ids ?? [])) row.mastering_ids = ms;
        if (Object.keys(row).length === 1) { msg.textContent = 'Nothing changed.'; msg.hidden = false; return; }
        send.disabled = true;
        const { error } = await supabase.from('song_updates').insert(row);
        if (error) { send.disabled = false; msg.textContent = `Couldn’t save that: ${error.message}`; msg.hidden = false; return; }
        await refresh();
      },
    },
    el('label', { class: 'small' }, 'Stage ', stage), mixers, masters, msg,
    el('div', { class: 'row' }, send, el('button', { class: 'link', type: 'button', onclick: closed }, 'Cancel'))));
  }
  closed();
  return box;
}

function pendingMix(q) {
  const u = q.pending;
  if (!u) return null;
  const names = new Map((current.mixPeople ?? []).map((x) => [x.id, x.name]));
  const list = (ids) => (ids.length ? ids.map((id) => names.get(id) ?? 'someone').join(', ') : 'nobody');
  const parts = [u.stage && `stage to ${u.stage}`, u.mixer_ids && `mixer to ${list(u.mixer_ids)}`, u.mastering_ids && `mastering to ${list(u.mastering_ids)}`].filter(Boolean);
  if (u.attempts >= 5) return el('p', { class: 'error small' }, 'That change didn’t reach Notion. Tell Shaah so he can check it.');
  return el('p', { class: 'pending small' }, `${u.by ?? 'Someone'} set ${parts.join(', ')}. It reaches Notion within 10 minutes.`);
}

function mixRow(q) {
  const owed = (q.owed ?? []).filter((o) => o.status !== 'Submitted');
  const inForReview = (q.owed ?? []).filter((o) => o.status === 'Submitted');
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, q.song),
      q.project && el('span', { class: 'take-name' }, q.project)),
    el('div', { class: 'take-meta' },
      el('span', { class: 'tag' }, q.mixers ? `Mix: ${q.mixers}` : 'No mixer set'),
      q.mastering && el('span', { class: 'tag' }, `Master: ${q.mastering}`),
      q.target_release_date && el('span', { class: 'due' }, `Target ${fmtDate(q.target_release_date)}`)),
    owed.length > 0 && el('p', { class: 'take-notes' },
      'Still owed: ', owed.map((o) => `${o.type ?? 'Deliverable'} from ${o.who}`).join(', ')),
    inForReview.length > 0 && el('p', { class: 'take-notes' },
      'In, waiting on review: ', inForReview.map((o) => `${o.type ?? 'Deliverable'} from ${o.who}`).join(', ')),
    pendingMix(q),
    !viewingAs() && !q.pending && mixEditor(q));
}

function mixView(d) {
  const q = d.mixQueue ?? [];
  const groups = MIX_GROUPS.map((g) => ({ ...g, rows: q.filter((x) => x.queue_order === g.order) })).filter((g) => g.rows.length);
  const blocked = q.filter((x) => (x.owed ?? []).some((o) => o.status !== 'Submitted')).length;
  return [
    jumpCards(groups.map((g) => ({ title: g.title, count: g.rows.length, target: `mix-${g.order}`, state: g.order === 1 ? 'hot' : null }))),
    panel('Mix queue', countTag(q.length),
      el('p', { class: 'small muted' }, q.length
        ? `${q.length} songs in a mix stage${blocked ? `, ${blocked} still waiting on a deliverable` : ''}. Tap Edit to change a song's stage, mixer or mastering engineer. Notion catches up within 10 minutes.`
        : 'Nothing in a mix stage right now.'),
      ...groups.map((g) => anchored(`mix-${g.order}`,
        group(g.tone, g.title, groupCount(g.rows.length), el('ul', { class: 'takes' }, g.rows.map(mixRow)))))),
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
      el('span', { class: 'take-name' }, x.name ?? '')),
    el('div', { class: 'take-meta' },
      x.status && el('span', { class: `tag doc-${slug(x.status)}` }, x.status),
      x.date_submitted && el('span', { class: 'muted' }, `Submitted ${fmtDate(x.date_submitted)}`),
      x.date_approved && el('span', { class: 'muted' }, `Approved ${fmtDate(x.date_approved)}`),
      link ? linkButton(link) : el('span', { class: 'muted' }, 'No link yet')),
    richText('p', { class: 'take-notes' }, x.notes));
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

function leadershipParts(d) {
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
  return {
    waiting: panel('Waiting on Leadership', countTag(waiting, waiting > 0),
      waiting
        ? docGroups(toReview)
        : el('p', { class: 'muted' }, 'No documents waiting on Leadership.')),
    registry: panel('Document registry', countTag(docs.length),
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
    contributions: panel('Contributions', countTag(contribs.length),
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
  };
}

// Leadership hub: section cards, each opening its own page.
function leadershipView(d) {
  const waiting = docsWaiting(d).length;
  const contribs = d.leadership?.contributions ?? [];
  const total = contribs.reduce((n, c) => n + (Number(c.amount) || 0), 0);
  return el('div', { class: 'tiles' },
    tile('leadership/documents', 'Documents', String(waiting),
      waiting ? 'Waiting on Leadership' : `${(d.leadership?.documents ?? []).length} in the registry`,
      waiting ? 'hot' : null),
    tile('leadership/contributions', 'Contributions', String(contribs.length), `${money(total)} from ${new Set(contribs.map((c) => c.contributor_name ?? c.artist_name)).size} people`));
}
const leadDocsView = (d) => { const x = leadershipParts(d); return [x.waiting, x.registry]; };
const leadContribView = (d) => leadershipParts(d).contributions;

// Every project: the active one (Show in gryCE) at the top with its full card,
// then the rest grouped by status.
const PROJECT_SECTIONS = [
  ['In Production', 'blue'],
  ['Mixing & Mastering', 'orange'],
  ['Planning', 'amber'],
  ['On Hold', 'red'],
  ['Concept', 'gray'],
  ['Released', 'green'],
];
function projectTile(p, active) {
  const n = p.song_count ?? 0;
  const when = p.release_date && `${p.status === 'Released' ? 'Out' : 'Target'} ${fmtDate(p.release_date)}`;
  return el('a', { class: `tile${active ? ' hot' : ''}`, href: `#projects/${p.id}` },
    el('span', { class: 'tile-count' }, String(n)),
    el('span', { class: 'tile-title' }, p.name),
    el('span', { class: 'tile-sub' }, [n === 1 ? 'song' : 'songs', p.type, when].filter(Boolean).join(' · ')),
    p.leadership_only && el('span', { class: 'tag status-needs-decision tile-flag' }, 'Leadership only'));
}

// Projects: a card per project. Active first, then the rest grouped by status.
function projectsPage(d) {
  const active = projectsOf(d);
  const activeIds = new Set(active.map((p) => p.id));
  const index = new Map((d.allProjects ?? []).map((p) => [p.id, p]));
  const others = (d.allProjects ?? []).filter((p) => !activeIds.has(p.id))
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.name.localeCompare(b.name));
  const known = new Set(PROJECT_SECTIONS.map(([st]) => st));
  const cards = (list) => el('div', { class: 'tiles cards' }, list);
  return [
    active.length > 0 && group('green', 'Active', groupCount(active.length),
      cards(active.map(({ id, name, p }) => projectTile({
        ...(index.get(id) ?? {}), id, name, status: p?.status, release_date: p?.release_date,
        song_count: index.get(id)?.song_count ?? p?.songs?.length ?? 0,
      }, true)))),
    ...PROJECT_SECTIONS.map(([status, tone]) => {
      const list = others.filter((p) => p.status === status);
      return list.length > 0 && group(tone, status, groupCount(list.length), cards(list.map((p) => projectTile(p))));
    }),
    (() => {
      const list = others.filter((p) => !known.has(p.status));
      return list.length > 0 && group('gray', 'No status', groupCount(list.length), cards(list.map((p) => projectTile(p))));
    })(),
    (d.allProjects ?? []).length === 0 && active.length === 0
      && el('p', { class: 'muted' }, 'Projects show after the next sync.'),
  ];
}

// The active project's live parts, without repeating its name and status.
function activeBlocks(d, id) {
  const itemsByStage = new Map();
  for (const i of d.items) {
    if (!itemsByStage.has(i.stage_id)) itemsByStage.set(i.stage_id, []);
    itemsByStage.get(i.stage_id).push(i);
  }
  const proj = projectsOf(d).find((x) => x.id === id);
  if (!proj) return null;
  const { p, stages } = proj;
  return panel('Where it stands', null,
    richText('p', { class: 'ann-body' }, p?.summary),
    outstandingBlock(p?.songs),
    songsBlock(p?.songs),
    fundingBlock(stages, itemsByStage, d.contributions.filter((c) => c.project_id === id)));
}

// One project, opened from its card. The active project gets its full card
// (outstanding, songs, funding). Every project lists its songs by stage.
function projectDetail(d, id) {
  const ix = (d.allProjects ?? []).find((p) => p.id === id);
  const isActive = projectsOf(d).some((p) => p.id === id);
  if (!ix && !isActive) return panel('Project', null, el('p', { class: 'muted' }, 'This project isn’t in gryCE right now.'));
  const songs = ix?.songs ?? [];
  const stages = [...new Set(songs.map((x) => x.stage ?? 'No stage yet'))].sort((a, b) => stageRank(a) - stageRank(b));
  const toneFor = (st) => { const r = stageRank(st); return r === 0 ? 'green' : r <= 3 ? 'green' : r <= 6 ? 'orange' : r <= 9 ? 'blue' : 'gray'; };
  return [
    ix && panel(ix.name, ix.status && el('span', { class: 'pill' }, ix.status),
      el('div', { class: 'take-meta' },
        ix.type && el('span', { class: 'tag' }, ix.type),
        ix.leadership_only && el('span', { class: 'tag status-needs-decision' }, 'Leadership only'),
        ix.release_date && el('span', { class: 'muted' }, `${ix.status === 'Released' ? 'Released' : 'Target'} ${fmtDate(ix.release_date)}`),
        (() => { const n = ix.song_count ?? songs.length; return el('span', { class: 'muted' }, `${n} song${n === 1 ? '' : 's'}${ix.released_count ? `, ${ix.released_count} out` : ''}`); })()),
      richText('p', { class: 'ann-body' }, ix.description)),
    isActive && activeBlocks(d, id),
    !isActive && panel('Songs', countTag(songs.length),
      songs.length === 0 && el('p', { class: 'muted' }, 'No songs on this project yet.'),
      stages.map((st) => {
        const list = songs.filter((x) => (x.stage ?? 'No stage yet') === st).sort((a, b) => a.name.localeCompare(b.name));
        return group(toneFor(st), st, groupCount(list.length),
          el('ul', { class: 'songs' }, list.map((x) => el('li', { class: 'song' },
            el('div', { class: 'song-main' }, el('span', {}, x.name)),
            x.released && x.stage !== 'Released' && el('div', { class: 'song-meta' }, el('span', { class: 'tag dev-released' }, 'Out now'))))));
      })),
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
    (() => {
      const demos = demosToHear(d).length;
      const n = news.unread.length + demos;
      const sub = demos && news.unread.length ? `Unread, ${demos} new demo${demos === 1 ? '' : 's'}` : demos ? `${demos} new demo${demos === 1 ? '' : 's'}` : news.unread.length ? 'Unread' : 'Caught up';
      return tile('news', 'Crew news', String(n), sub, n ? 'hot' : null);
    })(),
    tile('crew', 'Crew tasks', String(crewOpen), crewOpen ? 'Open' : 'None open'),
    (() => {
      const total = Math.max(d.allProjects?.length ?? 0, projects.length);
      return tile('projects', 'Projects', String(total),
        projects.length === 1 ? `Active: ${projects[0].name}` : projects.length ? `${projects.length} active` : 'In the pipeline');
    })(),
    tile('works', 'In the works', String(working), working === 1 ? 'Song' : 'Songs'),
    tile('discography', 'Discography', String(released), 'Released'),
    me?.isrc_admin && !viewingAs() && (() => {
      const songs = d.isrc?.songs ?? [];
      const codedIds = new Set((d.isrc?.codes ?? []).map((c) => c.song_id));
      const open = songs.filter((s) => !isrcOf(s) && !codedIds.has(s.id)).length;
      return tile('isrc', 'ISRC codes', String(open), open === 1 ? 'Song without a code' : 'Songs without a code');
    })(),
    me?.mix_queue && (() => {
      const q = d.mixQueue ?? [];
      const now = q.filter((x) => x.queue_order === 1).length;
      return tile('mix', 'Mix queue', String(q.length), now ? `${now} mixing now` : q.length ? 'Songs in a mix stage' : 'Nothing queued', now ? 'hot' : null);
    })(),
    me?.leadership && (() => {
      const waiting = docsWaiting(d).length;
      return tile('leadership', 'Leadership', String(waiting), waiting ? (waiting === 1 ? 'Doc waiting on you' : 'Docs waiting on you') : 'Nothing waiting', waiting ? 'hot' : null);
    })(),
    support?.is_support && !viewingAs() && tile('support', 'Support', 'View as', 'See gryCE as a member sees it'));
}
const homeHelp = () => el('a', { class: 'ghost help-button', href: '#help' }, 'How gryCE works');

const VIEWS = { 'leadership/documents': leadDocsView, 'leadership/contributions': leadContribView, owe: oweView, news: newsView, crew: crewView, projects: projectsPage, works: worksView, discography: discographyView, help: helpView, isrc: isrcView, mix: mixView, leadership: leadershipView, support: supportView };
const VIEW_TITLES = { owe: 'What you owe', news: 'Crew news', crew: 'Crew tasks', projects: 'Projects', works: 'In the works', discography: 'Discography', help: 'Help', isrc: 'ISRC codes', mix: 'Mix queue', leadership: 'Leadership',
  'leadership/documents': 'Documents', 'leadership/contributions': 'Contributions', support: 'Support' };
// Sections only some members get. Anyone else who types the address lands on Home.
const allowed = (key) => (key === 'isrc' ? me?.isrc_admin && !viewingAs()
  : key === 'mix' ? me?.mix_queue
  : key === 'support' ? support?.is_support && !viewingAs()
  : key.startsWith('leadership') ? me?.leadership : true);

// Support: View as (Support only) -------------------------------------------
// A Support member can see gryCE exactly as another member does, read only.
// The database does the work: while a session is open it answers every query
// as that member and refuses writes. Sessions end on Exit or after 30 minutes.

let support = null;   // { is_support, viewing_id, viewing_name, expires_at } or null

const viewingAs = () => Boolean(support?.viewing_id);

function viewBanner() {
  if (!viewingAs()) return null;
  const until = new Date(support.expires_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return el('div', { class: 'view-as-banner', role: 'status' },
    el('p', {}, el('strong', {}, `Viewing as ${support.viewing_name}`), ` · read only · ends ${until}`),
    el('button', { class: 'primary small', type: 'button', onclick: async (e) => {
      e.currentTarget.disabled = true;
      await supabase.rpc('stop_view_as');
      location.hash = '#support';
      await reload();
    } }, 'Exit'));
}

function supportView() {
  const box = el('div', {}, el('p', { class: 'muted' }, 'Loading members…'));
  supabase.rpc('support_members').then(({ data, error }) => {
    if (error) return box.replaceChildren(el('p', { class: 'error' }, `Couldn’t load members: ${error.message}`));
    const msg = el('p', { class: 'error small', hidden: true });
    box.replaceChildren(
      el('ul', { class: 'takes' }, (data ?? []).map((m) => el('li', { class: 'take' },
        el('div', { class: 'take-main' },
          el('span', { class: 'take-song' }, m.name),
          el('button', { class: 'ghost small', type: 'button', onclick: async (e) => {
            e.currentTarget.disabled = true;
            const { error: err } = await supabase.rpc('start_view_as', { p_artist_id: m.id });
            if (err) { e.currentTarget.disabled = false; msg.textContent = err.message; msg.hidden = false; return; }
            location.hash = '';
            await reload();
          } }, 'View as'))))),
      msg);
  });
  return panel('View as a member',
    el('p', { class: 'small muted' }, 'See gryCE exactly as a member sees it, to help them. It’s read only, ends after 30 minutes, and every view is logged for Leadership.'),
    box);
}

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
  // A single project: #projects/<id>
  if (key.startsWith('projects/')) {
    const id = key.slice('projects/'.length);
    const name = (current.allProjects ?? []).find((p) => p.id === id)?.name
      ?? projectsOf(current).find((p) => p.id === id)?.name ?? 'Project';
    show(el('nav', { class: 'crumbs' },
      el('a', { class: 'back', href: '#projects' }, '‹ Projects'),
      el('span', { class: 'here' }, name)), projectDetail(current, id));
    window.scrollTo(0, 0);
    return;
  }
  const view = allowed(key) ? VIEWS[key] : null;
  if (view) {
    // Sub-pages (leadership/…) step back to their section, not Home.
    const parent = key.includes('/') ? key.split('/')[0] : null;
    show(el('nav', { class: 'crumbs' },
      parent ? el('a', { class: 'back', href: `#${parent}` }, `‹ ${VIEW_TITLES[parent]}`) : backLink(),
      el('span', { class: 'here' }, VIEW_TITLES[key])), view(current));
  } else {
    show(el('div', { class: 'home-head' }, el('p', { class: 'eyebrow' }, `Peace, ${me.name}`), homeHelp()),
      !viewingAs() && el('div', { class: 'home-share' }, shareDemoForm()),
      homeView(current));
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
async function loadMixQueue() {
  if (!me?.mix_queue || !current) return;
  [current.mixQueue, current.mixPeople] = await Promise.all([
    optionalRows(supabase.rpc('mix_queue'), 'mix queue'),
    optionalRows(supabase.rpc('mix_people'), 'mix people'),
  ]);
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
  const [takesRes, creditsRes, tasks, announcements, acks, updates, stages, items, contributions, projects, allProjects, effortTakes, demos, demoSummary, demoReactions, demoComments] = await Promise.all([
    supabase.from('takes')
      .select(`id, name, type, status, due_date, notes, song:songs(${SONG_FIELDS})`)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('song_credits').select(`role, song:songs(${SONG_FIELDS})`),
    optionalRows(supabase.from('tasks').select('*'), 'tasks'),
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
    // Every GRYSKLL project, so the whole crew sees what's in the pipeline.
    optionalRows(supabase.from('project_index').select('*'), 'all projects'),
    optionalRows(supabase.rpc('group_effort_takes'), 'group efforts'),
    // Demos the crew shared, their reaction counts, your own reactions, and
    // comments on your demos (or every demo, for Leadership).
    optionalRows(supabase.from('demos').select('*'), 'demos'),
    optionalRows(supabase.rpc('demo_summary'), 'demo summary'),
    optionalRows(supabase.from('demo_reactions').select('demo_id, artist_id, reaction, comment'), 'demo reactions'),
    optionalRows(supabase.rpc('demo_comments'), 'demo comments'),
  ]);
  const err = takesRes.error || creditsRes.error;
  if (err) return show(el('p', { class: 'error' }, `Couldn’t load your data: ${err.message}. Refresh to try again.`));

  pendingByItem = new Map(updates.map((u) => [`${u.item_type}:${u.item_id}`, u]));
  current = {
    takes: takesRes.data, tasks, announcements, acks, stages, items, contributions, projects, allProjects, effortTakes,
    demos, demoSummary, demoReactions, demoComments,
    songs: collectSongs(creditsRes.data, takesRes.data),
  };
  await Promise.all([loadIsrc(), loadLeadership(), loadMixQueue()]);
  const y = window.scrollY;
  draw();
  window.scrollTo(0, y);
}

async function render(session) {
  if (!session) return signInView();

  const email = session.user.email;
  // Leadership and ISRC Admin come with v0.4.1. Before its SQL runs, those columns
  // don't exist, so fall back to the basics.
  let { data, error: meErr } = await supabase.from('artists').select('id, name, leadership, isrc_admin, mix_queue').maybeSingle();
  // Mix Queue comes with v0.4.24. If the database doesn't have it yet, or
  // doesn't let members read it yet, load without it.
  if (meErr && /column|permission denied/i.test(meErr.message)) {
    ({ data, error: meErr } = await supabase.from('artists').select('id, name, leadership, isrc_admin').maybeSingle());
  }
  if (meErr && /column|permission denied/i.test(meErr.message)) {
    ({ data, error: meErr } = await supabase.from('artists').select('id, name').maybeSingle());
  }
  if (meErr) return show(el('p', { class: 'error' }, `Couldn’t load your profile: ${meErr.message}`));
  if (!data) return notLinkedView(email);
  me = data;
  support = null;
  {
    const { data: st, error: stErr } = await supabase.rpc('support_status');
    if (!stErr) support = (Array.isArray(st) ? st[0] : st) ?? null;
  }
  document.body.classList.toggle('viewing-as', viewingAs());
  // Linked members get the full help inside gryCE. Everyone else gets the sign-in help page.
  document.getElementById('help-link').href = '#help';

  document.getElementById('who-name').textContent = viewingAs() ? `${me.name} (View as)` : me.name;
  document.getElementById('who').hidden = false;
  await refresh();
}

let renderedFor;
let lastSession = null;
// After starting or ending View as, load everything again as the new identity.
async function reload() {
  current = null;
  show(el('p', { class: 'muted' }, 'Loading…'));
  await render(lastSession);
}
const renderOnce = (s) => {
  const key = s?.user?.id ?? 'signed-out';
  if (key === renderedFor) return;
  renderedFor = key;
  lastSession = s;
  render(s);
};

const { data: { session } } = await supabase.auth.getSession();
renderOnce(session);
supabase.auth.onAuthStateChange((event, s) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') renderOnce(s);
});
