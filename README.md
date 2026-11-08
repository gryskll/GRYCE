# gryCE

GRYSKLL Creative Engine. V1 is a member portal: crew members sign in with Google and see the takes they owe and their GRYSKLL discography.

## How it fits together

- **Notion (GRYSKLL HQ NEW → GRYSKLL Music Catalog)** is the source of truth for Artists, Songs, and Takes.
- **GitHub Action** (`.github/workflows/sync-notion.yml`) copies Notion into Supabase every 30 minutes. Run it by hand from the Actions tab for an instant sync.
- **Supabase** holds the copy, handles Google sign-in, and uses row level security so each member only sees their own rows.
- **GitHub Pages** serves the site from `docs/`.

## Access

A member can see their page when their Google sign-in email is in the **Email** field of their Artists record in Notion. Adding the email is the approval. Anyone else who signs in sees a "not linked yet" message and no data.

## Setup checklist

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Repo secrets (Settings → Secrets and variables → Actions):
   - `NOTION_TOKEN`: gryCE Sync connection token
   - `SUPABASE_URL`: Supabase project URL
   - `SUPABASE_SECRET_KEY`: Supabase secret key
3. Put the project URL and publishable key in `docs/config.js`. Both are public by design.
4. Settings → Pages: deploy from branch `main`, folder `/docs`. Set the custom domain once DNS points at GitHub.

## Files

| Path | What it is |
| --- | --- |
| `supabase/schema.sql` | Tables, access rules, grants |
| `scripts/sync-notion.mjs` | Notion → Supabase sync, no dependencies |
| `.github/workflows/sync-notion.yml` | Runs the sync on a schedule |
| `docs/` | The member portal |
