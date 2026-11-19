// Full help for signed-in members. Shown at #help once someone is linked.
// The public help.html only covers getting signed in.
// Static text written here, nothing from the database, so a template is safe.
const HELP = `
<p class="muted help-intro">gryCE, the GRYSKLL Creative Engine, is the crew's member portal. Here's how each part works.</p>
<section class="card">
      <h2>Home</h2>
      <p>Home is six tiles. Tap one to open it. Your phone's back button, or <strong>‹ All sections</strong>, brings you back.</p>
      <ul>
        <li><strong>What you owe:</strong> everything waiting on you.</li>
        <li><strong>Crew news:</strong> announcements for the crew.</li>
        <li><strong>Crew tasks:</strong> open jobs for the whole crew.</li>
        <li><strong>Project updates:</strong> where each active project stands.</li>
        <li><strong>In the works:</strong> songs with your name on them that aren't out yet.</li>
        <li><strong>Discography:</strong> your released songs.</li>
      </ul>
      <p class="muted">A red tile means something's overdue. An amber tile means something's waiting on you or unread.</p>
    </section>
<section class="card">
      <h2>What you owe</h2>
      <p>This is the section to check first. It's split into:</p>
      <ul>
        <li><strong>Requests:</strong> things Shaah or the crew asked everyone for, like lyric sheets. Tap <strong>Acknowledge</strong> once you've seen it.</li>
        <li><strong>Takes:</strong> verses, hooks, beats and re-records you owe, with due dates. Overdue ones are flagged in red.</li>
        <li><strong>Tasks:</strong> tasks assigned to you.</li>
        <li><strong>Submitted, waiting on review:</strong> takes you've turned in that Shaah hasn't checked yet.</li>
        <li><strong>Done:</strong> tap it to see what's finished. A take marked <strong>Not used</strong> was reviewed and left off the song. You don't owe anything on it.</li>
      </ul>
    </section>
<section class="card">
      <h2>Sending updates</h2>
      <p>You can update your own takes and tasks right from gryCE.</p>
      <ul>
        <li><strong>Mark submitted</strong> on a take tells Shaah it's in. Add a link to the file and a note if you want. Shaah reviews it and marks it accepted.</li>
        <li><strong>Mark done</strong> on a task closes it out.</li>
        <li><strong>Add a note</strong> sends Shaah a note without changing anything.</li>
      </ul>
      <p>Links need to start with https://. Updates reach GRYSKLL's records within 30 minutes. Until then you'll see a blue note under the item saying it's on its way.</p>
      <p class="muted">If you see "Your update didn't reach Notion," text Shaah so he can check it.</p>
    </section>
<section class="card">
      <h2>Crew news and tasks</h2>
      <p><strong>Crew news</strong> shows the newest announcements first. Tap <strong>Acknowledge</strong> so Shaah knows you saw it. Read ones move to the bottom.</p>
      <p><strong>Crew tasks</strong> are jobs for the whole crew. Anyone can see them. Only the person a task is assigned to can mark it done, and tasks assigned to you show under What you owe.</p>
    </section>
<section class="card">
      <h2>Project updates</h2>
      <p>Each active project gets its own card with:</p>
      <ul>
        <li><strong>Release date</strong> and a short summary.</li>
        <li><strong>Outstanding:</strong> what the project is still waiting on, by person. Everyone sees this list, so the crew knows what's holding things up.</li>
        <li><strong>Songs:</strong> how many songs are at each stage, from Arrangement through Released. Tap <strong>Song by song</strong> for the full list. <strong>Awaiting Mix Funding</strong> means a song is ready to mix and waiting on the money to pay for it.</li>
        <li><strong>Funding:</strong> the stage that's open now, what's been raised against the goal, and what the money pays for. A stage's goal goes up as price quotes come in. It opens on the current stage. Tap <strong>All stages</strong> to see every stage and what each one pays for.</li>
      </ul>
      <p>If you've put money into a project, you'll also see how much you put in, and which stage pays it back at face value.</p>
    </section>
<section class="card">
      <h2>Your music</h2>
      <p><strong>Discography</strong> lists every released song you're credited on, newest first, with your roles. Tap a song title to listen when there's a link.</p>
      <p><strong>In the works</strong> lists songs you're on that aren't out yet, with their stage and target date. Songs where you still owe a take are at the top.</p>
    </section>
<section class="card">
      <h2>Who sees what</h2>
      <ul>
        <li>Only GRYSKLL members who are linked can see anything. A login that isn't linked sees nothing.</li>
        <li>Your own page is yours. Other members don't see your What you owe list or how much you've put into a project.</li>
        <li>Takes still owed on an active project do show in that project's Outstanding list, by name.</li>
        <li>Everyone sees crew news, crew tasks, each project's Outstanding list, and funding stages with dollar amounts.</li>
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
