# gryCE v0.4.1 setup: ISRC codes and Leadership

v0.4.1 adds two sections that only some members see:

- **ISRC codes**, for ISRC Admins: every song without a code, with an Issue code button. Supabase hands out the next number, so two people can never get the same code. The sync writes it to the song in Notion within 30 minutes.
- **Leadership**, for the GRYSCO Leadership Team: the Document Number Registry and everyone's project contributions.

Everyone else's gryCE looks the same as before.

Until step 3 is done, the site and the sync skip the new parts and stay green.

## 1. Notion: already done November 19

- Artists has **Leadership**, **ISRC Admin** and **Also Known As**.
  - Leadership: Dragon's Pitchfork, aL Bakwurdz, Qthulhu, Malcolm Rose Jr.
  - ISRC Admin: Qthulhu (primary), Dragon's Pitchfork, aL Bakwurdz.
- Artists also has Legal Name, IPI, PRO, Publisher, Publisher IPI, Company and Contact Email. The sync never reads these.
- Every existing ISRC code is on its song in Songs, in ISRC (Original) or ISRC (GRYSKLL Reissue).
- The Document Number Registry lives on the **GRYSCO Leadership** page, outside the Music Catalog.

## 2. Notion connections (you, about 5 minutes)

**gryCE Write needs Songs, Takes, Tasks and Announcements.** Takes is missing right now, which is why a take update from November 19 hasn't reached Notion.

For each of Songs, Takes, GRYSKLL Tasks and Announcements:
1. Open the database as a full page.
2. `•••` (top right), then **Connections**.
3. If **gryCE Write** isn't listed, add it.

**gryCE Sync needs the Document Number Registry.**
1. Open GRYSCO Leadership, then Document Number Registry as a full page.
2. `•••`, then **Connections**, then add **gryCE Sync**.
3. Add it to the registry only. Never add gryCE Sync to the GRYSCO Leadership page itself, or the Asset Inventory gets shared too.

## 3. Supabase tables

**SQL:** `supabase/migrations/v4-1-isrc-leadership.sql`

Supabase, the GRYSKLL organization, the gryCE project, SQL Editor, New query. Paste the whole file, Run. Expect "Success. No rows returned." Safe to run twice.

(Claude can apply this through the Supabase connector instead, with your yes.)

## 4. Merge and sync

1. Merge the v0.4.1 pull request. GitHub Pages updates in a minute or two.
2. Actions, **Sync Notion to Supabase**, **Run workflow**.
3. The last line should include `documents` and `ISRC codes`. If it says `Skipped documents`, the registry isn't shared with gryCE Sync yet (step 2).

## Test

1. Sign in as Dragon's Pitchfork. Home has two new tiles: **ISRC codes** and **Leadership**. The footer says v0.4.1.
2. Leadership shows 12 GRY-DOC numbers and every contribution, grouped by project.
3. ISRC codes lists songs without a code. Issue one on a song that really needs it. It should come back as `QT-3ZB-26-00027`. After the next sync, the code is on the song in Notion with a comment saying who issued it.
4. Ask a member who isn't on Leadership or an ISRC Admin to sign in. They see no new tiles, and typing `#isrc` or `#leadership` sends them Home.

## Keeping it current

- New Leadership member or ISRC Admin: tick the box on their Artists record. It takes effect on the next sync.
- Documents: set Status to **Needs Input** when a draft wants Leadership's thoughts, or **Submitted** when it's final and waiting on approval. Both show under What you owe and on the Leadership tile for every Leadership member.
- A code that says **Didn't reach Notion**: the song already had a different code in that field, or gryCE Write lost access to Songs. Hover the tag for the reason. Fix it in Notion. The code stays reserved either way.
- Never type a new QT-3ZB code into Notion by hand. Issue it in gryCE so the numbering stays right.

## Before the crew Patreon post

Reconnect Claude's Supabase connector scoped and read-only. That's a task in GRYSKLL Tasks, with the URL in its notes.

## v0.4.9: every contribution names who gave it

**SQL:** `supabase/migrations/v4-2-contributors.sql` (applied November 19).

- **Supporters** lives on the GRYSCO Leadership page: people who back GRYSKLL but aren't artists (Crewmunity, family, friends), with contact details, last thank-you and gifts sent. It never syncs to gryCE.
- Every Contributions row links to an **Artist** (crew) or a **Supporter** (everyone else). Name the row after the person.
- gryCE shows each contributor's name in the Leadership section. A row linked to nobody gets a "Link to a person in Notion" tag.

## v0.4.13: every section organized, Projects for everyone

**SQL:** `supabase/migrations/v4-3-project-index.sql`. Adds `project_index`, every Music Project (name, status, type, release date, song counts). Every signed-in member sees it. The full card (songs, outstanding, funding) is still only for Show in gryCE projects.

## v0.4.14: Leadership Only projects

Music Projects has a **Leadership Only** checkbox. Tick it while a project is still being sorted out. Only Leadership sees it in gryCE, with a Leadership only tag, until it's unticked. The SQL is at the end of `v4-3-project-index.sql` (applied November 20).

## v0.4.17: group efforts

**SQL:** `supabase/migrations/v4-4-group-efforts.sql` (applied November 20).

To start a group effort in Notion:
1. Make a GRYSKLL Tasks row with **Owner: Crew**.
2. Fill **Linked Takes** with every take it depends on, one per person per song.
3. Optional: **gryCE Note** (one or two lines the crew sees) and **Link**. **Notes** stays private.

gryCE shows it at the top of Crew tasks with progress, who's in and who's still to go. Takes count as in once they're Submitted or Accepted. Mark the task Done in Notion when it's finished.

## v0.4.18: Deliverables, and notes for developers

Notion is already renamed. Run `supabase/migrations/v4-5-comments.sql` in the SQL Editor. It only adds descriptions to tables and functions, so it changes no data and no access. The Supabase table stays named `takes`.

## v0.4.19: View as, for Support

Notion is done: Artists has a Support checkbox, ticked for Dragon's Pitchfork and Qthulhu. Run `supabase/migrations/v4-6-view-as.sql` in the SQL Editor, then run the sync so the checkbox reaches Supabase.

Test: sign in as a Support member, tap Support, pick a member, tap View as. The banner shows, there are no Mark submitted buttons, and Exit brings you back.

## v0.4.24: Mix queue

Notion is done: Artists has a Mix Queue checkbox, ticked for Qthulhu and Dragon's Pitchfork. Run `supabase/migrations/v4-7-mix-queue.sql` in the SQL Editor, then run the sync so the checkbox and each song's project reach Supabase. Until the SQL runs, nobody sees the tile.

## v0.4.25: Mix queue edits and demos

1. Notion: open the new **Demos** database (Music Catalog > gryCE > Demos). Click ... > Connections and add **gryCE Sync** and **gryCE Write**. gryCE Write needs to insert pages and comments there.
2. Run `supabase/migrations/v4-8-mix-edits-demos.sql` in the SQL Editor.
3. Run the sync by hand. The log line lists Mix queue edits, new demos and reactions when there are any.

Test: in the Mix queue, Edit a song and change only the mixer. The row says the change is on its way, and the next sync writes it to Notion with a comment. In Crew news, Share a demo with any https link, then react to it from another member's account.

## v0.4.26: demos that become songs

Notion is done: Demos has a Role select and a Song relation. Run `supabase/migrations/v4-9-demo-songs.sql` in the SQL Editor.

To make a demo a song: set its Status to Picked up in the Demos database. On the next sync, gryCE Write creates the song in Songs (Idea/Concept, In Progress, Song Link set to the demo, the person who shared it credited by their Role) and links it in the demo's Song field. To use an existing song instead, link it in Song before setting Picked up.

## v0.4.28: task context

Run `supabase/migrations/v4-10-task-context.sql` in the SQL Editor, then run the sync. Until then tasks still sync, just without Project, Priority and Waiting on.

## v0.4.30: upload demos to Google Drive

The upload button stays hidden until `GOOGLE_CLIENT_ID` is set in `docs/config.js`. Set up once, in the Google Cloud project behind gryCE's Google sign-in:

1. APIs & Services > Library: enable **Google Drive API**.
2. APIs & Services > OAuth consent screen > Data access (or Scopes): add `https://www.googleapis.com/auth/drive.file`. It lets gryCE see only files it creates.
3. APIs & Services > Credentials > the OAuth client gryCE signs in with: under Authorized JavaScript origins add `https://gryce.gryskll.com` (and the pages.dev address for testing). Save.
4. Copy that client's **Client ID** (it ends in `.apps.googleusercontent.com`) into `GOOGLE_CLIENT_ID`. It's public. Never copy the client secret.
