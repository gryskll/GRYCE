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
  d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;

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

// Takes -----------------------------------------------------------------

const OPEN = ['Owed', 'Needs Decision'];

function takeRow(t) {
  const due = fmtDate(t.due_date);
  const overdue = t.due_date && t.status === 'Owed' && new Date(`${t.due_date}T23:59:59`) < new Date();
  return el('li', { class: 'take' },
    el('div', { class: 'take-main' },
      el('span', { class: 'take-song' }, t.song?.name ?? 'No song linked'),
      el('span', { class: 'take-name' }, t.name)),
    el('div', { class: 'take-meta' },
      t.type && el('span', { class: 'tag' }, t.type),
      t.status && el('span', { class: `tag status-${(t.status || '').toLowerCase().replace(/\s+/g, '-')}` }, t.status),
      due && el('span', { class: overdue ? 'due overdue' : 'due' }, overdue ? `Overdue · ${due}` : `Due ${due}`)),
    t.notes && el('p', { class: 'take-notes' }, t.notes));
}

function takesSection(takes) {
  const open = takes.filter((t) => OPEN.includes(t.status) || !t.status);
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

// Discography -----------------------------------------------------------

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
      when && el('span', { class: 'muted' }, when)));
}

function discographySection(credits) {
  const bySong = new Map();
  for (const c of credits) {
    if (!c.song) continue;
    const s = bySong.get(c.song.id) ?? { ...c.song, roles: [] };
    if (!s.roles.includes(c.role)) s.roles.push(c.role);
    bySong.set(c.song.id, s);
  }
  const songs = [...bySong.values()];
  const released = songs.filter(isReleased)
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.name.localeCompare(b.name));
  const working = songs.filter((s) => !isReleased(s)).sort((a, b) => a.name.localeCompare(b.name));

  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Your GRYSKLL discography'),
      el('span', { class: 'count' }, String(songs.length))),
    songs.length === 0 && el('p', { class: 'muted' }, 'No credits on file yet.'),
    released.length > 0 && el('h3', {}, `Released (${released.length})`),
    released.length > 0 && el('ul', { class: 'songs' }, released.map(songRow)),
    working.length > 0 && el('h3', {}, `In the works (${working.length})`),
    working.length > 0 && el('ul', { class: 'songs' }, working.map(songRow)));
}

// Main ------------------------------------------------------------------

async function render(session) {
  if (!session) return signInView();

  const email = session.user.email;
  const { data: me, error: meErr } = await supabase.from('artists').select('id, name').maybeSingle();
  if (meErr) return show(el('p', { class: 'error' }, `Couldn’t load your profile: ${meErr.message}`));
  if (!me) return notLinkedView(email);

  document.getElementById('who-name').textContent = me.name;
  document.getElementById('who').hidden = false;

  const [takesRes, creditsRes] = await Promise.all([
    supabase.from('takes')
      .select('id, name, type, status, due_date, notes, song:songs(name)')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('song_credits')
      .select('role, song:songs(id, name, development_stage, status, release_date, target_release_date, song_link, bandcamp_link)'),
  ]);
  const err = takesRes.error || creditsRes.error;
  if (err) return show(el('p', { class: 'error' }, `Couldn’t load your data: ${err.message}`));

  show(
    el('p', { class: 'eyebrow' }, `What’s up, ${me.name}`),
    takesSection(takesRes.data),
    discographySection(creditsRes.data),
  );
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
