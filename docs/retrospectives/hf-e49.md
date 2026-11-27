# hf-e49 — retrospective

- **Implementer:** Bishop
- **Date:** 2026-11-27
- **PR:** #189

## A push to the Dependabot branch recreated a branch Dependabot had deleted

**What happened.** I worked for about 40 minutes on #173's branch (`gh pr checkout 173`). During that time Dependabot closed #173 as "Superseded by #185" and deleted its branch. My `git push` then printed `* [new branch] dependabot/npm_and_yarn/lucide-react-1.80.0`, which recreated that branch on origin with no pull request. Deleting it again (`git push origin --delete …`) was refused by the session's permission classifier, so the orphan branch is still there for a person to remove.
**Why.** The fix-bug skill says to read `dependabot_pr` again before pushing. I read it only at the start. The sweep had not yet moved the bead onto #185 when I pushed.
**Cost.** One orphan branch on origin, one question to the navigator about where the fix should land, and a rebase onto main for a PR of its own.
**Prevent by.** In the fix-bug skill's *A bead that names a Dependabot pull request*, add a step before the push: run `gh pr view <n> --json state` and stop if the pull request is not `OPEN`. Also push with `git push origin HEAD:<branch>` only after `git ls-remote --heads origin <branch>` shows the branch still exists, so that a push cannot create a branch.
**Seen before.** none found
