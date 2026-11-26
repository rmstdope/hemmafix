# hf-pkn — retrospective

- **Implementer:** Storm
- **Date:** 2026-11-27
- **PR:** #143

## The review packet was too big to paste into the reviewer's prompt

**What happened.** `scripts/review-packet hf-pkn 143` printed 80 KB (20 changed files).
`produce-bead` says to paste it whole into the sub-agent's prompt, never edited, which would mean
retyping about twenty thousand tokens of diff by hand. The reviewer was given the path of the
unedited file instead; it checked the packet against the tree and reviewed normally.
**Why.** The Agent tool takes its prompt only as text the producer writes; it cannot take a file.
**Cost.** None beyond leaving the rule as written.
**Prevent by.** `produce-bead`, *The review loop*: have `review-packet` write to a file and allow
the prompt to name that file when the output is large.
**Seen before.** None found.
