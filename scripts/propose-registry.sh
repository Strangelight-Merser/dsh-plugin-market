#!/usr/bin/env bash
set -euo pipefail

branch=automation/registry-refresh
if git diff --quiet -- data/registry-v1.json; then
  echo 'Registry unchanged.'
  exit 0
fi

# Refuse to update a PR that includes handwritten code changes.
if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  git fetch origin "$branch"
  unexpected=$(git diff --name-only HEAD...FETCH_HEAD -- . ':!data/registry-v1.json')
  if [[ -n "$unexpected" ]]; then
    echo 'The registry branch contains non-registry changes; review it before retrying.' >&2
    exit 1
  fi
  lease=$(git rev-parse FETCH_HEAD)
else
  lease=''
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add -- data/registry-v1.json
git commit -m 'chore: refresh plugin registry'
git push "--force-with-lease=refs/heads/$branch:$lease" origin "HEAD:refs/heads/$branch"

pr=$(gh pr list --head "$branch" --base main --state open --json number --jq '.[0].number // empty')
if [[ -z "$pr" ]]; then
  body=$(mktemp)
  trap 'rm -f "$body"' EXIT
  cat >"$body" <<'BODY'
Refresh the plugin registry from the public discovery sources. Package manifests and the complete snapshot schema have been validated. Review the catalog changes and merge after the required CI checks pass.
BODY
  gh pr create --head "$branch" --base main --title 'chore: refresh plugin registry' --body-file "$body"
fi
# GITHUB_TOKEN-created PRs need approval for automatic PR workflows.
# Explicit dispatch runs the same required checks without a long-lived token.
gh workflow run ci.yml --ref "$branch"
