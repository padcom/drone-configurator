#!/usr/bin/env bash
# Builds ArduPilot SITL for some vehicles at a pinned ref (one waf build: they share most of the code) and copies the
# executables to OUT_DIR. Needs no root: the packages it uses (build-essential, gawk, git, python3-venv, ...) are installed
# by the caller. Everything it creates is under WORK_DIR, which can be thrown away.
#
# Usage: sitl-build.sh REF VEHICLES OUT_DIR [WORK_DIR]
#   REF       a commit SHA or a tag of github.com/ArduPilot/ardupilot (see .github/ardupilot-ref)
#   VEHICLES  `all`, or some of copter,heli,plane,rover,sub,blimp,tracker (comma-separated); the E2E harness's names
#             (apps/frontend/e2e/sitl.ts)
set -euo pipefail

ref=${1:?usage: sitl-build.sh REF VEHICLES OUT_DIR [WORK_DIR]}
vehicles=${2:?usage: sitl-build.sh REF VEHICLES OUT_DIR [WORK_DIR]}
out=${3:?usage: sitl-build.sh REF VEHICLES OUT_DIR [WORK_DIR]}
work=${4:-$(mktemp -d)}

# Each vehicle's waf target and executable.
declare -A target=([copter]=copter [heli]=heli [plane]=plane [rover]=rover [sub]=sub [blimp]=blimp [tracker]=antennatracker)
declare -A binary=([copter]=arducopter [heli]=arducopter-heli [plane]=arduplane [rover]=ardurover [sub]=ardusub
  [blimp]=blimp [tracker]=antennatracker)
if [ "$vehicles" = all ]; then
  vehicles=copter,heli,plane,rover,sub,blimp,tracker
fi
IFS=, read -ra wanted <<< "$vehicles"
targets=()
for vehicle in "${wanted[@]}"; do
  if [ -z "${target[$vehicle]:-}" ]; then
    echo "::error::no SITL build for vehicle '$vehicle' (known: ${!target[*]})" >&2
    exit 1
  fi
  targets+=("${target[$vehicle]}")
done

# A tag has to be asked for by its full name; a SHA is fetched as it is.
if [[ ! "$ref" =~ ^[0-9a-f]{40}$ ]]; then
  ref="refs/tags/$ref"
fi

requirements="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sitl-requirements.txt"

# Absolute, because the script changes directory.
mkdir -p "$out" "$work"
out=$(cd "$out" && pwd)
work=$(cd "$work" && pwd)
src="$work/ardupilot"
git init -q "$src"
cd "$src"
git remote add origin https://github.com/ArduPilot/ardupilot.git
git fetch -q --depth 1 origin "$ref"
git checkout -q FETCH_HEAD
echo "ArduPilot $(git rev-parse HEAD)"
git submodule update --init --recursive --depth 1 -q

# waf runs ArduPilot's code generators with this interpreter. The packages are pinned in sitl-requirements.txt.
python3 -m venv "$work/venv"
"$work/venv/bin/pip" install -q --disable-pip-version-check -r "$requirements"
"$work/venv/bin/python" ./waf configure --board sitl
"$work/venv/bin/python" ./waf "${targets[@]}" -j"$(nproc)"

for vehicle in "${wanted[@]}"; do
  test -x "build/sitl/bin/${binary[$vehicle]}"
  cp "build/sitl/bin/${binary[$vehicle]}" "$out/${binary[$vehicle]}"
  echo "built $out/${binary[$vehicle]}"
done
# Older SITL builds (Copter 4.7) don't carry their default parameters; the E2E harness passes these with
# --defaults when it finds them next to the executable, laid out as in Tools/autotest (a plane's are in models/).
rm -rf "$out/default_params" "$out/models"
cp -r Tools/autotest/default_params "$out/default_params"
mkdir -p "$out/models"
cp Tools/autotest/models/*.parm "$out/models/"
