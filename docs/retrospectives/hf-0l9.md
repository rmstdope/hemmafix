# hf-0l9 — retrospective

- **Producer:** Cyclops
- **Date:** 2026-11-26
- **PR:** #137

## A page that had been left went on matching `:root:has(…)`

**What happened.** The themes are CSS keyed on marks in the document (`:root:has([data-look-own="…"])`).
With `cacheComponents`, Next keeps a left layout in the DOM, hidden by React's Activity, so its
marks still match. A Jul user who visited Hemmet and then switched theme kept the night sky. The
plan handled the person's marks with a layout-effect cleanup, but the new static `data-look-scope`
span had none, and the review found that an ended session then painted the sky on `/login`.

**Why.** `:has` and `querySelector` see hidden subtrees. Only effect cleanups run when Activity
hides a page; static server-rendered markup stays exactly as it was. The behaviour is described in
`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`, which nothing points to when
writing a global selector.

**Cost.** One bug shipped to review and one fix round: a test, a rebuild and a second push.

**Prevent by.** An entry in `.cerebro/traps.md`: "any attribute that a global selector or document
query reads must be removed in a `useLayoutEffect` cleanup (`useShownAttributes` in
`src/components/look-marks.tsx`), and tested by leaving the page with a soft navigation".

**Seen before.** Nothing like it in this directory.

The slow and failed local runs of this pass were the two already recorded: the Mac sleeping
(hf-o78, hf-8jj) and machine load (hf-qjk).
