# hf-sn7 — retrospective

- **Implementer:** Cyclops
- **Date:** 2026-11-28
- **PR:** #192

## The review packet was too large to paste into the reviewer's prompt, again

**What happened.** `review-packet hf-sn7 192` printed 199 KB, much of it the diff of the generated
`drizzle/meta/0020_snapshot.json`. `produce-bead`, *The review loop*, says to paste it whole into
the sub-agent's prompt; the reviewer was given the path of the unedited file instead.
**Why.** The Agent tool takes its prompt only as text the producer writes, and `review-packet`
includes every changed file's diff, generated snapshots among them.
**Cost.** One rule not followed as written; the reviewer spent much of its reading on a generated file.
**Prevent by.** `produce-bead`, *The review loop*: allow the prompt to name the file `review-packet`
was redirected to; `scripts/review-packet`: list `drizzle/meta/*_snapshot.json` without its diff.
**Seen before.** hf-pkn, hf-998, hf-19m.3.
