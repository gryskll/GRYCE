// Demo client for dev/preview.html.
// Stands in for Supabase so the real app.js runs with made-up data and no account.
// Every name, song and amount here is invented. Never put real crew data in this file:
// the repo is public.
//
// Pick who you are with ?as= in the URL:
//   member      a regular crew member (default)
//   leadership  sees Leadership: contributions and the document registry
//   isrc        an ISRC Admin
//   mix         runs the Mix queue
//   support     Support, with the View as tile
//   viewing     Support, mid View as (banner, read only)

const as = new URLSearchParams(location.search).get('as') || 'member';
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const song = (id, name, stage, status = 'Unreleased', release_date = null) =>
  ({ id, name, development_stage: stage, status, release_date, target_release_date: null, song_link: null, bandcamp_link: null });
const S = {
  a: song('s-a', 'Paper Lanterns', 'Recording'),
  b: song('s-b', 'Night Bus', 'Awaiting Mix Funding'),
  c: song('s-c', 'Copper Wire', 'Mixing'),
  d: song('s-d', 'Low Tide', 'Released', 'Released', '2025-06-13'),
  e: song('s-e', 'Field Notes', 'Released', 'Released', '2024-02-02'),
};

const me = {
  id: 'me', name: as === 'viewing' ? 'Demo Member Two' : 'Demo Member',
  leadership: as === 'leadership', mix_queue: as === 'mix' || as === 'leadership', isrc_admin: as === 'isrc', support: as === 'support' || as === 'viewing',
};

const tables = {
  artists: [me],
  takes: [
    { id: 't1', name: 'Verse 2', type: 'Verse', status: 'Owed', due_date: day(-2), notes: null, song: S.a },
    { id: 't2', name: 'Lyrics', type: 'Lyrics', status: 'Owed', due_date: day(5), notes: 'Type them under your name on the lyric sheet: https://docs.google.com/document/d/demo-lyrics/edit . Used for the listening session.', song: S.b },
    { id: 't3', name: 'Stems', type: 'Stems', status: 'Submitted', due_date: day(-6), notes: null, song: S.c },
  ],
  song_credits: [
    { role: 'Vocals', song: S.a }, { role: 'Vocals', song: S.b }, { role: 'Producer', song: S.c },
    { role: 'Vocals', song: S.d }, { role: 'Vocals', song: S.e },
  ],
  tasks: [
    { id: 'k1', name: 'Lyrics for the listening session', status: 'In progress', due_date: day(3), is_crew: true, assignee_ids: [],
      linked_take_ids: ['g1', 'g2', 'g3', 'g4'], gryce_note: 'Everyone types their lyrics into the shared sheet before the session.', link: 'https://example.com' },
    { id: 'k2', name: 'Pick a cover photo', status: 'Not started', due_date: day(10), is_crew: false, assignee_ids: ['me'] },
    { id: 'k3', name: 'Book the listening room', status: 'Waiting on someone', is_crew: true, assignee_ids: [] },
  ],
  announcements: [
    { id: 'n1', title: 'Listening session Saturday', type: 'Request', body: 'Lyrics folder:\nhttps://drive.google.com/drive/folders/demo-folder\n\nTap Acknowledge so we know you saw this.', publish_date: day(-1), audience: 'Everyone' },
    { id: 'n2', title: 'New mixes are up', type: 'News', body: 'Two songs moved to mixing this week.', publish_date: day(-3), audience: 'Everyone' },
  ],
  announcement_acks: [],
  member_updates: [],
  funding_stages: [
    { id: 'f1', project_id: 'p1', project_name: 'Demo Album', stage_number: 1, name: 'Recording', status: 'Complete', raised: 1200 },
    { id: 'f2', project_id: 'p1', project_name: 'Demo Album', stage_number: 2, name: 'Mixing', status: 'Underway', raised: 450 },
    { id: 'f3', project_id: 'p1', project_name: 'Demo Album', stage_number: 3, name: 'Mastering and release', status: 'Not started', raised: 0 },
  ],
  funding_items: [
    { id: 'i1', stage_id: 'f1', name: 'Studio time', quote: 1200, status: 'Paid' },
    { id: 'i2', stage_id: 'f2', name: 'Mix engineer, 8 songs', quote: 1600, status: 'Quoted' },
    { id: 'i3', stage_id: 'f3', name: 'Mastering', quote: 600, status: 'Quoted' },
    { id: 'i4', stage_id: 'f3', name: 'Repay crew contributions', quote: 300, status: 'Planned' },
  ],
  contributions: [{ id: 'c1', project_id: 'p1', amount: 150, repayment: 'Owed' }],
  projects: [{ id: 'p1', name: 'Demo Album', status: 'In Production', release_date: day(120),
    summary: 'Recording is done. Mixing is half funded.',
    songs: [
      { name: S.a.name, stage: S.a.development_stage, released: false, owed: [{ who: 'Demo Member', what: 'Verse' }] },
      { name: S.b.name, stage: S.b.development_stage, released: false, owed: [{ who: 'Demo Member', what: 'Lyrics' }, { who: 'Another Artist', what: 'Lyrics' }] },
      { name: S.c.name, stage: S.c.development_stage, released: false, owed: [] },
    ] }],
  project_index: [
    { id: 'p1', name: 'Demo Album', status: 'In Production', type: 'Album', release_date: day(120), song_count: 3, released_count: 0, leadership_only: false,
      description: 'The album the crew is making now.', songs: [{ name: S.a.name, stage: 'Recording', released: false }, { name: S.b.name, stage: 'Awaiting Mix Funding', released: false }, { name: S.c.name, stage: 'Mixing', released: false }] },
    { id: 'p2', name: 'Remix EP', status: 'Planning', type: 'EP', song_count: 2, released_count: 0, leadership_only: false, songs: [{ name: 'Night Bus (Remix)', stage: 'Idea/Concept', released: false }] },
    { id: 'p3', name: 'Field Notes', status: 'Released', type: 'Single', release_date: '2024-02-02', song_count: 1, released_count: 1, leadership_only: false, songs: [{ name: 'Field Notes', stage: 'Released', released: true }] },
    { id: 'p4', name: 'Secret Side Project', status: 'Concept', type: 'EP', song_count: 0, released_count: 0, leadership_only: true, songs: [] },
  ].filter((p) => !p.leadership_only || me.leadership),
  songs: Object.values(S).map((x) => ({ ...x, isrc: x.status === 'Released' ? `QT-3ZB-24-0000${x.id.length}` : null, isrc_reissue: null })),
  isrc_codes: [],
  documents: [
    { id: 'd1', number: 'GRY-DOC-001', name: 'Crew agreement', status: 'Approved', date_submitted: '2026-01-10', date_approved: '2026-02-01', link: 'https://example.com' },
    { id: 'd2', number: 'GRY-DOC-002', name: 'Revenue split draft', status: 'Needs Input', date_submitted: day(-4), link: 'https://example.com' },
    { id: 'd3', number: 'GRY-DOC-003', name: 'Merch plan', status: 'Draft' },
  ],
};

const rpcs = {
  group_effort_takes: () => [
    { task_id: 'k1', take_id: 'g1', who: 'Demo Member', song: S.b.name, type: 'Lyrics', status: 'Owed' },
    { task_id: 'k1', take_id: 'g2', who: 'Another Artist', song: S.b.name, type: 'Lyrics', status: 'Accepted' },
    { task_id: 'k1', take_id: 'g3', who: 'Third Artist', song: S.a.name, type: 'Lyrics', status: 'Submitted' },
    { task_id: 'k1', take_id: 'g4', who: 'Another Artist', song: S.a.name, type: 'Lyrics', status: 'Owed' },
  ],
  leadership_contributions: () => [
    { id: 'c1', artist_name: 'Demo Member', contributor_name: 'Demo Member, studio', linked: true, project_name: 'Demo Album', stage_name: 'Recording', amount: 150, type: 'Crew', repayment: 'Owed', contributed_on: '2026-03-01' },
    { id: 'c2', artist_name: null, contributor_name: 'A Kind Supporter', linked: true, project_name: 'Demo Album', stage_name: 'Mixing', amount: 300, type: 'Crewmunity', repayment: null, contributed_on: '2026-06-12' },
    { id: 'c3', artist_name: null, contributor_name: 'Unlinked gift', linked: false, project_name: 'Demo Album', stage_name: null, amount: 75, type: 'Crewmunity', repayment: null, contributed_on: '2025-11-02' },
  ],
  support_status: () => [{
    is_support: me.support, viewing_id: as === 'viewing' ? 'me' : null, viewing_name: as === 'viewing' ? me.name : null,
    expires_at: new Date(Date.now() + 30 * 6e4).toISOString(),
  }],
  support_members: () => [{ id: 'm2', name: 'Demo Member Two' }, { id: 'm3', name: 'Another Artist' }],
  start_view_as: () => { location.search = '?as=viewing'; return 'Demo Member Two'; },
  stop_view_as: () => { location.search = '?as=support'; return null; },
  issue_isrc: () => 'QT-3ZB-26-00099',
  mix_queue: () => [
    { song_id: 's-c', song: 'Copper Wire', stage: 'Mixing', queue_order: 1, project: 'Demo Album', mixers: 'Mix Engineer', mastering: null, target_release_date: day(60), owed: [] },
    { song_id: 's-x', song: 'Low Light', stage: 'Mixing Prep', queue_order: 2, project: 'Demo Album', mixers: null, mastering: null, target_release_date: null, owed: [{ who: 'Another Artist', type: 'Stems', status: 'Owed' }, { who: 'Demo Member', type: 'Verse', status: 'Submitted' }] },
    { song_id: 's-y', song: 'Harbor Song', stage: 'Mastering', queue_order: 3, project: 'Remix EP', mixers: 'Mix Engineer', mastering: 'Master Engineer', target_release_date: day(20), owed: [] },
    { song_id: 's-b', song: 'Night Bus', stage: 'Awaiting Mix Funding', queue_order: 5, project: 'Demo Album', mixers: null, mastering: null, target_release_date: null, owed: [{ who: 'Demo Member', type: 'Lyrics', status: 'Owed' }] },
  ],
};

// A query that answers with the table's rows whatever filters are chained on.
function query(table) {
  const rows = tables[table] ?? [];
  let one = false;
  const q = {
    select: () => q, order: () => q, is: () => q, eq: () => q,
    maybeSingle: () => { one = true; return q; },
    insert: (row) => {
      if (as === 'viewing') return Promise.resolve({ data: null, error: { message: 'Read only while viewing as someone.' } });
      rows.push({ ...row, artist_id: 'me', created_at: new Date().toISOString(), attempts: 0, acknowledged_at: new Date().toISOString() });
      return Promise.resolve({ data: null, error: null });
    },
    then: (ok, bad) => Promise.resolve({ data: one ? rows[0] ?? null : rows, error: null }).then(ok, bad),
  };
  return q;
}

const session = { user: { id: 'demo', email: 'demo@example.com' } };
window.gryceDemo = {
  client: {
    from: query,
    rpc: async (name) => (rpcs[name] ? { data: rpcs[name](), error: null } : { data: null, error: { message: `No demo for ${name}` } }),
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => {},
      signOut: async () => {},
      signInWithOAuth: async () => ({ error: { message: 'Sign-in is off in the demo.' } }),
    },
  },
};
