# gryCE V3 setup: project funding

V3 adds a funding card to the member dashboard. For each project with funding stages, it shows the stage that's open now, what's been raised, the goal so far, and the items the money pays for. A member who put money in also sees what they're owed and which stage pays it back.

Every linked member sees stages, items and dollar amounts. Contributions are private: each member sees only their own.

Until step 1 is done, the site and the sync skip funding and stay green.

## 1. Supabase tables

**SQL:** `supabase/migrations/v3-1-funding.sql`
Supabase, the GRYSKLL organization, the gryCE project, SQL Editor, New query. Paste the whole file, Run. Expect "Success. No rows returned."

## 2. Notion

**Done November 19.** Three databases live at GRYSKLL Music Catalog, gryCE:

- **Funding Stages:** one row per stage, linked to its project in Music Projects. Type Raised by hand. The goal isn't typed anywhere. It's the sum of the stage's item quotes.
- **Funding Items:** what each stage pays for. Leave Quote blank and Status on Needs quote until there's a price.
- **Contributions:** one row per payment, linked to the person's Artists record. Repayment is Owed, Repaid or Not repaid.

gryCE Sync already reads everything on the gryCE page, so there's no connection step. If a run says `Skipped funding stages`, `Skipped funding items` or `Skipped contributions`, open that database, `•••`, Connections, and add `gryCE Sync`.

## 3. Run the sync

Actions, Sync Notion to Supabase, Run workflow. The last line should include `funding stages`, `funding items` and `contributions`.

## Test

1. Sign in. Below Your tasks there's a McCain Chose Palin funding card on Stage 2, Move It, with five items waiting on quotes.
2. Open All stages. Stage 1 shows $985 of $1,200, Complete.
3. Sign in as someone with an Owed contribution (or ask one). They see what they've put in and that it's paid back in Stage 3. Someone with no contribution sees no owed line.

## Keeping it current

- New money in: update Raised on the stage, and add a row in Contributions.
- New quote: put the amount in Quote and set Status to Quoted. The goal updates on the next sync.
- Stage moves on: set the old stage to Complete and the next one to Underway. The card follows.

## v0.3.2: tiles, Requests and Project updates

**SQL:** `supabase/migrations/v3-2-projects.sql`, same path as step 1. Run it before the next sync, or announcements stop updating until you do.

**Notion: done November 19.**
- Announcements has a **Type** field: Request or News. Requests show under What you owe. News, or blank, shows under Crew news.
- Music Projects has a **gryCE Update** field. Whatever you type there shows at the top of that project in Project updates.
- Project updates shows only projects with **Show in gryCE** ticked in Music Projects, with each song's Development Stage and the project's funding. McCain Chose Palin is ticked.
