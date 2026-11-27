# Requirements

Agreed with the navigator 2026-11-27. Each requirement keeps its ID for ever;
a dropped one is struck, never renumbered.

## Access (ACC)

ACC-1  A family member logs in with Google. Only addresses on ALLOWED_EMAILS get in, and
       someone taken off the list is logged out at once.
       Proven by: e2e/home.spec.ts
ACC-2  The first person to log in gets a home. An adult makes a child an adult, or an adult a
       child; a home always keeps at least one adult.
       Proven by: e2e/home.spec.ts
ACC-3  A family member logs out from the picture menu, at once.
       Proven by: e2e/avatar-menu.spec.ts

## Home (HOM)

HOM-1  An adult renames the home.
       Proven by: e2e/home.spec.ts
HOM-2  An adult adds rooms, typed or suggested, renames them and removes them. A room with
       tasks cannot be removed.
       Proven by: e2e/home.spec.ts, e2e/edit.spec.ts
HOM-3  An adult names, orders and removes floors. A home with one floor shows no floors; with
       several, tasks show their floor.
       Proven by: e2e/floors.spec.ts
HOM-4  A child has no Hemmet and cannot change the home, its rooms or its tasks, also when
       calling the server directly.
       Proven by: e2e/home.spec.ts

## Chores (CHR)

CHR-1  An adult adds a task, ready-made or their own, one-off or recurring, in a room, with a
       day and a person. A home without rooms is asked for rooms first.
       Proven by: e2e/board.spec.ts
CHR-2  Anyone ticks a task off and can undo it. A recurring task comes back one interval after
       it was done; a one-off is gone.
       Proven by: e2e/board.spec.ts
CHR-3  An adult edits a task, gives it to someone (every time or just this time) and deletes
       it. A task done before an edit keeps its old name in the history.
       Proven by: e2e/edit.spec.ts, e2e/board.spec.ts
CHR-4  An adult postpones an open chore to a later day with one tap, and Ångra puts it back.
       Proven by: e2e/postpone.spec.ts
CHR-5  The open tasks are in five tabs with a count each (Nu, the coming days, Senare) and can
       be filtered on room, floor and person. The tab and the filter survive a reload.
       Proven by: e2e/board-tabs.spec.ts
CHR-6  A repeating chore cannot earn coins before its day: a child sees a locked tick, an adult
       may tick it early for no coins.
       Proven by: e2e/early-tick.spec.ts
CHR-7  A save the server refuses says why in Swedish and leaves the form showing what was
       typed and chosen.
       Proven by: e2e/failed-save.spec.ts, e2e/add-chore-form.spec.ts

## Routines (RUT)

RUT-1  An adult makes a routine, names it, fills it with up to 30 tasks, and removes it after
       being asked. Every home starts with three ready-made routines.
       Proven by: e2e/routines.spec.ts
RUT-2  An adult adds a whole routine to a room, and its tasks become separate tasks, each with
       its own coins.
       Proven by: e2e/add-routine.spec.ts

## Lists (LST)

LST-1  Anyone in the family, a child too, makes a shared list, renames it and removes it after
       being asked. Each person chooses their own order of the lists.
       Proven by: e2e/lists.spec.ts
LST-2  Items are added, ticked into Klart, unticked, edited in place, removed and cleared, and
       Ångra brings back what was removed or cleared.
       Proven by: e2e/lists.spec.ts

## History (HIS)

HIS-1  A child sees in Gjort what they have done, and only that.
       Proven by: e2e/history.spec.ts
HIS-2  An adult sees what anyone in the home has done, over a chosen period.
       Proven by: e2e/history.spec.ts

## Coins and rewards (COI)

COI-1  A tick earns the task's coins, which an adult sets from 0 to 100. The total shows at
       once in the pill, and undoing the tick takes back what it gave.
       Proven by: e2e/coin-value.spec.ts
COI-2  The first tick-off of the day offers a chest with extra coins, which are credited even
       if it is closed unopened.
       Proven by: e2e/daily-chest.spec.ts
COI-3  Days in a row with a task done show as a flame, and a tick gives 10 % more from day 4
       and 20 % more from day 7. A full day missed starts over.
       Proven by: e2e/streak.spec.ts
COI-4  An adult lists rewards; a family member buys one with coins and can regret it; an adult
       gives it, or does not and the coins come back.
       Proven by: e2e/butik.spec.ts
COI-5  A family member buys looks with coins — a frame, a colour, a theme such as Jul —
       previews one before buying, and switches between owned ones for free. A theme changes
       only that person's pages.
       Proven by: e2e/looks.spec.ts, e2e/jul.spec.ts
COI-6  Undoing a tick whose coins are already spent asks first, and going ahead leaves the
       person owing coins.
       Proven by: e2e/undo-debt.spec.ts

## Progress (PRG)

PRG-1  Everyone, a child too, has a Jag part that shows their level from the coins they have
       earned and what the next level takes.
       Proven by: e2e/jag.spec.ts
PRG-2  Jag shows eight badges, grey until won, each saying what it is for and how far the
       person is. A badge won gives 25 coins.
       Proven by: e2e/badges.spec.ts
PRG-3  Jag sets this week against last, and on Monday a sheet shows last week once.
       Proven by: e2e/week.spec.ts
PRG-4  Ticking off sends coins flying to the pill; clearing Nu, winning a badge and reaching a
       level are celebrated, on the device that ticked only. With reduced motion nothing flies
       or falls, and the coins still arrive.
       Proven by: e2e/coin-shower.spec.ts, e2e/celebrations.spec.ts
PRG-5  A family member cheers someone else's tick, and never their own.
       Proven by: e2e/high-fives.spec.ts
PRG-6  Sound and vibration are turned off and on from the picture menu, for this device only.
       Proven by: e2e/sound-setting.spec.ts

## Live updates (LIV)

LIV-1  A change made on one device shows on everyone's open pages without reloading.
       Proven by: e2e/board.spec.ts
LIV-2  An open page stays as it was while the server is unreachable and catches up once it
       answers; a page left open over midnight moves to the new day.
       Proven by: e2e/outage.spec.ts, e2e/early-tick.spec.ts

## On every device (DEV)

DEV-1  A family member moves between Uppgifter, Listor and Jag from a bar at the bottom of a
       phone and a strip at the top of a desktop; Gjort and Hemmet are opened from the picture
       menu and lead back to where they were opened.
       Proven by: e2e/parts.spec.ts
DEV-2  Everything works on a phone and on a desktop, and down to a 300 px phone nothing
       overflows, overlaps or breaks a word.
       Proven by: e2e/narrow-header.spec.ts, e2e/task-rows.spec.ts
DEV-3  Everything can be done from the keyboard, with focus going in reading order and
       returning to where it came from when something closes.
       Proven by: e2e/board-tabs.spec.ts, e2e/lists.spec.ts, e2e/task-rows.spec.ts, e2e/avatar-menu.spec.ts
DEV-4  Everything a family member reads is in Swedish, with Swedish dates in Stockholm time.
       Proven by: e2e/board-tabs.spec.ts
DEV-5  Hemmafix can be installed on a phone as an app.
       Proven by: deploy/smoke-test.sh

## Claude and other apps (MCP)

MCP-1  An adult connects Claude or another app by approving it, and is asked every time; the
       page warns about an app at an unknown address. A child cannot connect one.
       Proven by: e2e/connect-claude.spec.ts
MCP-2  Through a connected app an adult reads and changes the tasks, the routines, the rooms
       and floors and the family's roles, answered in the app's Swedish words. Every call
       re-checks who is asking.
       Proven by: src/server/mcp.int.test.ts, src/server/mcp-home.int.test.ts, src/server/mcp-routines.int.test.ts
MCP-3  An adult sees their own connected apps in Hemmet and disconnects one, which stops it at
       once.
       Proven by: e2e/connected-apps.spec.ts

## Releases (REL)

REL-1  Every merge to main is released as the image that was tested, and it comes up healthy:
       port 8080, /healthz, /release.json, migrations at start, a fast stop on SIGTERM.
       Proven by: deploy/smoke-test.sh
REL-2  A release that does not come up healthy is rolled back to the previous image, so every
       migration also works with the previous release's code.
       Proven by: src/db/migrations.int.test.ts
REL-3  A merge that changes only files under docs/ starts no release, and its pull request's
       required checks pass without running.
       Proven by: test/repo/ci-needed.test.ts, test/repo/ci-workflow.test.ts
