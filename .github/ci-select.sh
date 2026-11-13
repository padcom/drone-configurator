#!/usr/bin/env bash
# Says which tests a change needs (the logic is in ci-select.mjs; the plan in shared/decisions/drone-configurator-ci-strategy.md).
# Usage: ci-select.sh [--shadow] [BASE_REF]   BASE_REF defaults to origin/$GITHUB_BASE_REF.
# Writes full, sitl, backend, e2e to $GITHUB_OUTPUT and the summary to $GITHUB_STEP_SUMMARY (both optional).
# A push (main), a manual run or an unreadable diff selects everything.
set -uo pipefail

root=$(git rev-parse --show-toplevel)
shadow=()
if [ "${1:-}" = "--shadow" ]; then shadow=(--shadow); shift; fi
base=${1:-${GITHUB_BASE_REF:+origin/$GITHUB_BASE_REF}}

mode=()
files=""
if [ "${GITHUB_EVENT_NAME:-pull_request}" != "pull_request" ] || [ -z "$base" ]; then
  mode=(--full)
elif ! files=$(git diff --name-only "$base"...HEAD); then
  echo "::warning::cannot read the diff against $base: selecting everything"
  files=""
fi

exec node "$root/.github/ci-select.mjs" --root "$root" "${shadow[@]}" "${mode[@]}" <<< "$files"
