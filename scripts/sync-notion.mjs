// Copies the GRYSKLL Music Catalog from Notion into Supabase.
// Runs in GitHub Actions on a schedule. No dependencies, Node 20+.
//
// Env:
//   NOTION_TOKEN         Notion connection token (gryCE Sync, read-only)
//   SUPABASE_URL         https://<project-ref>.supabase.co
//   SUPABASE_SECRET_KEY  Supabase secret key (or legacy service_role key)

const NOTION_VERSION = '2025-09-03';
const SOURCES = {
  artists: '3ba53193-34ad-83d2-a82b-07173a7cd227',
  songs: '55753193-34ad-8369-a3b0-8719659db44c',
  takes: '639dc9a8-c9a5-4697-a570-f90ea3e1aeaf',
};
// Songs relation property -> credit role stored in Supabase
const CREDIT_PROPS = {
  'Featured Vocalist(s)': 'Vocals',
  'Producer(s)': 'Producer',
  'Mixing Engineer(s)': 'Mixing',
  'Mastering Engineer(s)': 'Mastering',
  'Visual Artist(s)': 'Visual Art',
};

const { NOTION_TOKEN, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
for (const [k, v] of Object.entries({ NOTION_TOKEN, SUPABASE_URL, SUPABASE_SECRET_KEY })) {
  if (!v) throw new Error(`Missing ${k}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Notion ----------------------------------------------------------------

async function notion(path, { method = 'GET', body } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://api.notion.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${method} ${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Notion ${path} kept failing`);
}

async function queryAll(dataSourceId) {
  const pages = [];
  let cursor;
  do {
    const r = await notion(`data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: { page_size: 100, ...(cursor && { start_cursor: cursor }) },
    });
    pages.push(...r.results.filter((p) => p.object === 'page' && !p.in_trash && !p.archived));
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const text = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join('').trim() || null;
const select = (p) => p?.select?.name ?? null;
const multi = (p) => (p?.multi_select ?? []).map((o) => o.name);
const date = (p) => p?.date?.start?.slice(0, 10) ?? null;
const url = (p) => p?.url ?? text(p);

// Relations come back capped at 25 in query results; fetch the rest when has_more.
async function relation(page, name) {
  const p = page.properties[name];
  if (!p) return [];
  if (!p.has_more) return p.relation.map((r) => r.id);
  const ids = [];
  let cursor;
  do {
    const r = await notion(
      `pages/${page.id}/properties/${encodeURIComponent(p.id)}${cursor ? `?start_cursor=${cursor}` : ''}`,
    );
    ids.push(...r.results.map((x) => x.relation.id));
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return ids;
}

// Supabase --------------------------------------------------------------

function sbHeaders(extra = {}) {
  const h = { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', ...extra };
  // Legacy service_role keys are JWTs and also go in Authorization. New sb_secret_ keys don't.
  if (SUPABASE_SECRET_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
  return h;
}

async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) throw new Error(`Upsert ${table} -> ${res.status}: ${await res.text()}`);
  }
}

async function deleteStale(table, runStart) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?synced_at=lt.${encodeURIComponent(runStart)}`,
    { method: 'DELETE', headers: sbHeaders({ Prefer: 'return=minimal' }) },
  );
  if (!res.ok) throw new Error(`Delete stale ${table} -> ${res.status}: ${await res.text()}`);
}

// Run -------------------------------------------------------------------

const runStart = new Date().toISOString();

const [artistPages, songPages, takePages] = await Promise.all([
  queryAll(SOURCES.artists),
  queryAll(SOURCES.songs),
  queryAll(SOURCES.takes),
]);

// Guard: if a database comes back empty, the connection probably lost access.
// Stop before deleting anything.
for (const [name, list] of [['Artists', artistPages], ['Songs', songPages]]) {
  if (list.length === 0) throw new Error(`${name} returned 0 rows. Check the gryCE Sync connection's access. Nothing was changed.`);
}

const artists = artistPages.map((p) => ({
  id: p.id,
  name: text(p.properties['Name']) ?? '(unnamed)',
  relation: select(p.properties['Artist Relation']),
  roles: multi(p.properties['Role']),
  email: p.properties['Email']?.email?.trim().toLowerCase() || null,
  synced_at: runStart,
}));
const artistIds = new Set(artists.map((a) => a.id));

const songs = songPages.map((p) => ({
  id: p.id,
  name: text(p.properties['Name']) ?? '(untitled)',
  development_stage: select(p.properties['Development Stage']),
  status: select(p.properties['Status']),
  crew: select(p.properties['Crew']),
  release_date: date(p.properties['Release Date']),
  target_release_date: date(p.properties['Target Release Date']),
  song_link: url(p.properties['Song Link']),
  bandcamp_link: url(p.properties['Bandcamp Link']),
  synced_at: runStart,
}));
const songIds = new Set(songs.map((s) => s.id));

const credits = [];
const seen = new Set();
for (const p of songPages) {
  for (const [prop, role] of Object.entries(CREDIT_PROPS)) {
    for (const artistId of await relation(p, prop)) {
      const key = `${p.id}|${artistId}|${role}`;
      if (!artistIds.has(artistId) || seen.has(key)) continue;
      seen.add(key);
      credits.push({ song_id: p.id, artist_id: artistId, role, synced_at: runStart });
    }
  }
}

const takes = [];
for (const p of takePages) {
  const songId = (await relation(p, 'Song'))[0] ?? null;
  takes.push({
    id: p.id,
    name: text(p.properties['Take']) ?? '(untitled take)',
    song_id: songIds.has(songId) ? songId : null,
    artist_ids: (await relation(p, 'Artist')).filter((id) => artistIds.has(id)),
    type: select(p.properties['Type']),
    status: select(p.properties['Status']),
    due_date: date(p.properties['Due Date']),
    notes: text(p.properties['Notes']),
    synced_at: runStart,
  });
}

// Parents first, then children. Stale rows go children first.
await upsert('artists', artists, 'id');
await upsert('songs', songs, 'id');
await upsert('song_credits', credits, 'song_id,artist_id,role');
await upsert('takes', takes, 'id');

for (const t of ['takes', 'song_credits', 'songs', 'artists']) await deleteStale(t, runStart);

const withEmail = artists.filter((a) => a.email).length;
console.log(
  `Synced ${artists.length} artists (${withEmail} with email), ${songs.length} songs, ` +
    `${credits.length} credits, ${takes.length} takes.`,
);
