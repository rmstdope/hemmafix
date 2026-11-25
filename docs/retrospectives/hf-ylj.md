# hf-ylj retrospectives

- **Bead:** hf-ylj (the home's name in whole words in the Listor header on a 320 px phone)
- **PR:** #131

## A header layout test passed on macOS and failed on CI's Linux

**What happened.** `e2e/narrow-header.spec.ts` asserted that a new member's Listor controls drop to
their own row at 300 px, as the bead's agreed states say ("by about 1 px"). The full e2e run passed
locally (538 passed). CI failed that one test in both projects: the name began 44 px into the header
instead of 28, so the controls had stayed on the heading's row.

**Why.** The controls fit the 300 px row on the runner and miss it by about a pixel on macOS. Most
likely the 🔥 in the streak pill is drawn by a different emoji font with a different width; not
measured on the runner. The measurement behind the agreed "about 1 px" was taken on macOS only.

**Cost.** One red `e2e` run and one CI fix attempt, about 15 minutes.

**Prevent by.** A line in `CLAUDE.md` *Testing*: an e2e assertion about which way a layout wraps
needs a margin of several pixels, since text and emoji widths differ between macOS and CI's Linux;
nearer than that, assert the rule (it wraps only when it does not fit) instead of the outcome. And
in `agree-experience`: a state that depends on a margin of about 1 px is not a fixed state.

**Seen before.** Nothing found for linux, emoji or macOS in `docs/retrospectives/`.
