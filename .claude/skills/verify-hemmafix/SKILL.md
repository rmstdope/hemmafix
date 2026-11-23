---
name: verify-hemmafix
description: Hemmafix's verification skill, named by `verification_skill` in .cerebro/project.conf. Psylocke verifies merged beads that change what a family member sees or does by running the merged production build locally on its own `hemmafix_verify` database, never on the family's real home. She batches related beads into one look, uses the navigator's kept Google login, builds the home each look needs, checks phone and desktop, the Swedish words, adult and child, and live updates, drives MCP beads through the MCP Inspector, hands the navigator only what a person must judge, explores near the change, and presents evidence, a recommended pass or fail per bead, and proposed follow-up beads.
---

# Verifying Hemmafix beads

This skill **extends `verify-bead`; it does not replace it.** Load `verify-bead` first and follow it,
together with `agents/verifier.md`: the candidates, the fresh `origin/main` worktree, the commit
check, `verification=pending`, the sha in every verdict, the report written onto the bead before
asking, the port refusal, *The navigator's window*, the recipes in *Taking the verdict*, and the end
of a pass. Where this file is more specific, this file wins; it replaces the type of a proposed
follow-up (*Present the results*).

Every question below is the verifier's three-action sandwich: `asking --bead <id> --phase <phase>`,
the question, then `working --bead <id> --phase <phase>` before anything else. The phase is
`prepare` until you start the server, and `verify` from then on. In a batch, `--bead` is the first
bead of the batch.

Below, **the tree** is the verification worktree, `.cerebro/worktrees/psylocke`, and **the verify
home** is the household in the local `hemmafix_verify` database. `scripts/verify-app.mjs` in the
tree is the one tool for both; run it from the tree as `node --env-file=.env scripts/verify-app.mjs
<command>`, shortened to `verify-app <command>` below.

What needs protecting here is the family's real home and the navigator's own data: the verify home
is the only household you ever change.

## Which beads are looked at

The verifier's classification decides: `app-paths --classify` says `application` for anything
under `src/`, `public/` or `next.config.ts`. Everything it calls `invisible` is marked
`not-needed` silently. Never widen or narrow that by judgement. If a classified bead changes
nothing a person can notice (a refactor of `src/server/`, a test-only change), still look briefly
at the surface it feeds, and say in the report that the look found nothing visible to check.

## Batch beads into one look

Starting the build and building the home's state is the expensive part, so share it. After the
candidate lists and the epic sweeps (which batch themselves through `verifier-epic-candidates`),
group the ordinary candidates. One `prepare-worktree --prewarm` per batch satisfies the fresh tree
and puts every bead of the batch at the same sha.

- **Batch together** beads that share a journey: the same page (the list, a room, Hemmet, the
  login, the approval page), the same workflow (adding and ticking off a chore, managing rooms and
  floors, connecting an app), or the same home state (the same rooms, chores and family).
- **Keep apart** a bead whose look needs a state that would spoil the others' (an empty home, a
  child session, a connected app revoked), and a reopened `verification:failed` bead: its rebuild
  deserves its own clean look.
- **At most four beads per batch**: the verdict call asks one question per bead.

Say each batch and its reason in one line before launching ("batch A: hf-gzr.4, hf-gzr.5, both
change Hemmet, one run at `<short sha>`"). Then, per batch:

1. Prepare every bead (verify-bead's *Prepare*): one checklist per bead, criterion by criterion,
   naming the role (adult or child) and the screen size each criterion needs.
2. Launch once (*The verify home*, then *Launching*).
3. Walk the beads in the order that builds the states most cheaply, keeping a separate evidence log
   per bead. A screenshot can serve two beads; name it in both logs.
4. Collect every human check in the batch into **one** hand-off.
5. Explore once for the whole batch.
6. Write **one report per bead** (`Verification report at <full sha>`), then ask for the batch's
   verdicts in **one** call of the question tool, one question per bead.

A batch never merges verdicts: each bead passes or fails on its own evidence.

## The verify home

**Never open hemmafix.rmstdope.eu, and never point the app at the navigator's dev database.** The
production site is the family's real home, and every journey worth looking at changes it. A state
the verify home cannot be brought into is a gap, and a question to the navigator if it decides the
verdict.

The database lives on the same local Postgres as the tree's `DATABASE_URL` (the helper refuses any
other host) and is **never dropped**: its users, Google accounts and sessions survive every reset.
That is how the navigator's login carries over: the app keeps a session for 60 days, renewed on use,
so they log in once and every look after reuses it.

- **Start every look with `verify-app reset`**, then `verify-app status`: whatever an earlier look,
  or a review of an outside pull request, left in the home is gone, and the home is named
  **Familjen (verifiering)**. `status` shows every member with their role, whether they can log in,
  until when their login lasts, and how many floors, rooms, chores, routines, lists, registered clients and
  connections there are. Put its output in each report. If the helper refuses because the database
  holds a migration this tree does not know, that is a blocker: ask the navigator, and never drop the
  database yourself.
- **No working login** (no member with `logs_in` true and a `login_until` in the future): ask the
  navigator once, under `verify`, right after the server answers `/healthz`, to log in at
  `http://localhost:3000` in their Chrome. **Never type, fill or see their Google credentials**: the Google pages are theirs.
  The login is shared with any other server on `localhost:3000`, so their own dev server's login
  replaces it, and vice versa; that is expected, not a fault.
- Build the state a bead needs **through the app**, as a family member would: floors, rooms, chores,
  assignments, ticks. That walk is part of the evidence.
- Two states the app cannot make, the helper makes, and only these:
  - `verify-app role <navigator's email> child` (and `adult` to go back): a child session, since a
    home always keeps an adult and the navigator is its only one. Reload the page after.
  - `verify-app member <name> <adult|child>`: a family member who never logs in, to assign chores to
    and to see in Hemmet.
- List every helper call in the report: it is part of the setup.

## Launching

`launch_web` is `node --env-file=.env scripts/verify-app.mjs serve`, from the tree. It migrates the
verify database to the tree, copies the static assets into the standalone build, and serves the
merged production build on port **3000**, the one local address Google sends a login back to. The
build itself is the verifier's `prewarm` (`pnpm build`), run by `prepare-worktree --prewarm`. Run it
exactly as declared, in the background, and wait for `/healthz` to answer 200.

Port 3000 is often the navigator's own dev server: the port refusal in verify-bead stands. Name the
pid holding it, never stop or reuse it, and wait for them to free it.

**Act only on the server you started**: open `http://localhost:3000/` (not `127.0.0.1`: the login
cookie belongs to `localhost`), act only in tabs you opened, and before the first action confirm the
page names the home **Familjen (verifiering)**. Any other name means you are not on the verify home:
stop.

To stop the server, send SIGTERM to the `verify-app serve` process you started (it passes it on to
the server; the pid on port 3000 is the server's, not yours), then confirm port 3000 is free.

## The look, for Hemmafix

On top of verify-bead's *Look*, check what the acceptance touches:

- **The mockup.** A bead agreed with a mockup names it in its acceptance, under
  `docs/ui/<bead>-<slug>.html`. Open it in a second tab (`file://<absolute path of the
  tree>/docs/ui/<file>.html`), compare side by side, and screenshot both. If Chrome refuses
  `file://`, serve the tree's `docs/ui` yourself: the first free port from 3010 up (`lsof -nP
  -iTCP:<port> -sTCP:LISTEN`), `python3 -m http.server <port> --bind 127.0.0.1 --directory <tree>/docs/ui`
  in the background; stop that server, and only that one, when the look is done, and say so in each
  report.
- **Phone first, then desktop.** The family uses Hemmafix on their phones as an installed app, so
  every journey is walked at phone size (about 390×844) and again at desktop width (1280 or more). The
  extension has no device emulation, so the phone look is a frame of the app's own origin: in your tab
  on the server, run with `javascript_tool`
  `document.body.innerHTML = '<iframe src="/" style="width:390px;height:844px;border:0"></iframe>'`.
  The frame's media queries answer to its width, and its requests carry the login cookie. Work and
  screenshot inside it; reload the tab for desktop. If a check cannot be done in the frame, fall back
  as verify-bead says. Say in the report how the sizes were set, and that the frame has the phone's
  width but not its touch, user agent or safe-area insets.
- **The words, exactly.** Everything a family member reads is Swedish. An acceptance with *The
  words, exactly* is checked word for word, including bold, punctuation and capitalisation: quote
  the screen's text beside the agreed text in the log. English text, a Swedish typo, or an error that
  names no fix is a finding; whether a line reads *well* is a human check. Dates and times are
  `sv-SE` in `Europe/Stockholm`, as the rest of the app shows them.
- **Adult and child.** When the bead touches what a role may do, walk both: as the adult, then
  `verify-app role <email> child`, reload, and try the same thing as the child. A button the child
  cannot see is not enough: where the bead names a refusal, check the child also gets the agreed
  refusal when they reach the action another way (a deep link, the browser's back button, a second
  tab opened while adult). Switch back to adult afterwards.
- **Live updates.** A change on one device shows on the family's others without a reload, through
  `/api/events`. With a second tab of your own on the same page, make the change in one and watch the
  other update; screenshot both. The open stream shows in the network log.
- **What persists.** When the bead adds or changes state (a chore, a room, an assignment, a connected
  app), reload, then stop and relaunch the server, and confirm it came back from the database.
- **The consoles.** Read the browser console after the journey (filtered by a pattern, not dumped
  whole) and the server's output from the launch. A new error or warning during the journey is a
  finding.

## MCP beads: the MCP Inspector

Beads that change what Claude can do through `/mcp`, or the login and approval pages it opens, are
looked at through the official **MCP Inspector**, which speaks the same OAuth and MCP as Claude:

1. Check its ports are free (`lsof -nP -iTCP:6274 -sTCP:LISTEN`, and 6277), then start it in the
   background: `npx -y @modelcontextprotocol/inspector@2.13.0` (pinned; a newer version is a change
   to this skill, not a choice in a look). It prints a URL with a session token: open
   that exact URL in a tab you opened.
2. Transport *Streamable HTTP*, URL `http://localhost:3000/mcp`. `verify-app reset` removes the app's
   registered OAuth clients, but the Inspector keeps its saved `hemmafix` entry with the old
   registration, and the first connect then fails with `invalid_client` / "client not found". Before
   connecting, use **Clear stored OAuth state** on that saved entry (or add a fresh entry). Use its
   OAuth flow: it registers itself, the browser goes to Hemmafix's login (skipped while logged in) and approval page. Those
   pages are part of the evidence: screenshot each, at phone size too when the bead changed them.
   The Inspector calls itself by its own name and returns to this computer, so the approval page shows
   it as such; that is expected.
3. **Godkänn** returns to the Inspector connected. List the tools and call the ones the bead added
   or changed, with the arguments a family member's request would produce. Quote each answer: the
   text Claude would read must be Swedish and match the acceptance.
4. Check the side effects in the app: a change made through a tool shows in an open tab of the app
   without a reload, and the child and removed-access refusals answer as agreed (make the navigator a
   child with the helper, call the tool again).
5. Stop the Inspector you started, and only it, when the look is done.

Whether a real conversation with Claude feels right, and the real claude.ai, Desktop and Code
clients, are a human check for after the release, never something to fake locally.

## Human checks: hand the navigator the running app

Some criteria have no screenshot that settles them. Prepare everything first so their part takes a
minute:

- **The real Google login**: a bead that changes the login journey itself, or the allowlist, needs
  the navigator's own login; you never go through Google's pages.
- **"Good enough"**: whether Swedish copy reads well, whether a layout feels right on a phone.
- **The installed app**: anything about the PWA on a real phone (install, home-screen icon,
  offline).
- **Real Claude clients**: a conversation in claude.ai, Claude Desktop or Claude Code, after the
  release.
- **Anything you could not reach**: a state the verify home cannot be brought into.

The hand-off, once per batch, after your own checks and before the verdict: leave the server running
and the app **in the exact state** to judge, in a tab you name; write `asking`; ask in **one** call
of the question tool, one question per human check (at most four, split a longer list), each saying
the URL and tab, what is on screen, and what good looks like, quoting the acceptance or `## Outcome`.
Options: **Good**, **Concern** (works, but worth a follow-up), **Fail** (does not meet what was
agreed). Write `working` the instant they answer, and copy each answer into the bead's log verbatim,
attributed to the navigator. A human check left unanswered is a gap, not a pass. A check that can
only happen after the release is recorded as a gap with the navigator's steps for it.

## Explore near the change

After the agreed criteria and before the report, spend **about 10–15 minutes per batch** using the
app near what changed, as a curious family member would, aiming at the change's edges:

- the empty states: a home with one floor and no rooms, a room with no chores, nothing done yet,
  no connected apps;
- the other role, and a second family member (`verify-app member`);
- the same thing reached another way: the app's own navigation, a deep link, the back button, a second
  tab;
- doing things in the wrong order, twice, or undoing them: tick then untick, rename then rename
  back, delete the last floor or room, a recurring chore ticked twice in one day;
- long names wrapping at phone width, and the keyboard-only path on desktop;
- stopping and relaunching the server mid-journey.

Log each finding with steps, what appeared and a screenshot, then sort it:

- **A regression this batch caused** (it worked before this bead's commit, and the bead's diff
  explains the break) counts against that bead's verdict. Say which criterion or outcome it breaks.
- **Everything else** (an older defect, a rough edge, an idea) is a proposed follow-up and never
  fails the bead.

When unsure which it is, say so in the report and recommend the follow-up.

## Present the results

The report on each bead follows verify-bead's *Recommend*, with these sections:

- `Verification report at <full sha>`, then the bead's title and its batch;
- the **setup**: the port, `verify-app status` before the look, every helper call, and how the
  sizes were set;
- the evidence log, one entry per criterion, phone and desktop, adult and child where they apply,
  with the human checks marked as the navigator's answers;
- **Exploration**: what you tried, and each finding with its sorting;
- the **gaps**: what nobody could reach, and the checks left for after the release;
- the **recommendation**: Passed, Passed with a follow-up, or Failed (build or plan), with the one
  or two facts it turns on;
- the **proposed follow-ups**: for each, a title in *Writing a good bead* form, the outcome for the
  family (or the developer), one acceptance line, and why it is not a defect in this bead. A defect
  in shipped behaviour is proposed as a bug (`--type bug --labels bugfix`), anything else as a task.
  Both are filed at P4, unranked, and only when the navigator approves them.

Then in chat, before the verdict question, give the navigator one line per bead with the
recommendation, then the follow-ups. Ask for the verdicts and the follow-ups in one call where they
fit in four questions, and in consecutive calls where they do not. Record only what they answered,
by the recipes in `agents/verifier.md`.

## When the look is over

Run this at **every** end of a look: after the verdicts, after a blocker, and when the navigator is
away and the pass ends with beads pending.

1. Stop the server you started (*Launching*), the Inspector and any `docs/ui` server you started,
   and only those.
2. `verify-app reset`: it empties the home (floors, rooms, chores, history, lists, connected apps and the
   members the helper added), sets every role back to adult and keeps the logins. Never drop the
   database: that would cost the navigator their login.
3. `git -C .cerebro/worktrees/psylocke status --porcelain` shows nothing: the look writes only to the
   verify database and to ignored build output. Anything else is reported, not hand-deleted; the
   next `prepare-worktree` resets it.
4. Close the tabs you opened, and say in the report that the verify home was reset.
