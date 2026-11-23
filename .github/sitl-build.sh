#!/usr/bin/env bash
# Builds ArduPilot SITL for one vehicle at a pinned ref and copies the executable to OUT_DIR.
# Needs no root: the packages it uses (build-essential, gawk, git, python3-venv, ...) are installed by
# the caller. Everything it creates is under WORK_DIR, which can be thrown away.
#
# Usage: sitl-build.sh REF VEHICLE OUT_DIR [WORK_DIR]
#   REF      a commit SHA or a tag of github.com/ArduPilot/ardupilot (see .github/ardupilot-ref)
#   VEHICLE  copter (the only vehicle the E2E harness starts so far)
set -euo pipefail

ref=${1:?usage: sitl-build.sh REF VEHICLE OUT_DIR [WORK_DIR]}
vehicle=${2:?usage: sitl-build.sh REF VEHICLE OUT_DIR [WORK_DIR]}
out=${3:?usage: sitl-build.sh REF VEHICLE OUT_DIR [WORK_DIR]}
work=${4:-$(mktemp -d)}

case "$vehicle" in
  copter) binary=arducopter ;;
  *) echo "::error::no SITL build for vehicle '$vehicle' (known: copter)" >&2; exit 1 ;;
esac

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
"$work/venv/bin/python" ./waf "$vehicle" -j"$(nproc)"

test -x "build/sitl/bin/$binary"
cp "build/sitl/bin/$binary" "$out/$binary"
# Older SITL builds (Copter 4.7) don't carry their default parameters; the E2E harness passes these with
# --defaults when it finds them next to the executable.
rm -rf "$out/default_params"
cp -r Tools/autotest/default_params "$out/default_params"
echo "built $out/$binary"
