# gryCE for developers

This is the guide for anyone picking up gryCE: how it's put together, where each piece of data comes from, how to ship a change, and what needs cleaning up. Read README.md first for the short version, then this.

gryCE is the GRYSKLL Creative Engine, the member portal for the GRYSKLL crew. It's built and maintained by BetweenKeys. Version numbers stay under 1.0 while it's in development.

## Kicking the tires

You don't need an account, keys or crew data for any of this. Reviewers don't get a live login, because every linked login sees real crew news, funding amounts and project plans.

1. **Clone it.** `git clone https://github.com/gryskll/gryce`
2. **Click through the site with made-up data.** From the repo root run `python3 -m http.server 8000` and open `http://localhost:8000/dev/preview.html`. The bar in the corner switches who you are: member, Leadership, ISRC Admin, Support, or mid View as. `dev/demo.js` stands in for Supabase, and the real `docs/app.js` runs on top of it. Sign-in and saving don't do anything there.
3. **Run the database tests.** With Postgres 15+ running locally: `PGHOST=localhost PGUSER=postgres dev/test-db.sh`. It builds a throwaway database from `supabase/schema.sql` plus every migration (each run twice to prove it's safe to re-run), then runs 58 checks: who sees what, member updates, ISRC numbering and View as. The same tests run on every pull request.
4. **Read in this order:** this file, `supabase/migrations/v4-6-view-as.sql` (the access model in one place), `scripts/sync-notion.mjs`, then `docs/app.js`.

### Where we'd like eyes

- **Access rules.** Anything a member can read or write that they shouldn't. The database is the only gate.
- **The sync.** Failure handling, Notion rate limits, and the stale-row deletes.
- **`app.js` structure.** How you'd split it without adding a build step.
- **Hosting.** The site moved to Cloudflare Pages on November 20, 2026. Anything we should set there, like security headers in a `docs/_headers` file.

Open an issue or a pull request. Keep crew names, emails and amounts out of both: the repo is public.

## The shape of it

```
Notion (the records)  --->  GitHub Action, every 30 min  --->  Supabase (a copy, plus sign-in)  --->  the site (Cloudflare Pages)
        ^                       scripts/sync-notion.mjs                                                   docs/
        |                                                                                                   |
        +---------------- member updates, acknowledgements, ISRC codes go back the other way <-------------+
```

- **Notion is the source of truth.** People edit records in Notion. The site never edits Notion directly.
- **The sync** (`scripts/sync-notion.mjs`) runs on GitHub Actions every 10 minutes. It has no dependencies, just Node 22 and `fetch`.
- **Supabase** holds a copy of what members are allowed to see, handles Google sign-in, and enforces who sees what with row level security (RLS). The site talks to Supabase only, with the public publishable key.
- **The site** is plain HTML, CSS and one JavaScript module in `docs/`, served by Cloudflare Pages at gryce.gryskll.com. No build step, no framework. Cloudflare deploys `main` on every merge and builds a preview link for every pull request.

Everything runs on free plans. The repo is public, so nothing private ever goes in it: no crew data, exports, logs, tokens or handoff notes. Cloudflare can deploy from a private repo, so going private is an option later; reviewers would then need to be added as collaborators.

## Where the data lives

Notion database → Supabase table. The sync finds each Notion database by its ID (constants near the top of the sync script), so renaming a database in Notion doesn't break anything. Renaming a **property** does, because properties are read by name.

| Notion | Supabase | Who can read it in Supabase |
| --- | --- | --- |
| Artists | `artists` | Each member reads only their own row |
| Songs | `songs` | Songs you're credited on or owe something on. ISRC Admins read all |
| Role relations on Songs | `song_credits` | Your own credits |
| **Deliverables** (was Takes) | `takes` | Your own. Group-effort ones through `group_effort_takes()` |
| GRYSKLL Tasks | `tasks` | Crew tasks for everyone, assigned tasks for the assignee |
| Announcements | `announcements` | Everyone signed in |
| Funding Stages, Funding Items | `funding_stages`, `funding_items` | Everyone signed in, with amounts |
| Contributions | `contributions` | Your own. Leadership reads all through `leadership_contributions()` |
| Music Projects (Show in gryCE) | `projects` | Members linked to the project |
| Music Projects (all) | `project_index` | Everyone, except Leadership Only projects |
| Document Number Registry | `documents` | Leadership only |
| (none, made in gryCE) | `member_updates`, `announcement_acks`, `isrc_codes`, `song_updates`, `view_as_sessions` | Written by the site, see below |
| Demos (made in gryCE first) | `demos`, `demo_reactions` | Everyone sees demos and counts. Comments: the demo's owner and Leadership. The sync creates the Notion page and reads Status, Hidden and Song back. A demo set to Picked up with no Song linked becomes a new Songs page (Idea/Concept, In Progress, credited by the Role the member chose) |

Every table and the three functions carry a comment explaining what they are (`supabase/migrations/v4-5-comments.sql`). In Supabase, open Table Editor and the comment shows under the table name.

**Naming note:** Notion and the site say "Deliverables". The Supabase table, the code and the sync still say `takes`. That was on purpose: renaming the table would touch every query and access rule for no gain. If you do rename it, do it in one release with a migration and update every `takes` reference in the sync and the site.

### What stays in Notion and never syncs

- Artists: Legal Name, IPI, PRO, Publisher, Publisher IPI, Company, Contact Email.
- GRYSKLL Tasks: Notes. Only gryCE Note and Link sync.
- Supporters (on the GRYSCO Leadership page): contact details. The sync only reads which supporter a contribution links to.
- Asset Inventory (GRYSCO Leadership page): never shared with any connection.

### Who a task goes to

A GRYSKLL Tasks page shows in gryCE to its **Assignee** (an Artists relation) and to whoever its **Owner** select names. Owner is matched to an artist's Name or any name in their Also Known As field, ignoring case and punctuation, so add a nickname there when the Owner list uses one. "A + B" goes to both. Owner **Crew** shows to every member. A task that reaches nobody stays in Notion. Notes comes along only on tasks that aren't crew tasks (joined after gryCE Note), since only the task's own people can see those. On crew tasks, Notes never syncs.

### Two Notion connections

- **gryCE Sync** reads. It can see the Music Catalog, GRYSKLL Tasks, the Document Number Registry and Supporters.
- **gryCE Write** edits Deliverables, Tasks, Announcements and Songs. It needs the "Insert comments" capability, because every write-back leaves a comment saying who did what.

Keep the Notion workspace at one member. A Free workspace with a second member hits Notion's lifetime block cap, which this one is far past.

## Who sees what

Access is decided in Supabase, not in the site. The site just asks for rows and gets what RLS allows.

- `private.signed_in_artist_id()` matches the signed-in Google email to `artists.email`. No match means no data.
- `private.current_artist_id()` is whose rows to show. It's the signed-in member, or the member being viewed during View as (below). Every policy uses it.
- `private.is_leadership()` and `private.is_isrc_admin()` read checkboxes synced from Artists.
- A few functions share a little more than RLS would, on purpose:
  - `issue_isrc(song, kind)`: ISRC Admins only. Locks, picks the next `QT-3ZB-YY-NNNNN`, refuses duplicates.
  - `leadership_contributions()`: Leadership only. Every contribution with names.
  - `group_effort_takes()`: everyone signed in. Who, song and status for deliverables linked to a crew task.
  - `mix_queue()`: Mix Queue members only (Artists checkbox). Every unreleased song in a mix stage, in work order, with project, mixer, mastering engineer and anything still owed.
  - `mix_people()`: Mix Queue members only. Who can be picked as mixer or mastering engineer.
  - `demo_summary()`: everyone signed in. Who shared each demo and its reaction counts. `demo_comments()`: feedback with names, tags and the helpful mark, for the demo's owner and Leadership only.
  - `mark_feedback_helpful(demo, artist, on)`: the demo's sharer only. The helpful mark drives rewards, so `helpful_at` has no column grant and changes only here. `my_feedback_thanks()` / `seen_feedback_thanks()`: the giver's thank-you notices on Home. `crew_ears()`: per-member feedback and helpful counts (total, this month, last month) for badges and the monthly shout-out. Badge thresholds live in `EAR_BADGES` in docs/app.js.

**View as (Support).** `private.current_artist_id()` returns the member being viewed while a Support member has an open session in `view_as_sessions`, so every rule above applies unchanged. `private.signed_in_artist_id()` is always the real person. Writes check `private.viewing_as() is null`. Any new write path (insert policy or function that changes data) must add the same check. Sessions are started and ended only through `start_view_as()` and `stop_view_as()`, end after 30 minutes, and stay in the table as the log.

The site hides Leadership and ISRC pages from people without the flag, but that's only for tidiness. The database is what actually protects the data.

## The sync, step by step

1. **Push** (needs `NOTION_WRITE_TOKEN`)
   - `member_updates` → Notion: Mark submitted, Mark done, notes and links. Each one also leaves a comment. Gives up after 5 attempts. Reset `attempts` to retry.
   - `isrc_codes` issued in gryCE → the song's ISRC field in Notion, plus a comment. Never overwrites a different code.
2. **Pull**: query each Notion database, map properties to rows, upsert into Supabase, then delete rows that didn't come back (stale rows). Guards stop it from wiping a table if a database suddenly comes back empty, which usually means a connection lost access.
3. **Write back**: "Acknowledged by" on each announcement.

Newer tables and columns are optional: if one is missing, the sync logs "Skipped" and carries on. That's how a release can merge before its SQL runs without breaking anything.

## The site

- `docs/index.html`: the shell. Loads `config.js` (public URL and key), `version.js`, then `app.js`.
- `docs/app.js`: everything else, about 1,200 lines. Sections are marked with `// Name ----` comments.
  - `el(tag, attrs, ...children)` builds DOM. Falsy children are skipped and arrays are flattened one level, so `cond && el(...)` is the usual pattern. Nested arrays two levels deep print as text. This has caused bugs twice, so spread or `.flat()` them.
  - `refresh()` loads everything once after sign-in into `current`. `draw()` renders the view for `location.hash`.
  - Routes: `#mix`, `#support`, `#owe`, `#news`, `#crew`, `#projects`, `#projects/<id>`, `#works`, `#discography`, `#help`, `#isrc`, `#leadership`, `#leadership/documents`, `#leadership/contributions`.
  - Building blocks: `panel()` (a card), `group(tone, title, right, ...body)` (a colored box inside a card), `tile()` (Home and section cards), `jumpCards()` (cards that scroll to a group).
  - Drive upload (Share a demo): Google Identity Services asks for `drive.file` only when someone taps Upload, then a resumable upload goes straight from the browser to the member's Drive, into a GRYSKLL demos (gryCE) folder, shared anyone-with-link. Hidden unless `GOOGLE_CLIENT_ID` is set in `docs/config.js`.
  - Links: never print a raw URL. Use `linkButton(url, label?)` for a link field and `richText(tag, attrs, text)` for free text from Notion, which turns any URL in it into a button. `linkLabel()` names the button from the address.
  - Tones are green (done, money in), amber (waiting on you), orange (wants input), blue (tasks, songs, drafts), red (owed or holding things up) and gray. Use them the same way everywhere.
- `docs/help-full.js`: the member guide inside gryCE. Update it in the same release as any change members will see.
- `docs/help.html`: the public sign-in help.
- `docs/style.css`: one file. Later releases appended blocks marked `/* v0.4.x: ... */`.

### Previewing without signing in

Use `dev/preview.html` (see Kicking the tires). When a release adds a table, column or function the site reads, add made-up rows for it to `dev/demo.js` in the same release so the preview keeps working. Everything in `dev/` is invented: never put real crew data there. Check screens at 390px wide, since most of the crew is on a phone.

`docs/app.js` uses the demo only when `window.gryceDemo` is set, which only `dev/preview.html` does. `dev/` isn't under `docs/`, so the live site never serves it.

## Shipping a change

1. Branch from the latest `main`. Don't stack branches.
2. Bump `docs/version.js`: the last number for fixes and polish (0.4.17 → 0.4.18).
3. Add a `CHANGELOG.md` entry in plain words.
4. Database changes go in a new `supabase/migrations/vX-Y-name.sql`. Make it safe to run twice (`if not exists`, `create or replace`, drop then create policies). Add steps to the matching `V*-SETUP.md`, and add checks to `dev/tests.sql` for any rule it changes.
5. Run `dev/test-db.sh` and click through `dev/preview.html`.
6. Open a pull request, one release per PR. The Tests workflow must pass. Merge with squash.
7. Run the SQL in Supabase (SQL Editor) if there is any. Database changes are shown to Shaah and applied only after a yes.
8. Run the sync by hand: Actions → Sync Notion to Supabase → Run workflow. Check the last log line.
9. Cloudflare Pages deploys `main` in a minute or two. The footer shows the new version. A pull request gets its own preview link from Cloudflare; signing in there only works if that address is in Supabase's Redirect URLs.

Decisions go in the gryCE Master Reference as suggestions, with a Decision Log entry.

## Writing in this repo

- Plain language, written for the person maintaining it. Someone who isn't a developer should be able to follow the comments.
- No em dashes. Commas for asides, periods for breaks.
- In-app wording speaks to members ("you"), stays short, and never shames: "Still to go", not "Late".

## Cleanup list

Known debt, roughly in order of payoff:

1. **Tests cover the database only.** `dev/tests.sql` checks access rules, ISRC numbering and View as. Next: the sync's Notion-to-row mapping (feed it saved Notion responses), then the views (render `dev/preview.html` in a headless browser).
2. **`app.js` is one big file.** Split by section (owe, crew, projects, leadership, isrc) into modules. No build step is needed, since browsers load ES modules directly.
3. **Wording lives inside the code.** Move member-facing text into one file so it can be edited without touching logic.
4. **`schema.sql` stops at V3.** A new install has to run every migration in order. Fold the migrations into a fresh `schema.sql` at the next major version.
5. **`style.css` grows by appended version blocks.** Merge them into the main rules and remove overrides that fight each other.
6. **Notion property names are strings scattered through the sync.** Collect them into one map per database, like `TASK_PROPS` already does.
7. **Old names:** `takes`, `projectsView` (now the active project card), "Project updates" comments, the `.take-*` CSS classes used for every list row. Rename when touching nearby code.
8. **`optional()` swallows errors** so the sync stays green. Good for setup, but real failures only show as a "Skipped" line. Consider a summary that flags skips that weren't expected.
9. **Group efforts don't close themselves.** When every linked deliverable is in, someone still marks the task Done in Notion.

## Glossary

- **Deliverable:** one thing one person owes on a song. Called a take before November 20, 2026.
- **Group effort:** a crew task linked to deliverables, shown with progress.
- **Leadership Only:** a Music Projects checkbox. Hides a project from members while it's sorted out.
- **Show in gryCE:** a Music Projects checkbox. Gives a project its full card: outstanding, songs, funding.
- **Crewmunity:** supporters outside the crew. Their contributions aren't repaid.
- **Supporter:** a non-artist who contributed. Lives on the GRYSCO Leadership page.
