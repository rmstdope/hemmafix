#!/usr/bin/env bash
# Does this pull request need CI? Run in the checkout of GitHub's merge commit (fetch-depth: 2);
# ci.yml appends stdout to $GITHUB_OUTPUT. Prints `run=false' only when every changed path is
# under docs/, which nothing in the build, the tests or the image reads; anything else, and
# anything it cannot tell, is `run=true'.
set -euo pipefail

answer() {
  echo "ci-needed: $2" >&2
  echo "run=$1"
  exit 0
}

git rev-parse --verify --quiet 'HEAD^2' >/dev/null || answer true "HEAD is not a merge commit"

changed="$(mktemp)"
trap 'rm -f "$changed"' EXIT
# The first parent is the base branch, so this is what merging changes. Without rename detection a
# file moved into docs/ still shows where it left.
git diff --name-only --no-renames -z 'HEAD^1' HEAD >"$changed"

count=0
while IFS= read -r -d '' path; do
  [[ "$path" == docs/* ]] || answer true "$path is outside docs/"
  count=$((count + 1))
done <"$changed"

((count > 0)) || answer true "no changed paths"
answer false "all $count changed paths are under docs/"
