// Syncs gryCE between Notion and Supabase.
// Runs in GitHub Actions on a schedule. No dependencies, Node 20+.
//
// Order on every run:
//   1. Push: send members' pending updates (takes, tasks) and newly issued ISRC codes
//      (Songs) to Notion. Needs NOTION_WRITE_TOKEN.
//   2. Pull: copy Notion into Supabase and delete rows that are gone from Notion.
//   3. Write back: put "Acknowledged by" on each announcement in Notion. Needs NOTION_WRITE_TOKEN.
//
// Env:
//   NOTION_TOKEN         gryCE Sync connection token (read only)
//   NOTION_WRITE_TOKEN   gryCE Write connection token (edit Takes, Tasks, Announcements, Songs). Optional.
//   SUPABASE_URL         https://<project-ref>.supabase.co
//   SUPABASE_SECRET_KEY  Supabase secret key (or legacy service_role key)

const NOTION_VERSION = '2025-09-03';

// Music Catalog data sources (V1).
const SOURCES = {
  artists: '3ba53193-34ad-83d2-a82b-07173a7cd227',
  songs: '55753193-34ad-8369-a3b0-8719659db44c',
  takes: '639dc9a8-c9a5-4697-a570-f90ea3e1aeaf',
};

// V2 sources. A database id or a data source id both work. Leave blank to skip.
const TASKS_DB = 'cf827dfc1a7e4b25abf7bd9daaa7821f';            // GRYSKLL Tasks
const ANNOUNCEMENTS_DB = '41d53193-34ad-8139-9ce5-000b2099252b';  // Announcements (Music Catalog > gryCE)

// V3 funding sources, all on the Music Catalog > gryCE page. Leave blank to skip.
const FUNDING_STAGES_DB = '41d53193-34ad-819d-a3ef-000bb5a64fa1';
const FUNDING_ITEMS_DB = '41d53193-34ad-81fa-93b9-000be7187efe';
const CONTRIBUTIONS_DB = '41d53193-34ad-8137-b9a0-000b9d0e3616';

// v0.4.1 Leadership source. Lives on the GRYSCO Leadership page, outside the Music
// Catalog. Share only this database with gryCE Sync, never the Leadership page.
const DOCUMENTS_DB = '41d53193-34ad-810e-adb6-ebf842fdb041';     // Document Number Registry

// ISRC fields on Songs, and the prefix gryCE issues codes under.
const ISRC_PROPS = { Original: 'ISRC (Original)', Reissue: 'ISRC (GRYSKLL Reissue)' };
const ISRC_PATTERN = /^QT-3ZB-\d{2}-\d{5}$/;
const PROJECTS_DS = 'ecf53193-34ad-82f2-9fd6-07262bc135c1';   // Music Projects
// Only projects with Show in gryCE ticked reach the crew.
const SHOW_PROP = 'Show in gryCE';

// Notion property names. Change these if the Notion names differ.
const TAKE_PROPS = { status: 'Status', submitted: 'Submitted', accepted: 'Accepted' };
// A task is a Crew task when Owner is set to Crew. Every linked member sees those.
const TASK_PROPS = { assignee: 'Assignee', owner: 'Owner', crewOwner: 'Crew', status: 'Status', done: 'Done', due: ['Due', 'Due Date', 'Due date', 'Date'] };
const ANN_PROPS = {
  title: 'Title', body: 'Body', audience: 'Audience', project: 'Project', artists: 'Artists',
  publish: 'Publish date', expires: 'Expires', ackedBy: 'Acknowledged by', type: 'Type',
};

// Songs relation property -> credit role stored in Supabase
const CREDIT_PROPS = {
  'Featured Vocalist(s)': 'Vocals',
  'Producer(s)': 'Producer',
  'Mixing Engineer(s)': 'Mixing',
  'Mastering Engineer(s)': 'Mastering',
  'Visual Artist(s)': 'Visual Art',
};

const NOTION_TOKEN = process.env.NOTION_TOKEN?.trim();
const NOTION_WRITE_TOKEN = process.env.NOTION_WRITE_TOKEN?.trim() || null;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY?.trim();
// Accept the project URL with or without a trailing slash or /rest/v1.
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
for (const [k, v] of Object.entries({ NOTION_TOKEN, SUPABASE_URL, SUPABASE_SECRET_KEY })) {
  if (!v) throw new Error(`Missing ${k}`);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  console.warn('SUPABASE_URL does not look like https://<project-ref>.supabase.co. Check the secret if this run fails.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Notion ----------------------------------------------------------------

async function notion(path, { method = 'GET', body, token = NOTION_TOKEN } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://api.notion.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
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
const notionWrite = (path, opts = {}) => notion(path, { ...opts, token: NOTION_WRITE_TOKEN });

// Accepts a database id (from the Notion URL) or a data source id.
async function dataSourceId(id) {
  try {
    const db = await notion(`databases/${id}`);
    if (db.data_sources?.length) return db.data_sources[0].id;
  } catch (e) {
    if (!/-> (400|404):/.test(e.message)) throw e;
  }
  return id;
}

async function queryAll(dataSourceIdValue, filter) {
  const pages = [];
  let cursor;
  do {
    const r = await notion(`data_sources/${dataSourceIdValue}/query`, {
      method: 'POST',
      body: { page_size: 100, ...(filter && { filter }), ...(cursor && { start_cursor: cursor }) },
    });
    pages.push(...r.results.filter((p) => p.object === 'page' && !p.in_trash && !p.archived));
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const text = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join('').trim() || null;
const select = (p) => p?.select?.name ?? null;
const statusOrSelect = (p) => p?.status?.name ?? p?.select?.name ?? null;
const multi = (p) => (p?.multi_select ?? []).map((o) => o.name);
const num = (p) => (typeof p?.number === 'number' ? p.number : null);
const date = (p) => p?.date?.start?.slice(0, 10) ?? null;
const url = (p) => p?.url ?? text(p);
const titleOf = (page) => text(Object.values(page.properties).find((p) => p.type === 'title'));
const firstDate = (page, names) => {
  for (const n of names) if (page.properties[n]?.type === 'date') return date(page.properties[n]);
  return null;
};

// Relations come back capped at 25 in query results; fetch the rest when has_more.
async function relation(page, name) {
  const p = page.properties[name];
  if (!p || p.type !== 'relation') return [];
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

// A V2 source failing (no access yet, property missing) skips that table for this
// run and leaves its Supabase rows alone. It never stops the V1 sync.
async function optional(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`Skipped ${label}: ${e.message}`);
    return null;
  }
}

// Supabase --------------------------------------------------------------

function sbHeaders(extra = {}) {
  const h = { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', ...extra };
  // Legacy service_role keys are JWTs and also go in Authorization. New sb_secret_ keys don't.
  if (SUPABASE_SECRET_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
  return h;
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: sbHeaders(prefer ? { Prefer: prefer } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} -> ${res.status}: ${await res.text()}`);
  return method === 'GET' ? res.json() : null;
}

async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    await sb(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      body: rows.slice(i, i + 500),
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
}

// Insert rows that aren't there yet. Never changes a row that already exists.
async function insertNew(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    await sb(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      body: rows.slice(i, i + 500),
      prefer: 'resolution=ignore-duplicates,return=minimal',
    });
  }
}

const deleteStale = (table, runStart) =>
  sb(`${table}?synced_at=lt.${encodeURIComponent(runStart)}`, { method: 'DELETE', prefer: 'return=minimal' });

// 1. Push member updates ---------------------------------------------------

function optionValue(prop, name) {
  if (prop.type === 'status') return { status: { name } };
  if (prop.type === 'select') return { select: { name } };
  if (prop.type === 'checkbox') return { checkbox: true };
  throw new Error(`Can't set a ${prop.type} property`);
}

async function pushMemberUpdates() {
  if (!NOTION_WRITE_TOKEN) {
    console.log('No NOTION_WRITE_TOKEN. Member updates wait in Supabase.');
    return 0;
  }
  const pending = await sb(
    'member_updates?processed_at=is.null&attempts=lt.5&order=created_at.asc' +
      '&select=id,artist_id,item_type,item_id,new_status,note,link,attempts',
  );
  if (pending.length === 0) return 0;

  const names = new Map((await sb('artists?select=id,name')).map((a) => [a.id, a.name]));
  let sent = 0;

  for (const u of pending) {
    try {
      const page = await notionWrite(`pages/${u.item_id}`);
      const who = names.get(u.artist_id) ?? 'A member';
      const lines = [];

      if (u.new_status) {
        const propName = u.item_type === 'take' ? TAKE_PROPS.status : TASK_PROPS.status;
        const prop = page.properties[propName];
        if (!prop) throw new Error(`No "${propName}" property on this page`);
        const current = statusOrSelect(prop);
        if (u.item_type === 'take' && current === TAKE_PROPS.accepted) {
          lines.push(`${who} marked this submitted, but it was already accepted. Status left as is.`);
        } else {
          const target = u.item_type === 'take' ? TAKE_PROPS.submitted : TASK_PROPS.done;
          await notionWrite(`pages/${u.item_id}`, {
            method: 'PATCH',
            body: { properties: { [propName]: optionValue(prop, target) } },
          });
          lines.push(`${who} marked this ${target} in gryCE.`);
        }
      } else {
        lines.push(`${who} left a note in gryCE.`);
      }
      if (u.note) lines.push(`Note: ${u.note}`);

      // Every update leaves a comment, so Notion keeps the trail.
      const rich = [{ type: 'text', text: { content: lines.join('\n') } }];
      if (u.link) {
        rich.push({ type: 'text', text: { content: '\nLink: ' } });
        rich.push({ type: 'text', text: { content: u.link, link: { url: u.link } } });
      }
      await notionWrite('comments', { method: 'POST', body: { parent: { page_id: u.item_id }, rich_text: rich } });

      await sb(`member_updates?id=eq.${u.id}`, {
        method: 'PATCH',
        body: { processed_at: new Date().toISOString(), error: null },
        prefer: 'return=minimal',
      });
      sent++;
    } catch (e) {
      console.warn(`Update ${u.id} failed: ${e.message}`);
      await sb(`member_updates?id=eq.${u.id}`, {
        method: 'PATCH',
        body: { attempts: u.attempts + 1, error: e.message.slice(0, 500) },
        prefer: 'return=minimal',
      });
    }
  }
  return sent;
}

// ISRC codes issued in gryCE go onto the song in Notion, with a comment saying who issued it.
// A song that already has a different code in that field is never overwritten.
async function pushIsrcCodes() {
  if (!NOTION_WRITE_TOKEN) return 0;
  const pending = await sb(
    'isrc_codes?pushed_at=is.null&issued_by=not.is.null&push_attempts=lt.5&order=issued_at.asc' +
      '&select=code,song_id,kind,issued_by,push_attempts',
  );
  if (pending.length === 0) return 0;
  const names = new Map((await sb('artists?select=id,name')).map((a) => [a.id, a.name]));
  let sent = 0;
  for (const c of pending) {
    try {
      const propName = ISRC_PROPS[c.kind];
      const page = await notionWrite(`pages/${c.song_id}`);
      const prop = page.properties[propName];
      if (!prop || prop.type !== 'rich_text') throw new Error(`No "${propName}" text property on this song`);
      const existing = text(prop);
      if (existing && existing !== c.code) throw new Error(`Song already has ${existing} in ${propName}. Nothing changed.`);
      if (existing !== c.code) {
        await notionWrite(`pages/${c.song_id}`, {
          method: 'PATCH',
          body: { properties: { [propName]: { rich_text: [{ type: 'text', text: { content: c.code } }] } } },
        });
        const who = names.get(c.issued_by) ?? 'An ISRC Admin';
        await notionWrite('comments', {
          method: 'POST',
          body: { parent: { page_id: c.song_id }, rich_text: [{ type: 'text', text: { content: `${who} issued ${c.kind.toLowerCase()} ISRC ${c.code} in gryCE.` } }] },
        });
      }
      await sb(`isrc_codes?code=eq.${encodeURIComponent(c.code)}`, {
        method: 'PATCH',
        body: { pushed_at: new Date().toISOString(), push_error: null },
        prefer: 'return=minimal',
      });
      sent++;
    } catch (e) {
      console.warn(`ISRC ${c.code} not written to Notion: ${e.message}`);
      await sb(`isrc_codes?code=eq.${encodeURIComponent(c.code)}`, {
        method: 'PATCH',
        body: { push_attempts: c.push_attempts + 1, push_error: e.message.slice(0, 500) },
        prefer: 'return=minimal',
      });
    }
  }
  return sent;
}

const runStart = new Date().toISOString();
const pushed = (await optional('member updates push', pushMemberUpdates)) ?? 0;
const isrcPushed = (await optional('ISRC push', pushIsrcCodes)) ?? 0;

// 2. Pull ------------------------------------------------------------------

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
  leadership: p.properties['Leadership']?.checkbox === true,
  isrc_admin: p.properties['ISRC Admin']?.checkbox === true,
  also_known_as: text(p.properties['Also Known As']),
  synced_at: runStart,
}));
const artistIds = new Set(artists.map((a) => a.id));
const artistName = new Map(artists.map((a) => [a.id, a.name]));

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
  isrc: text(p.properties[ISRC_PROPS.Original])?.toUpperCase() ?? null,
  isrc_reissue: text(p.properties[ISRC_PROPS.Reissue])?.toUpperCase() ?? null,
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
    name: titleOf(p) ?? '(untitled take)',  // the title property, whatever it's called
    song_id: songIds.has(songId) ? songId : null,
    artist_ids: (await relation(p, 'Artist')).filter((id) => artistIds.has(id)),
    type: select(p.properties['Type']),
    status: select(p.properties['Status']),
    due_date: date(p.properties['Due Date']),
    notes: text(p.properties['Notes']),
    synced_at: runStart,
  });
}

// Tasks: only pages with an Assignee or Owner set to Crew are read.
// Everything else on Shaah and Yani's list stays in Notion.
const tasks = !TASKS_DB ? null : await optional('tasks', async () => {
  const pages = await queryAll(await dataSourceId(TASKS_DB), {
    or: [
      { property: TASK_PROPS.assignee, relation: { is_not_empty: true } },
      { property: TASK_PROPS.owner, select: { equals: TASK_PROPS.crewOwner } },
    ],
  });
  const rows = [];
  for (const p of pages) {
    rows.push({
      id: p.id,
      name: titleOf(p) ?? '(untitled task)',
      status: statusOrSelect(p.properties[TASK_PROPS.status]),
      due_date: firstDate(p, TASK_PROPS.due),
      assignee_ids: (await relation(p, TASK_PROPS.assignee)).filter((id) => artistIds.has(id)),
      is_crew: select(p.properties[TASK_PROPS.owner]) === TASK_PROPS.crewOwner,
      // Group effort: the takes this crew task depends on. gryCE Note is the
      // crew-facing line. Notes stays private and is never synced.
      linked_take_ids: await relation(p, 'Linked Takes'),
      gryce_note: text(p.properties['gryCE Note']),
      link: url(p.properties['Link']),
      synced_at: runStart,
    });
  }
  return rows;
});

// Announcements: the audience is resolved here into artist ids.
// Project vocalists = Featured Vocalist(s) on the songs linked to the project.
let announcementPages = null;
const announcements = !ANNOUNCEMENTS_DB ? null : await optional('announcements', async () => {
  announcementPages = await queryAll(await dataSourceId(ANNOUNCEMENTS_DB));
  const vocalsBySong = new Map();
  for (const c of credits) {
    if (c.role !== 'Vocals') continue;
    if (!vocalsBySong.has(c.song_id)) vocalsBySong.set(c.song_id, new Set());
    vocalsBySong.get(c.song_id).add(c.artist_id);
  }
  const projectVocalists = new Map();
  async function vocalistsFor(projectId) {
    if (projectVocalists.has(projectId)) return projectVocalists.get(projectId);
    const project = await notion(`pages/${projectId}`);
    const ids = new Set();
    // Whatever the project's song relation is called, keep the ids that are songs.
    for (const [name, prop] of Object.entries(project.properties)) {
      if (prop.type !== 'relation') continue;
      for (const id of await relation(project, name)) {
        if (songIds.has(id)) for (const a of vocalsBySong.get(id) ?? []) ids.add(a);
      }
    }
    projectVocalists.set(projectId, ids);
    return ids;
  }

  const rows = [];
  for (const p of announcementPages) {
    const props = p.properties;
    const audience = select(props[ANN_PROPS.audience]) ?? 'Everyone';
    const projectId = (await relation(p, ANN_PROPS.project))[0] ?? null;
    let ids = [];
    if (audience === 'Specific artists') {
      ids = await relation(p, ANN_PROPS.artists);
    } else if (audience === 'Project vocalists' && projectId) {
      ids = [...(await vocalistsFor(projectId))];
    }
    // Any other audience value reaches nobody until it's added here. Safer than everyone.
    rows.push({
      id: p.id,
      title: text(props[ANN_PROPS.title]) ?? titleOf(p) ?? '(untitled)',
      body: text(props[ANN_PROPS.body]),
      audience,
      type: select(props[ANN_PROPS.type]) === 'Request' ? 'Request' : 'News',
      project_id: projectId,
      audience_artist_ids: ids.filter((id) => artistIds.has(id)),
      publish_date: date(props[ANN_PROPS.publish]),
      expires: date(props[ANN_PROPS.expires]),
      synced_at: runStart,
    });
  }
  return rows;
});

// Funding: stages, the items each stage pays for, and who put money in.
// A stage's goal isn't stored. The site adds up its item quotes.
const projectNames = new Map();
async function projectName(id) {
  if (!id) return null;
  if (!projectNames.has(id)) {
    projectNames.set(id, await notion(`pages/${id}`).then(titleOf).catch(() => null));
  }
  return projectNames.get(id);
}

const fundingStages = !FUNDING_STAGES_DB ? null : await optional('funding stages', async () => {
  const rows = [];
  for (const p of await queryAll(await dataSourceId(FUNDING_STAGES_DB))) {
    const projectId = (await relation(p, 'Project'))[0] ?? null;
    rows.push({
      id: p.id,
      project_id: projectId,
      project_name: await projectName(projectId),
      stage_number: num(p.properties['Stage Number']),
      name: titleOf(p) ?? '(unnamed stage)',
      status: statusOrSelect(p.properties['Status']),
      raised: num(p.properties['Raised']) ?? 0,
      synced_at: runStart,
    });
  }
  return rows;
});

const fundingItems = !FUNDING_ITEMS_DB ? null : await optional('funding items', async () => {
  const rows = [];
  for (const p of await queryAll(await dataSourceId(FUNDING_ITEMS_DB))) {
    rows.push({
      id: p.id,
      stage_id: (await relation(p, 'Stage'))[0] ?? null,
      name: titleOf(p) ?? '(unnamed item)',
      quote: num(p.properties['Quote']),
      status: statusOrSelect(p.properties['Status']),
      notes: text(p.properties['Notes']),
      synced_at: runStart,
    });
  }
  return rows;
});

const contributions = !CONTRIBUTIONS_DB ? null : await optional('contributions', async () => {
  const rows = [];
  for (const p of await queryAll(await dataSourceId(CONTRIBUTIONS_DB))) {
    const artistId = (await relation(p, 'Artist'))[0] ?? null;
    rows.push({
      id: p.id,
      artist_id: artistIds.has(artistId) ? artistId : null,
      project_id: (await relation(p, 'Project'))[0] ?? null,
      stage_id: (await relation(p, 'Stage'))[0] ?? null,
      amount: num(p.properties['Amount']),
      type: select(p.properties['Type']),
      // The row's title names who gave it. Supporter links to the Leadership-only
      // Supporters database. Only the id comes across, never contact details.
      contributor_name: titleOf(p),
      supporter_id: (await relation(p, 'Supporter'))[0] ?? null,
      // Formula on Contributions: true when it links to an Artist or a Supporter.
      person_linked: p.properties['Linked to Person']?.formula?.boolean ?? null,
      repayment: select(p.properties['Repayment']),
      contributed_on: date(p.properties['Date']),
      synced_at: runStart,
    });
  }
  return rows;
});

// Project updates: projects with Show in gryCE ticked, with each song's stage, read from the songs
// already pulled above, so nothing else in Songs leaves Notion.
// Each song also lists who still owes something on it (open takes), so the
// whole crew can see what's holding a project up. Names and the kind of take
// only. Notes and due dates stay with the person who owes it.
const OPEN_TAKE = ['Owed', 'Needs Decision'];
const owedBySong = new Map();
for (const t of takes) {
  if (!t.song_id || (t.status && !OPEN_TAKE.includes(t.status))) continue;
  for (const a of t.artist_ids) {
    if (!owedBySong.has(t.song_id)) owedBySong.set(t.song_id, []);
    owedBySong.get(t.song_id).push({ who: artistName.get(a) ?? 'Someone', what: t.type ?? 'Take' });
  }
}
const songStageByProject = new Map();
for (const p of songPages) {
  for (const projectId of await relation(p, 'Project')) {
    if (!songStageByProject.has(projectId)) songStageByProject.set(projectId, []);
    songStageByProject.get(projectId).push({
      name: text(p.properties['Name']) ?? '(untitled)',
      stage: select(p.properties['Development Stage']),
      // Out in the world, even if it's being remastered for the album.
      released: select(p.properties['Status']) === 'Released' || select(p.properties['Development Stage']) === 'Released',
      owed: owedBySong.get(p.id) ?? [],
    });
  }
}
const projects = !PROJECTS_DS ? null : await optional('projects', async () => {
  const pages = await queryAll(PROJECTS_DS, { property: SHOW_PROP, checkbox: { equals: true } });
  return pages.map((p) => ({
    id: p.id,
    name: titleOf(p) ?? '(untitled project)',
    status: select(p.properties['Status']),
    release_date: date(p.properties['Release Date']),
    summary: text(p.properties['gryCE Update']),
    songs: songStageByProject.get(p.id) ?? [],
    synced_at: runStart,
  }));
});

// Every project, so the whole crew sees what's in the pipeline. Names, status,
// type, dates and song counts only.
const projectIndex = !PROJECTS_DS ? null : await optional('project index', async () => {
  const pages = await queryAll(PROJECTS_DS);
  return pages.map((p) => {
    const songs = songStageByProject.get(p.id) ?? [];
    return {
      id: p.id,
      name: titleOf(p) ?? '(untitled project)',
      status: select(p.properties['Status']),
      type: select(p.properties['Project Type']),
      release_date: date(p.properties['Release Date']),
      show_in_gryce: p.properties[SHOW_PROP]?.checkbox === true,
      // Leadership only: still being sorted out. Only Leadership sees it until it's unticked.
      leadership_only: p.properties['Leadership Only']?.checkbox === true,
      description: text(p.properties['Description']),
      // Song names and stages only, so members can see what's on each project.
      songs: songs.map((x) => ({ name: x.name, stage: x.stage, released: x.released })),
      song_count: songs.length,
      released_count: songs.filter((x) => x.released).length,
      synced_at: runStart,
    };
  });
});

// Document Number Registry, for Leadership.
const documents = !DOCUMENTS_DB ? null : await optional('documents', async () => {
  const pages = await queryAll(await dataSourceId(DOCUMENTS_DB));
  return pages.map((p) => ({
    id: p.id,
    number: titleOf(p) ?? '(no number)',
    name: text(p.properties['Document Name']),
    status: select(p.properties['Status']),
    date_submitted: date(p.properties['Date Submitted']),
    date_approved: date(p.properties['Date Approved']),
    link: url(p.properties['Current Revision']),
    notes: text(p.properties['Notes']),
    synced_at: runStart,
  }));
});

// v0.4.1 columns may not exist yet. If the first save fails, save again without them.
const V041_ARTIST = ['leadership', 'isrc_admin', 'also_known_as'];
const V041_SONG = ['isrc', 'isrc_reissue'];
const without = (rows, keys) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));
async function upsertNewCols(table, rows, cols) {
  try {
    await upsert(table, rows, 'id');
  } catch (e) {
    if (!/column|schema cache/i.test(e.message)) throw e;
    console.warn(`${table}: v0.4.1 columns missing, saved without them. Run supabase/migrations/v4-1-isrc-leadership.sql.`);
    await upsert(table, without(rows, cols), 'id');
  }
}
// Parents first, then children. Stale rows go children first.
await upsertNewCols('artists', artists, V041_ARTIST);
await upsertNewCols('songs', songs, V041_SONG);
await upsert('song_credits', credits, 'song_id,artist_id,role');
await upsert('takes', takes, 'id');
// V2 tables may not exist yet in Supabase. A failed save skips that table's cleanup too.
const tasksSaved = tasks && (await optional('tasks save', () => upsert('tasks', tasks, 'id').then(() => true)));
const annSaved = announcements && (await optional('announcements save', () => upsert('announcements', announcements, 'id').then(() => true)));

const save = (label, table, rows) =>
  rows && optional(`${label} save`, () => upsert(table, rows, 'id').then(() => true));
const stagesSaved = await save('funding stages', 'funding_stages', fundingStages);
const itemsSaved = await save('funding items', 'funding_items', fundingItems);
const contribSaved = await save('contributions', 'contributions', contributions);
const projectsSaved = await save('projects', 'projects', projects);
const docsSaved = await save('documents', 'documents', documents);
const indexSaved = await save('project index', 'project_index', projectIndex);

// Every ISRC code already in Notion goes into isrc_codes, so new codes carry on
// from the last number. Codes issued in gryCE are already there and stay as they are.
const knownCodes = [];
for (const s of songs) {
  for (const [kind, code] of [['Original', s.isrc], ['Reissue', s.isrc_reissue]]) {
    if (code && ISRC_PATTERN.test(code)) knownCodes.push({ code, song_id: s.id, kind, pushed_at: runStart });
  }
}
const codesLoaded = await optional('ISRC codes', () => insertNew('isrc_codes', knownCodes, 'code').then(() => true));

const staleTables = ['takes', 'song_credits', 'songs', 'artists'];
if (tasksSaved) staleTables.unshift('tasks');
if (annSaved) staleTables.unshift('announcements');
if (stagesSaved) staleTables.unshift('funding_stages');
if (itemsSaved) staleTables.unshift('funding_items');
if (contribSaved) staleTables.unshift('contributions');
if (projectsSaved) staleTables.unshift('projects');
if (docsSaved) staleTables.unshift('documents');
if (indexSaved) staleTables.unshift('project_index');
// announcement_acks, member_updates and isrc_codes are never in this list.
for (const t of staleTables) await deleteStale(t, runStart);

// 3. Write back "Acknowledged by" ------------------------------------------

let ackUpdates = 0;
if (NOTION_WRITE_TOKEN && annSaved) {
  await optional('Acknowledged by write-back', async () => {
    const acks = await sb('announcement_acks?select=announcement_id,artist_id');
    const byAnn = new Map();
    for (const a of acks) {
      if (!byAnn.has(a.announcement_id)) byAnn.set(a.announcement_id, []);
      byAnn.get(a.announcement_id).push(artistName.get(a.artist_id) ?? 'Unknown');
    }
    for (const p of announcementPages) {
      const prop = p.properties[ANN_PROPS.ackedBy];
      if (prop?.type !== 'rich_text') continue;
      const want = (byAnn.get(p.id) ?? []).sort((a, b) => a.localeCompare(b)).join(', ');
      if ((text(prop) ?? '') === want) continue;
      await notionWrite(`pages/${p.id}`, {
        method: 'PATCH',
        body: { properties: { [ANN_PROPS.ackedBy]: { rich_text: want ? [{ type: 'text', text: { content: want.slice(0, 2000) } }] : [] } } },
      });
      ackUpdates++;
    }
  });
}

const withEmail = artists.filter((a) => a.email).length;
console.log(
  `Synced ${artists.length} artists (${withEmail} with email), ${songs.length} songs, ` +
    `${credits.length} credits, ${takes.length} takes` +
    (tasksSaved ? `, ${tasks.length} tasks` : '') +
    (annSaved ? `, ${announcements.length} announcements` : '') +
    (stagesSaved ? `, ${fundingStages.length} funding stages` : '') +
    (itemsSaved ? `, ${fundingItems.length} funding items` : '') +
    (contribSaved ? `, ${contributions.length} contributions` : '') +
    (projectsSaved ? `, ${projects.length} projects` : '') +
    (docsSaved ? `, ${documents.length} documents` : '') +
    (indexSaved ? `, ${projectIndex.length} in the project index` : '') +
    (codesLoaded ? `, ${knownCodes.length} ISRC codes` : '') +
    `. Pushed ${pushed} member updates` +
    (isrcPushed ? `, wrote ${isrcPushed} new ISRC codes to Notion` : '') +
    (ackUpdates ? `, updated Acknowledged by on ${ackUpdates}` : '') +
    '.',
);
