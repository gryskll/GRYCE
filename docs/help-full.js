// Full help for signed-in members. Shown at #help once someone is linked.
// The public help.html only covers getting signed in.
// Static text written here, nothing from the database, so a template is safe.
const HELP = `
<p class="muted help-intro">gryCE, the GRYSKLL Creative Engine, is the crew's member portal. Here's how each part works.</p>
<section class="card">
      <h2>Home</h2>
      <p>Home is six tiles. Tap one to open it. Your phone's back button, or <strong>‹ All sections</strong>, brings you back. The <strong>How gryCE works</strong> button at the top of Home opens this guide.</p>
      <ul>
        <li><strong>What you owe:</strong> everything waiting on you.</li>
        <li><strong>Crew news:</strong> announcements for the crew.</li>
        <li><strong>Crew tasks:</strong> open jobs for the whole crew.</li>
        <li><strong>Projects:</strong> the active project up top, then everything else in the pipeline.</li>
        <li><strong>In the works:</strong> songs with your name on them that aren't out yet.</li>
        <li><strong>Discography:</strong> your released songs.</li>
      </ul>
      <p>ISRC Admins and the Leadership Team get one more tile each. Both are explained further down.</p>
      <p class="muted">A red tile means something's overdue. An amber tile means something's waiting on you or unread.</p>
      <p>Inside each section, things are grouped in colored boxes so you can tell them apart at a glance. Red is something owed or holding a project up, amber is waiting on you, orange wants your input, blue is tasks, songs and drafts, and green is money raised or approved. Each box shows how many items it holds.</p>
    </section>
<section class="card">
      <h2>What you owe</h2>
      <p>This is the section to check first. Cards across the top show how much is in each part. Tap one to jump to it. It's split into:</p>
      <ul>
        <li><strong>Requests:</strong> things Shaah or the crew asked everyone for, like lyric sheets. Tap <strong>Acknowledge</strong> once you've seen it.</li>
        <li><strong>Deliverables:</strong> what you owe on a song, like verses, hooks, beats, stems, lyrics, mixes and artwork, with due dates. Overdue ones are flagged in red.</li>
        <li><strong>Tasks:</strong> tasks that are yours. Only you see them.</li>
        <li><strong>Submitted, waiting on review:</strong> deliverables you've turned in that Shaah hasn't checked yet.</li>
        <li><strong>Done:</strong> tap it to see what's finished. A deliverable marked <strong>Not used</strong> was reviewed and left off the song. You don't owe anything on it.</li>
      </ul>
    </section>
<section class="card">
      <h2>Sending updates</h2>
      <p>You can update your own deliverables and tasks right from gryCE.</p>
      <ul>
        <li><strong>Mark submitted</strong> on a deliverable tells Shaah it's in. Add a link to the file and a note if you want. Shaah reviews it and marks it accepted.</li>
        <li><strong>Mark done</strong> on a task closes it out.</li>
        <li><strong>Add a note</strong> sends Shaah a note without changing anything.</li>
      </ul>
      <p>Links need to start with https://. Updates reach GRYSKLL's records within 30 minutes. Until then you'll see a blue note under the item saying it's on its way.</p>
      <p class="muted">If you see "Your update didn't reach Notion," text Shaah so he can check it.</p>
    </section>
<section class="card">
      <h2>Crew news and tasks</h2>
      <p><strong>Crew news</strong> shows the newest announcements first. Tap <strong>Acknowledge</strong> so Shaah knows you saw it. New ones are at the top. Read ones fold away at the bottom.</p>
      <p><strong>Crew tasks</strong> are jobs for the whole crew. Anyone can see them. Only the person a task is assigned to can mark it done, and tasks assigned to you show under What you owe. Tasks are grouped by where they stand: Overdue, In progress, Waiting on someone and Not started.</p>
      <p><strong>Group efforts</strong> sit at the top of Crew tasks. They're things the whole crew is finishing together, like getting everyone's lyrics in. Each one shows how many are in, thanks the people who are done, and lists who's still to go. If you know someone on that list, check in and see if they need a hand. Your own part shows under What you owe, where you mark it submitted.</p>
    </section>
<section class="card">
      <h2>Projects</h2>
      <p>Projects is a page of cards, one per GRYSKLL project. The active project is first, then everything else grouped by where it stands. The number on each card is how many songs it has. Tap a card to open the project and see its songs, grouped by stage. <strong>‹ Projects</strong> brings you back.</p>
      <p>The active project's page also has its full card:</p>
      <ul>
        <li><strong>Release date</strong> and a short summary.</li>
        <li><strong>Outstanding:</strong> what the project is still waiting on, by person. Everyone sees this list, so the crew knows what's holding things up.</li>
        <li><strong>Songs:</strong> how many songs are at each stage, from Arrangement through Released. Tap <strong>Song by song</strong> for the full list. <strong>Awaiting Mix Funding</strong> means a song is ready to mix and waiting on the money to pay for it.</li>
        <li><strong>Funding:</strong> the stage that's open now, what's been raised against the goal, and what the money pays for. A stage's goal goes up as price quotes come in. It opens on the current stage. Tap <strong>All stages</strong> to see every stage in its own box: green when it's done, amber for the one that's open, gray for the ones still to come.</li>
      </ul>
      <p>If you've put money into a project, you'll also see how much you put in, and which stage pays it back at face value.</p>
      <p>The other projects are grouped In Production, Mixing &amp; Mastering, Planning, On Hold, Concept and Released, so you can see what's coming up and where you might fit in.</p>
    </section>
<section class="card">
      <h2>Your music</h2>
      <p><strong>Discography</strong> lists every released song you're credited on, grouped by year, newest first, with your roles. Tap a song title to listen when there's a link.</p>
      <p><strong>In the works</strong> lists songs you're on that aren't out yet, grouped by stage, closest to release first. Songs where you still owe something are in a red group at the top.</p>
    </section>
<section class="card">
      <h2>ISRC codes</h2>
      <p>ISRC Admins get an <strong>ISRC codes</strong> tile. It lists every song without a code. Tap <strong>Issue code</strong>, pick Original for a first release or Reissue for a song GRYSKLL is putting out again, then <strong>Issue</strong>.</p>
      <p>gryCE picks the next number, so two people can never get the same code. The code shows right away with a Copy button, and it lands on the song in GRYSKLL's records within 30 minutes. A code can never be reused, so check the song before you tap Issue.</p>
    </section>
<section class="card">
      <h2>Leadership</h2>
      <p>The GRYSCO Leadership Team gets a <strong>Leadership</strong> tile. It opens on two section cards, Documents and Contributions. Tap one to open it, and <strong>‹ Leadership</strong> brings you back.</p>
      <ul>
        <li><strong>Documents:</strong> what's waiting on Leadership right now, then every other GRY-DOC number with its link, grouped by status: Draft, Approved and Reserved.</li>
        <li><strong>Projects:</strong> you also see projects marked Leadership only, with a tag. They're still being sorted out, so the rest of the crew doesn't see them yet.</li>
        <li><strong>Contributions:</strong> every payment toward a project and who made it, grouped by project, then funding stage, then contributor type (Crew, Crewmunity, Family loan). Money that came in before a campaign started shows first, under <strong>Before the album</strong>. Each group shows what's come in and what's still owed back.</li>
      </ul>
      <p>Every contribution is tied to a person, a crew member or a supporter, so Leadership can follow up with updates, thank-yous and gifts. Supporters' contact details stay in GRYSKLL's records and never show in gryCE. A contribution not tied to anyone yet gets an amber <strong>Link to a person in Notion</strong> tag.</p>
      <p>Two kinds of document wait on Leadership, and both also show under <strong>What you owe</strong>:</p>
      <ul>
        <li><strong>Input needed:</strong> a draft that wants everyone's thoughts. Open it and comment in the doc.</li>
        <li><strong>Ready for approval:</strong> a final draft submitted under the Document Approval Policy.</li>
      </ul>
    </section>
<section class="card">
      <h2>Mix queue</h2>
      <p>Q runs the mix queue and Shaah backs him up, so they get a <strong>Mix queue</strong> tile. It lists every unreleased song in a mix stage, in the order the work happens: Mixing now, Up next (mix prep), Mastering, then Waiting on mix funding.</p>
      <p>Each song shows its project, who's mixing and mastering it, and anything still owed on it, so you can see what's holding a mix up. To move a song along, change its Development Stage in Notion. gryCE catches up within 30 minutes.</p>
    </section>
<section class="card">
      <h2>Support: View as</h2>
      <p>Support members get a <strong>Support</strong> tile. Pick a member and tap <strong>View as</strong> to see gryCE the way they do, so you can walk them through it. A banner across the top says who you're viewing as. Tap <strong>Exit</strong> to go back to your own page. It also ends by itself after 30 minutes.</p>
      <p>While you're viewing as someone, nothing can be sent: no Mark submitted, notes, acknowledgements or ISRC codes. Every view is logged, and the Leadership Team can see the log.</p>
    </section>
<section class="card">
      <h2>Who sees what</h2>
      <ul>
        <li>Only GRYSKLL members who are linked can see anything. A login that isn't linked sees nothing.</li>
        <li>Your own page is yours. Other members don't see your What you owe list. How much you've put into a project is only seen by you and the Leadership Team.</li>
        <li>Deliverables still owed on an active project do show in that project's Outstanding list, by name.</li>
        <li>Everyone sees crew news, crew tasks, each project's Outstanding list, and funding stages with dollar amounts.</li>
        <li>The Leadership Team also sees everyone's contributions and the document registry.</li>
        <li>ISRC Admins also see every song's ISRC codes.</li>
        <li>To help you, Support (Shaah and Q for now) can view your page exactly as you see it. It's read only, so they can't change or send anything for you, and every view is logged for the Leadership Team.</li>
        <li>Nobody can see your email address through gryCE.</li>
      </ul>
    </section>
<section class="card">
      <h2>Something looks wrong</h2>
      <p>gryCE pulls from GRYSKLL's records every 30 minutes, so a change can take that long to show up. If a credit is missing, a song is in the wrong place, or a due date looks off, text Shaah what you see. A screenshot helps.</p>
    </section>
<section class="card">
      <h2>Your account</h2>
      <p>Want to switch to a different Google account? Text Shaah the new one, then sign out (top right) and sign in with it.</p>
      <p class="muted">On your phone, add gryCE to your home screen so it opens like an app. On iPhone, tap Share, then Add to Home Screen. On Android, tap the menu, then Add to Home screen.</p>
    </section>
`;

export function helpView() {
  const t = document.createElement('template');
  t.innerHTML = HELP;
  const wrap = document.createElement('div');
  wrap.className = 'help';
  wrap.append(t.content);
  return wrap;
}
