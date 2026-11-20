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

## v0.4.13: Leadership section cards and every project

**SQL:** `supabase/migrations/v4-3-project-index.sql`. Adds `project_index`, every Music Project (name, status, type, release date, song counts), Leadership only. Members still see only Show in gryCE projects.
