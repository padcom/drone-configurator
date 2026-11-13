#!/usr/bin/env bash
# Prints the backend test files of one shard, one per line: the sorted files of apps/backend/*.test.pi, every TOTAL-th starting at
# SHARD (1-based). Every file is in exactly one shard, and the split has no state to keep: a new test file lands in a shard by
# its name. Usage: backend-shard.sh SHARD TOTAL   (run from the repository root)
set -euo pipefail

shard=${1:?shard (1-based)}
total=${2:?total}
if [ "$shard" -lt 1 ] || [ "$shard" -gt "$total" ]; then
  echo "backend-shard.sh: shard $shard is not in 1..$total" >&2
  exit 2
fi

i=0
for file in $(cd apps/backend && ls ./*.test.pi | sed 's|^\./||' | LC_ALL=C sort); do
  if [ $((i % total + 1)) -eq "$shard" ]; then
    echo "$file"
  fi
  i=$((i + 1))
done
