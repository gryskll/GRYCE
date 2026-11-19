import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

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
const show = (...nodes) => app.replaceChildren(...nodes);
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
    el('p', { class: 'eyebrow' }, 'GRYSKLL members'),
    el('h1', {}, 'Your takes. Your catalog.'),
    el('p', { class: 'muted' }, 'Sign in with the Google account GRYSKLL has on file for you.'),
    error && el('p', { class: 'error' }, error),
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
    el('p', { class: 'muted' }, 'Send this email to Shaah so it can be added to your artist profile. Your page fills in within about 30 minutes after that.')));
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

// Announcements -----------------------------------------------------------

function announcementCard(a, acked) {
  const msg = el('p', { class: 'error small', hidden: true });
  return el('li', { class: acked ? 'announcement read' : 'announcement' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, a.title),
      a.publish_date && el('span', { class: 'take-name' }, fmtDate(a.publish_date))),
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

function announcementsSection(announcements, acks) {
  if (announcements.length === 0) return null;
  const ackBy = new Map(acks.map((k) => [k.announcement_id, k]));
  const sorted = [...announcements].sort((a, b) => (b.publish_date ?? '').localeCompare(a.publish_date ?? ''));
  const unread = sorted.filter((a) => !ackBy.has(a.id));
  const read = sorted.filter((a) => ackBy.has(a.id));
  return el('section', { class: unread.length ? 'card attention' : 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Crew news'),
      unread.length > 0 && el('span', { class: 'count hot' }, String(unread.length))),
    unread.length
      ? el('ul', { class: 'takes' }, unread.map((a) => announcementCard(a, null)))
      : el('p', { class: 'muted' }, 'You’re caught up.'),
    read.length > 0 && el('details', {},
      el('summary', {}, `Read (${read.length})`),
      el('ul', { class: 'takes' }, read.map((a) => announcementCard(a, ackBy.get(a.id))))));
}

// Takes -------------------------------------------------------------------

const OPEN = ['Owed', 'Needs Decision'];
const isOpenTake = (t) => !t.status || OPEN.includes(t.status);

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

function takesSection(takes) {
  const open = takes.filter(isOpenTake);
  const submitted = takes.filter((t) => t.status === 'Submitted');
  const done = takes.filter((t) => t.status === 'Accepted');

  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'What you owe'),
      el('span', { class: 'count' }, String(open.length))),
    open.length
      ? el('ul', { class: 'takes' }, open.map(takeRow))
      : el('p', { class: 'muted' }, 'Nothing owed right now.'),
    submitted.length > 0 && el('h3', {}, 'Submitted, waiting on review'),
    submitted.length > 0 && el('ul', { class: 'takes' }, submitted.map(takeRow)),
    done.length > 0 && el('details', {},
      el('summary', {}, `Accepted (${done.length})`),
      el('ul', { class: 'takes' }, done.map(takeRow))));
}

// Tasks -------------------------------------------------------------------

const TASK_DONE = ['Done', 'Complete', 'Completed', 'Archived', 'Canceled', 'Cancelled'];
const isOpenTask = (k) => !TASK_DONE.includes(k.status);

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

function tasksSection(tasks, meId) {
  if (tasks.length === 0) return null;
  const mineOf = (k) => (k.assignee_ids ?? []).includes(meId);
  const byDue = (a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.name.localeCompare(b.name);
  const mine = tasks.filter((k) => mineOf(k) && isOpenTask(k)).sort(byDue);
  const crew = tasks.filter((k) => !mineOf(k) && isOpenTask(k)).sort(byDue);
  const done = tasks.filter((k) => !isOpenTask(k));

  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Your tasks'),
      el('span', { class: 'count' }, String(mine.length))),
    mine.length
      ? el('ul', { class: 'takes' }, mine.map((k) => taskRow(k, true)))
      : el('p', { class: 'muted' }, 'No tasks on you right now.'),
    crew.length > 0 && el('h3', {}, 'Crew tasks'),
    crew.length > 0 && el('ul', { class: 'takes' }, crew.map((k) => taskRow(k, false))),
    done.length > 0 && el('details', {},
      el('summary', {}, `Done (${done.length})`),
      el('ul', { class: 'takes' }, done.map((k) => taskRow(k, mineOf(k))))));
}

// Funding -------------------------------------------------------------------
// One card per project with funding stages. It shows the stage that's open now.
// A stage's goal is the sum of its item quotes, so it grows as quotes come in.

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

function owedLine(projectStages, itemsByStage, mine) {
  const owed = mine.filter((c) => c.repayment === 'Owed');
  if (owed.length === 0) return null;
  const known = owed.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const unknown = owed.filter((c) => c.amount == null).length;
  const repayStage = projectStages.find((s) =>
    (itemsByStage.get(s.id) ?? []).some((i) => /^repay/i.test(i.name)));
  return el('div', { class: 'owed' },
    el('p', {},
      'You’ve put in ', el('strong', {}, money(known)),
      unknown > 0 ? `, plus ${unknown === 1 ? 'one payment' : `${unknown} payments`} still being confirmed` : '',
      '. ',
      repayStage ? `It’s paid back at face value in ${stageLabel(repayStage)}.` : 'It’s paid back at face value.'));
}

function fundingSections(stages, items, contributions) {
  const itemsByStage = new Map();
  for (const i of items) {
    if (!itemsByStage.has(i.stage_id)) itemsByStage.set(i.stage_id, []);
    itemsByStage.get(i.stage_id).push(i);
  }
  const byProject = new Map();
  for (const s of stages) {
    const key = s.project_id ?? 'none';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(s);
  }

  const cards = [];
  for (const [projectId, list] of byProject) {
    list.sort((a, b) => (a.stage_number ?? 99) - (b.stage_number ?? 99));
    const current = list.find((s) => s.status === 'Underway') ?? list.find((s) => s.status !== 'Complete');
    if (!current) continue;
    const currentItems = itemsByStage.get(current.id) ?? [];
    const mine = contributions.filter((c) => c.project_id === projectId);

    cards.push(el('section', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h2', {}, `${current.project_name ?? 'Project'} funding`),
        current.stage_number && el('span', { class: 'tag' }, `Stage ${current.stage_number} of ${list.length}`)),
      el('h3', {}, current.status === 'Underway' ? `Now: ${current.name}` : `Next: ${current.name}`),
      moneyLine(current, currentItems),
      currentItems.length > 0 && el('ul', { class: 'takes' }, currentItems.map(itemRow)),
      owedLine(list, itemsByStage, mine),
      el('details', {},
        el('summary', {}, `All stages (${list.length})`),
        el('ul', { class: 'takes' }, list.map((s) => {
          const its = itemsByStage.get(s.id) ?? [];
          const goal = goalOf(its);
          return el('li', { class: 'take' },
            el('div', { class: 'take-main' },
              el('span', { class: 'take-song' }, stageLabel(s)),
              el('span', { class: 'take-name' },
                goal > 0 ? `${money(Number(s.raised) || 0)} of ${money(goal)}` : `${money(Number(s.raised) || 0)} raised`)),
            el('div', { class: 'take-meta' },
              s.status && el('span', { class: `tag stage-${slug(s.status)}` }, s.status)),
            s.id !== current.id && its.length > 0 && el('ul', { class: 'takes nested' }, its.map(itemRow)));
        })))));
  }
  return cards;
}

// Released and In the works --------------------------------------------------

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

function releasedSection(songs) {
  const released = songs.filter(isReleased)
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.name.localeCompare(b.name));
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Discography'),
      el('span', { class: 'count' }, String(released.length))),
    released.length
      ? el('ul', { class: 'songs' }, released.map(songRow))
      : el('p', { class: 'muted' }, 'Nothing released with your name on it yet.'));
}

function inTheWorksSection(songs) {
  const working = songs.filter((s) => !isReleased(s))
    .sort((a, b) => Number(b.owes) - Number(a.owes)
      || (a.target_release_date ?? '9999').localeCompare(b.target_release_date ?? '9999')
      || a.name.localeCompare(b.name));
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'In the works'),
      el('span', { class: 'count' }, String(working.length))),
    working.length
      ? el('ul', { class: 'songs' }, working.map(songRow))
      : el('p', { class: 'muted' }, 'No songs in the works with your name on them.'));
}

// Main --------------------------------------------------------------------

const SONG_FIELDS = 'id, name, development_stage, status, release_date, target_release_date, song_link, bandcamp_link';
let me = null;

// V2 tables may not exist yet while setup is in progress. A missing one
// shows as empty instead of breaking the page.
async function optionalRows(query, label) {
  const { data, error } = await query;
  if (error) {
    console.warn(`gryCE: ${label} not loaded: ${error.message}`);
    return [];
  }
  return data ?? [];
}

async function refresh() {
  const [takesRes, creditsRes, tasks, announcements, acks, updates, stages, items, contributions] = await Promise.all([
    supabase.from('takes')
      .select(`id, name, type, status, due_date, notes, song:songs(${SONG_FIELDS})`)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('song_credits').select(`role, song:songs(${SONG_FIELDS})`),
    optionalRows(supabase.from('tasks').select('id, name, status, due_date, assignee_ids, is_crew'), 'tasks'),
    optionalRows(supabase.from('announcements').select('id, title, body, publish_date'), 'announcements'),
    optionalRows(supabase.from('announcement_acks').select('announcement_id, acknowledged_at'), 'acknowledgements'),
    optionalRows(supabase.from('member_updates')
      .select('item_type, item_id, new_status, created_at, attempts')
      .is('processed_at', null)
      .order('created_at', { ascending: true }), 'updates'),
    optionalRows(supabase.from('funding_stages').select('id, project_id, project_name, stage_number, name, status, raised'), 'funding stages'),
    optionalRows(supabase.from('funding_items').select('id, stage_id, name, quote, status, notes'), 'funding items'),
    optionalRows(supabase.from('contributions').select('id, project_id, amount, repayment'), 'contributions'),
  ]);
  const err = takesRes.error || creditsRes.error;
  if (err) return show(el('p', { class: 'error' }, `Couldn’t load your data: ${err.message}. Refresh to try again.`));

  pendingByItem = new Map(updates.map((u) => [`${u.item_type}:${u.item_id}`, u]));
  const songs = collectSongs(creditsRes.data, takesRes.data);

  show(
    el('p', { class: 'eyebrow' }, `What’s up, ${me.name}`),
    announcementsSection(announcements, acks),
    takesSection(takesRes.data),
    tasksSection(tasks, me.id),
    ...fundingSections(stages, items, contributions),
    inTheWorksSection(songs),
    releasedSection(songs),
  );
}

async function render(session) {
  if (!session) return signInView();

  const email = session.user.email;
  const { data, error: meErr } = await supabase.from('artists').select('id, name').maybeSingle();
  if (meErr) return show(el('p', { class: 'error' }, `Couldn’t load your profile: ${meErr.message}`));
  if (!data) return notLinkedView(email);
  me = data;

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
