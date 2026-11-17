#!/usr/bin/env bash
# Developer Certificate of Origin (owner's decision 2026-11-15, question G; CONTRIBUTING.md):
# every commit in the range must carry "Signed-off-by:" with its author's name and email,
# as `git commit -s` adds it.
#   scripts/check-dco.sh <base> <head>
set -euo pipefail
base="${1:?usage: check-dco.sh BASE HEAD}"
head="${2:?usage: check-dco.sh BASE HEAD}"
status=0
for commit in $(git rev-list --no-merges "${base}..${head}"); do
  author="$(git log -1 --format='%an <%ae>' "$commit")"
  if ! git log -1 --format='%B' "$commit" | grep -qxF "Signed-off-by: ${author}"; then
    echo "Missing 'Signed-off-by: ${author}' in $(git log -1 --format='%h %s' "$commit")" >&2
    status=1
  fi
done
[ "$status" -eq 0 ] && echo "DCO: every commit is signed off."
exit "$status"
