# hf-kix — retrospective

- **Implementer:** Shadowcat
- **Date:** 2026-11-16
- **PR:** #51

## Another bead fixed the same bug while this one was in flight, and the fix had to be thrown away

**What happened.** hf-kix (a flaky e2e test, filed by Bishop) and hf-alp (the same app bug, filed by Psylocke during verification of hf-ajn) were open at the same time with different owners. I built and reviewed a component fix in `edit-chore-form.tsx`: the removed room stays chosen and the server refuses it. Meanwhile hf-alp merged a different one: back to "Välj rum". The PR showed `CONFLICTING` only when I first waited for CI. I also filed hf-oem for the Ny uppgift form, which hf-chl already covered. The review sub-agent later named a third bead for it, hf-5ew.
**Why.** Neither bead linked the other. The same symptom was filed twice under two descriptions, a flaky test and a silent wrong save, and nothing at claim time compares a new bead with open or in-progress beads that touch the same component.
**Cost.** One full fix, a review round and a 40-run e2e repetition thrown away; a rebase and a second full review; a duplicate bead filed and closed.
**Prevent by.** In `fix-bug` contract step 1, before writing the test: run `bd search` on the component and symptom words (here "Rum", "room removed", "edit-chore-form"), and check `git log origin/main` for the files the bug lives in, rather than rely on the bead's description alone. Do the same search before filing a follow-up bead.
**Seen before.** none found
