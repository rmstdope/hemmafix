# hf-6h6 — retrospective

- **Implementer:** Bishop
- **Date:** 2026-11-16
- **PR:** #35

## The pre-gate workload classification refuses in this project

**What happened.** `produce-bead` *Building* says to classify the diff before the fast gate:
`git diff --name-only -z origin/main...HEAD | xargs -0 .cerebro/cerebro/scripts/build-workload --classify`.
It printed `build-workload: no rust_paths in .cerebro/project.conf - cannot classify safely.` and
classified nothing; `project-conf rust_paths` answers `unset, and no default`.
**Why.** `.cerebro/project.conf` declares no `rust_paths`; Hemmafix has no Rust, so the step has
nothing to compare against.
**Cost.** A minute; the bead's diff was plainly TypeScript only, so the gate ran as non-Rust.
**Prevent by.** Declare an empty or explicit `rust_paths` in `.cerebro/project.conf` so the
classification answers `non-rust`, or have `build-workload --classify` treat an unset
`rust_paths` as "no Rust" in a project that declares none.
**Seen before.** none found.
