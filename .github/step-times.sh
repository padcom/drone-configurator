#!/usr/bin/env bash
# Writes the time of every step of this job to the job summary (step 0 of shared/decisions/drone-configurator-ci-strategy.md).
# Measures only; it never fails the job (the caller sets continue-on-error as well).
# Needs `actions: read`, GH_TOKEN, and the variables GitHub sets (GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, RUNNER_NAME).
set -uo pipefail

summary=${GITHUB_STEP_SUMMARY:-/dev/stdout}
jobs=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs" --paginate) || {
  echo "::warning::cannot read the job list: no step times"
  exit 0
}

{
  echo "### Step times (${RUNNER_NAME:-runner})"
  echo
  echo "| Step | Seconds | Result |"
  echo "|---|---:|---|"
  echo "$jobs" | jq -r --arg runner "${RUNNER_NAME:-}" '
    [.jobs[] | select(.runner_name == $runner)] | last // {steps: []} | .steps[]
    | select(.started_at != null and .completed_at != null and (.name | startswith("Post ") | not))
    | [.name, ((.completed_at | fromdate) - (.started_at | fromdate)), .conclusion]
    | select(.[1] >= 5 or .[2] == "failure")
    | "| \(.[0]) | \(.[1]) | \(.[2]) |"'
  echo
  echo "Steps under 5 s are left out."
} >> "$summary"
