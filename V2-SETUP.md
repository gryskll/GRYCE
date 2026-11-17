# gryCE V2 setup

One push puts all the V2 code in place. Each feature switches on when its setup step is done. Until then the site and the sync skip it and stay green. Do the steps in this order. Test each one before moving on.

## 0. Push the code

Pick one.

**GitHub website.** In the gryCE repo: Add file, Upload files. Drag in the files from the zip, keeping the folders (`docs/`, `scripts/`, `supabase/migrations/`, `.github/workflows/`). Commit message: `gryCE V2`. Commit directly to `main`.

The `.github` folder is hidden on Mac. If Finder won't show it, open `.github/workflows/sync-notion.yml` in the repo, click the pencil, and add this line under `SUPABASE_SECRET_KEY:` with the same indent:

```
          NOTION_WRITE_TOKEN: ${{ secrets.NOTION_WRITE_TOKEN }}   # optional until the gryCE Write connection exists
```

**Command line.** From a clone of the repo: `git am gryce-v2.patch`, then `git push`.

GitHub Pages redeploys in a minute or two. Then Actions, Sync Notion to Supabase, Run workflow. It should finish green with the usual counts and a `Skipped tasks` warning. That warning is expected until step 2.

## 1. Discography and In the works

**SQL:** none. **Sync:** none. **Front end:** `docs/app.js`, `docs/style.css`.

Test: sign in. You should see separate In the works and Discography cards. Any song where you owe a take but have no credit shows in In the works with a "Take owed" tag.

## 2. Tasks

**SQL:** `supabase/migrations/v2-2-tasks.sql`
Supabase, the GRYSKLL organization, the gryCE project, SQL Editor, New query. Paste the whole file, Run. Expect "Success. No rows returned."

**Notion: done November 18.** GRYSKLL Tasks has a new `Assignee` relation to Artists. A task reaches gryCE when it has an Assignee, or when Owner is `Crew`, and then every linked member sees it. Q's acapellas task is assigned to Qthulhu. The lyric sheets coordinator task is still unassigned, so set its Assignee once you pick someone.

**Notion: give gryCE Sync read access to Tasks.** This one is yours.
GRYSKLL Tasks as a full page, `•••` top right, Connections, search `gryCE Sync`, Confirm.
The connection can technically read the whole list. The sync only asks Notion for tasks with an Assignee or Owner set to Crew, so nothing else leaves Notion.

**Sync:** already in the push. Run the workflow. The last line should now include `tasks`.

Test: once Q has a sign-in email on his Artists record, he should see the acapellas task under Your tasks. Ask one crew member to sign in and confirm they see only their own tasks and Crew tasks.

## 3. Announcements

**SQL:** `supabase/migrations/v2-3-announcements.sql`, same path as step 2.

**Notion: done November 18.** Announcements lives at GRYSKLL Music Catalog, gryCE, Announcements. It has Title, Body, Audience, Project, Artists, Publish date, Expires and Acknowledged by. The first announcement is in it: MCP vocalists, Audience Project vocalists, Project McCain Chose Palin, published November 18. Its ID is already in `scripts/sync-notion.mjs`.

gryCE Sync already reads the Music Catalog, so it reaches Announcements and Music Projects with no extra step. If the run says `Skipped announcements`, open Announcements, `•••`, Connections, and add `gryCE Sync`.

Run the workflow. The last line should include `announcements`.

Test: sign in as an MCP vocalist (or ask one). Crew news shows at the top with an Acknowledge button. Sign in as someone not on MCP and confirm they don't see it. Click Acknowledge, and it moves to Read.

## 4. Member updates

**SQL:** `supabase/migrations/v2-4-member-updates.sql`. Step 2's SQL has to run first.

**Notion: create the gryCE Write connection.**
1. Notion Settings, Connections, Develop or manage integrations, New integration.
2. Name: `gryCE Write`. Workspace: GRYSKLL. Type: Internal. Save.
3. Capabilities: Read content on, Update content on, Insert content off, Read comments off, Insert comments on. User information: No user information. Save.
4. Access tab (or each database's `•••`, Connections): add `gryCE Write` to these three databases only: Takes, GRYSKLL Tasks, Announcements. Nothing else.
5. Configuration tab: copy the Internal Integration Secret. Don't paste it anywhere but the next step.

**GitHub: save the token.**
gryCE repo, Settings, Secrets and variables, Actions, New repository secret. Name: `NOTION_WRITE_TOKEN`. Secret: paste it. Add secret.

**Sync:** already in the push. With the secret set, every run pushes pending updates first, then pulls, then writes Acknowledged by.

Test:
1. In gryCE, on one of your open takes: Mark submitted, add a link and a note, Send. The row shows "Marked submitted. It shows up in Notion within 30 minutes."
2. Run the workflow. In Notion, that take's Status is Submitted and there's a comment from gryCE Write with your note and link.
3. Refresh gryCE. The take sits under "Submitted, waiting on review".
4. Mark a task done the same way.
5. Open the MCP announcement in Notion. Acknowledged by lists everyone who clicked.

If a push fails 5 times, the member sees "Your update didn't reach Notion. Tell Shaah." The reason is in Supabase, Table Editor, `member_updates`, `error` column.

## Rules the code enforces

- Members insert updates only. They can't edit or delete them, or touch any synced table.
- Takes go to Submitted, tasks go to Done. Nobody can set Accepted from gryCE. If a take was accepted in the meantime, the sync leaves the status alone and just comments.
- Only takes that are still Owed or Needs Decision, and only tasks with your name in Assignee. Crew tasks without your name are read only.
- Acknowledgements are never deleted by the sync, even if the announcement is.
- An unknown Audience value reaches nobody until it's added to the sync.

## First announcement body

If you're on McCain Chose Palin, we need your lyrics now. Session 2 of The Listening Study runs on lyric sheets, and we can't hold it without yours.

Your sheets are already made. Open the Lyrics folder, find the sheet for every MCP song you're on, and type your lyrics under your name. They're overdue, so please get them in today.

Lyrics folder: https://drive.google.com/drive/folders/1sokrQZHV5lS7TcDt2r7v1w21AMFKKwJt

Hit Acknowledge once you've read this.

gry8ful,
Shaah
