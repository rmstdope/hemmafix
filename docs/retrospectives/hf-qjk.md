# hf-qjk retrospectives

## Local e2e tests failed under machine load from parallel sessions

**What happened:** The first full local e2e run for this bead failed one `routines.spec.ts` test
(a row count of 20 where 21 was expected). Re-running that spec alone failed two other routines
tests, a different test on each run. Every failure was a page that did not render within
Playwright's 5 s expect timeout (`heading 'Rutiner'` or `heading 'Hemmet'` not found). None of
these tests reaches the changed code.

**Why:** `uptime` showed a load average of 99 (1-minute) on the Mac at the time, from other fleet
sessions building and testing in parallel. When the load fell to about 5, the full suite passed
(256/256) with no change to the code.

**Cost:** About 15 minutes of re-runs and reading failures, plus the risk of putting a real
regression down to load.

**Prevent by:** Before reading a local e2e failure as a defect, check `uptime`. Above roughly the
core count, re-run once the load has fallen before investigating. The *Pre-merge checklist* in
`CLAUDE.md` could say so for the e2e step, next to hf-o78's `caffeinate` note. The fleet view
could also stagger e2e runs across sessions.

**Seen before:** hf-o78 recorded a stall from the Mac sleeping, a different cause with the same
symptom (local e2e failures that the change does not explain).
