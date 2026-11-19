# gryCE

GRYSKLL Creative Engine. A member portal: crew members sign in with Google and see crew news, the takes and tasks they owe, where project funding stands, what's in the works, and their GRYSKLL discography. Members can mark their own takes submitted and their own tasks done, add a note, and acknowledge announcements.

## How it fits together

- **Notion** is the source of truth: the Music Catalog (Artists, Songs, Takes, Music Projects, and Announcements, Funding Stages, Funding Items and Contributions on its gryCE page), GRYSKLL Tasks (only tasks with an Assignee or Owner set to Crew).
- **GitHub Action** (`.github/workflows/sync-notion.yml`) runs every 30 minutes. It pushes members' pending updates to Notion first, then copies Notion into Supabase, then writes "Acknowledged by" back to each announcement. Run it by hand from the Actions tab for an instant sync.
- **Two Notion connections.** gryCE Sync reads. gryCE Write can edit only Takes, Tasks and Announcements, and is only used to push member updates and acknowledgements.
- **Supabase** holds the copy, handles Google sign-in, and uses row level security so each member only sees their own rows.
- **GitHub Pages** serves the site from `docs/`.

## Version

The version shows in the footer of every page, including sign-in. It lives in one place, `docs/index.html`. V1 was 0.1, V2 was 0.2, and V3 is 0.3. It stays under 1.0 while gryCE is in development. Bump it with every release.

## Access

A member can see their page when their Google sign-in email is in the **Email** field of their Artists record in Notion. Adding the email is the approval. Anyone else who signs in sees a "not linked yet" message and no data.

Members never edit synced tables. Updates go into `member_updates` (insert only, own open items only, never Accepted). Acknowledgements go into `announcement_acks`, which the sync never deletes.

## Setup checklist

1. Run `supabase/schema.sql` in the Supabase SQL Editor. For an existing V1 project, run the files in `supabase/migrations/` in order instead.
2. Repo secrets (Settings → Secrets and variables → Actions):
   - `NOTION_TOKEN`: gryCE Sync connection token
   - `SUPABASE_URL`: Supabase project URL
   - `SUPABASE_SECRET_KEY`: Supabase secret key
   - `NOTION_WRITE_TOKEN`: gryCE Write connection token (optional; without it, member updates wait)
3. Put the project URL and publishable key in `docs/config.js`. Both are public by design.
4. Settings → Pages: deploy from branch `main`, folder `/docs`. Set the custom domain once DNS points at GitHub.

## Files

| Path | What it is |
| --- | --- |
| `supabase/schema.sql` | Tables, access rules, grants (V1 + V2 + V3) |
| `supabase/migrations/` | V2 and V3 changes, one file per step |
| `V2-SETUP.md` | V2 setup steps and click paths |
| `V3-SETUP.md` | V3 funding setup steps |
| `scripts/sync-notion.mjs` | Push member updates, Notion → Supabase sync, write-back. No dependencies |
| `.github/workflows/sync-notion.yml` | Runs the sync on a schedule |
| `docs/` | The member portal |
