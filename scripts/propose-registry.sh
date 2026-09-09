#!/usr/bin/env bash
set -euo pipefail

branch=automation/registry-refresh
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if git diff --quiet -- data/registry-v1.json; then
  echo 'Registry unchanged.'
  exit 0
fi

temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
changed=true
# Refuse to update a PR that includes handwritten code changes.
if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  git fetch origin "$branch"
  unexpected=$(git diff --name-only HEAD...FETCH_HEAD -- . ':!data/registry-v1.json')
  if [[ -n "$unexpected" ]]; then
    echo 'The registry branch contains non-registry changes; review it before retrying.' >&2
    exit 1
  fi
  lease=$(git rev-parse FETCH_HEAD)
  git show FETCH_HEAD:data/registry-v1.json >"$temporary/previous.json"
  if node "$script_dir/compare-registry.mjs" "$temporary/previous.json" data/registry-v1.json; then
    changed=false
    echo 'Registry already proposed; no new commit.'
  else
    status=$?
    if [[ "$status" -ne 1 ]]; then exit "$status"; fi
  fi
else
  lease=''
fi

if [[ "$changed" == true ]]; then
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git add -- data/registry-v1.json
  git commit -m 'chore: refresh plugin registry'
  git push "--force-with-lease=refs/heads/$branch:$lease" origin "HEAD:refs/heads/$branch"
fi

pr=$(gh pr list --head "$branch" --base main --state open --json number --jq '.[0].number // empty')
if [[ -z "$pr" ]]; then
  body="$temporary/body.md"
  cat >"$body" <<'BODY'
Refresh the plugin registry from the public discovery sources. Package manifests and the complete snapshot schema have been validated. Review the catalog changes and merge after the required CI checks pass.
BODY
  gh pr create --head "$branch" --base main --title 'chore: refresh plugin registry' --body-file "$body"
fi
# GitHub requires a maintainer to approve PR workflows created by GITHUB_TOKEN.
# Use the real pull_request checks on GitHub's test merge commit.
