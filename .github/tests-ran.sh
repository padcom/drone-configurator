#!/usr/bin/env bash
# Fails unless a test log shows tests that passed, so a run that executed none can't be green.
# Usage: tests-ran.sh LOG PATTERN   (colour codes are removed first; perl is on every runner)
if ! perl -pe 's/\e\[[0-9;]*m//g' "$1" | grep -Eq "$2"; then
  echo "::error::no passing tests in $1 (expected a line matching: $2)"
  exit 1
fi
