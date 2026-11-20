-- gryCE v0.4.18: notes for developers, stored on the tables themselves.
-- Supabase shows these in Table Editor and in the API docs, and `\d+ table` shows them in psql.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Full picture: DEVELOPERS.md in the repo.

comment on table public.artists is
  'Synced from the Notion Artists database. One row per artist. email is the Google sign-in that links a member to their row. Legal name, IPI, PRO, publisher and contact email stay in Notion and are never copied here.';
comment on column public.artists.leadership is 'Notion checkbox "Leadership". Sees every contribution and the document registry.';
comment on column public.artists.isrc_admin is 'Notion checkbox "ISRC Admin". Can call issue_isrc().';
comment on column public.artists.also_known_as is 'Past or alternate artist names, so older credits still match.';

comment on table public.songs is
  'Synced from the Notion Songs database. Members only see songs they are credited on or owe something on. ISRC Admins see every song.';

comment on table public.song_credits is
  'Synced from the role relations on each Notion song (Producer, Vocals, Mixing, Mastering, Visual Art). One row per artist per role per song.';

comment on table public.takes is
  'Shown in gryCE and Notion as "Deliverables". Renamed from Takes on November 20, 2026; the table keeps its old name so nothing breaks. One row per person per thing owed on a song: verse, hook, beat, stems, lyrics, mix, artwork. Synced from the Notion Deliverables database. Members see only their own; group_effort_takes() shares who and status for ones linked to a crew task.';
comment on column public.takes.status is 'Needs Decision, Owed, Submitted, Accepted or Not used. Members move Owed to Submitted through member_updates. Leadership moves it to Accepted in Notion.';

comment on table public.tasks is
  'Synced from the Notion GRYSKLL Tasks database: tasks with an Assignee, plus crew tasks (Owner = Crew). The private Notes field is never synced. A crew task with linked_take_ids is a group effort.';
comment on column public.tasks.linked_take_ids is 'Notion relation "Linked Deliverables". The deliverables a group effort depends on.';
comment on column public.tasks.gryce_note is 'Notion field "gryCE Note". The crew-facing line shown with the task.';

comment on table public.announcements is 'Synced from Notion Announcements. Type Request means members are asked to acknowledge it.';
comment on table public.announcement_acks is 'Written by members from the site when they tap Acknowledge. The sync pushes them to Notion as comments.';
comment on table public.member_updates is
  'Outbox. Members write here from the site (Mark submitted, Mark done, notes). The sync sends each row to Notion with the gryCE Write connection, then sets processed_at. Gives up after 5 attempts; reset attempts to retry.';

comment on table public.funding_stages is 'Synced from Notion Funding Stages. Everyone signed in sees amounts.';
comment on table public.funding_items is 'Synced from Notion Funding Items: what each stage pays for, with quotes.';
comment on table public.contributions is
  'Synced from Notion Contributions. Members see only their own; Leadership sees all through leadership_contributions(). contributor_name is the row title; person_linked comes from the Notion formula "Linked to Person".';

comment on table public.projects is 'Full cards for projects ticked "Show in gryCE": summary, songs with stages and what is owed.';
comment on table public.project_index is
  'Every Music Project: name, status, type, date, song names and stages. Everyone signed in sees it, except projects ticked "Leadership Only", which only Leadership sees.';

comment on table public.isrc_codes is
  'Every ISRC code. Loaded from Notion so numbering continues; new codes only come from issue_isrc(), which locks, picks the next QT-3ZB-YY-NNNNN and refuses duplicates. The sync writes new codes to the song in Notion.';
comment on table public.documents is 'Synced from the Notion Document Number Registry on the GRYSCO Leadership page. Leadership only.';

comment on function public.issue_isrc(uuid, text) is 'ISRC Admins only. Returns the next ISRC code for a song and records it. Never reuses a number.';
comment on function public.leadership_contributions() is 'Leadership only. Every contribution with contributor, project and stage names.';
comment on function public.group_effort_takes() is 'Signed-in members. Who, song, type and status for deliverables linked to crew tasks, so the crew sees group effort progress.';
