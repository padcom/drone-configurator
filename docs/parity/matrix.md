# The parity matrix

What a Mission Planner user expects to find, the issue that covers it here, and where it stands. Statuses are as of **2026-11-22,
main after #517**, and are by what the code and the screens do, not by the issue's state (the tracker lags the code). The statuses
and the rules are in `README.md`. Issues that are closed are not listed. "Copter" below means ArduCopter, the one vehicle type the
app supports.

The open issues at this date are 247, and every one is a row below. By status (they add up from the rows): **done 1** (#8
itself, when this merges), **partial 92** (five of them implemented, with one acceptance point or more not confirmed by qa's
spot check: #28, #37, #44, #46, #104), **not done 129**, **needs hardware 18**, **deferred 7** (scripting, #172 to #178), **out of
scope 0**, **superseded 0** (= 247). The issues that were closed since the close-out are named
under the last table and are not counted.

## Foundation

| Capability | Issue | Status | What remains |
|---|---|---|---|
| CI on every platform: lint, unit, window e2e, SITL e2e | #2 | Partial | macOS and Windows run the frontend only (#4) |
| Backend tests and e2e on macOS and Windows | #4 | Not done | blocked upstream (pico-serialport, pico-desktop) |
| SITL built and cached for each vehicle type | #10 | Done | all seven vehicles built and cached by ref and target; `sitl-vehicles.e2e.ts`; weekly `sitl-next-stable.yml` |
| Virtualized data table in the kit | #15 | Partial | no generic table (sort, resize, filter hook, cell editors); no 2000-row budget test |
| Dialogs, safety confirmation, toasts, menus | #16 | Partial | no context menu |
| Parameter-bound form fields | #17 | Partial | no unit display/conversion field; draft-conflict states only partly |
| Global keyboard shortcuts | #20 | Partial | no rebinding, conflict display or help overlay |
| Command palette | #21 | Partial | the open and per-keystroke budgets are not measured |
| Performance budgets enforced in CI | #22 | Done | `apps/frontend/budgets.json`; cold start, screen switch, initial JS, long tasks (`e2e/budgets.e2e.ts`) and the palette, judged by `e2e/budgets.ts`, in the job summary |
| Telemetry model, coalesced for the UI | #26 | Partial | no update-rate or CPU budget test; no SITL e2e against simulated truth |
| One-key connect with auto-detection | #27 | Partial | no USB detection, baud probing or default UDP listen |
| Reconnect that resumes | #28 | Partial | implemented; qa could not confirm the cached-parameters, keyboard and i18n points or the arm64 gate |

## Connection and link

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Link quality indicators | #29 | Not done | |
| Automatic telemetry recording | #30 | Not done | needs the pico-mavlink writer |
| Redundant links to one vehicle | #31 | Not done | |
| Several vehicles at once | #32 | Not done | an architecture change (one session today) |
| MAVLink signing setup | #33 | Not done | |
| Forward MAVLink to other programs | #34 | Not done | |
| MAVLink inspector | #196 | Not done | |
| More connection types, network discovery | #197 | Not done | |
| Expose a vehicle's serial port locally | #198 | Not done | |
| Position as NMEA; as Cursor on Target | #199, #200 | Not done | |
| Local HTTP telemetry service | #258 | Not done | |
| SSH terminal for companion computers | #257 | Not done | |
| MAVLink console | #120 | Not done | needs pico-mavlink #13 |
| Real serial and radio links, radio configuration and statistics | #190, #191, #264, #265 | Needs hardware | |

## Parameters

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Download and cache ArduPilot parameter metadata | #35 | Partial | the file is supplied or loaded from a path; no download, no per-version cache |
| Full table with groups and fast search | #36 | Partial | no everyday-words list, no "recently used" group, no budget test |
| Batch edit with verified writes | #37 | Partial | implemented; not confirmed: one rejected value, rounding, the override callout, discard |
| Parameter download over MAVFTP, cached per vehicle | #38 | Partial | no per-vehicle cache |
| Import and export parameter files | #39 | Partial | the app's snapshot format only; no plain `.param` file |
| Compare against a file or the defaults | #40 | Partial | no comparison with firmware defaults or another vehicle |
| Frame parameter presets | #41 | Not done | needs #39 |
| Reboot-required tracking and reboot | #42 | Partial | no pending-reboot indicator from the metadata flag |
| Curated view by user level | #44 | Partial | implemented; no grouped view with plain descriptions, no test with a real Copter metadata file |
| User-defined parameter pages | #201 | Not done | favourites only |
| Renamed parameters across firmware versions | #202 | Not done | |
| Restore parameters from a log | #203 | Not done | |
| Translated parameter metadata | #181 | Not done | |

## Flight data

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Backend map tile service with a persistent cache | #46 | Partial | implemented; no 20 ms cached-tile test, Retry-After not seen |
| Map sources, custom URL templates, keys | #48 | Partial | one built-in source plus a custom one; no registry |
| Pre-download a map area for offline use; download tiles for a mission | #49 | Not done | |
| Vehicle, trail and home on the map | #50 | Partial | no target on the map; no long-trail budget |
| Heads-up display | #51 | Partial | no link or GPS element; no configurable units; no frame-budget test |
| Configurable quick-value tiles | #52 | Not done | fixed cards only |
| All telemetry values in a table | #53 | Not done | |
| Vehicle messages and alerts | #54 | Partial | no filter or copy |
| Health indicators (GPS, EKF, vibration, battery, sensors) | #55 | Partial | no sensor-health flags or detail |
| Arm, disarm and pre-arm status | #56 | Partial | forced arm was ruled out by the leader; otherwise met |
| Flight mode selector and quick actions | #57 | Partial | no favourite-mode bar, no pause action |
| Guided control from the map | #58 | Partial | no region of interest; speed has no UI of its own |
| Mission progress in flight | #59 | Partial | backend only; no layer or current/reached items |
| Fence and rally points on the Flight Data map | #60 | Partial | backend only; no layers or breach state |
| Live graph of any telemetry value | #61 | Partial | no field selector, pause, zoom or export |
| Servo and relay control | #62 | Not done | |
| Gimbal and payload control | #63 | Not done | |
| ADS-B traffic on the map | #64 | Not done | |
| Map measuring and coordinate tools | #65 | Not done | |
| Telemetry rate presets | #66 | Not done | |
| Arm-and-takeoff, abort landing and pause | #213 | Partial | no abort landing, pause or continue |
| Set the EKF origin; fly to typed coordinates | #214 | Partial | out of the first version (the leader); no typed target |
| Editable preflight checklist | #204 | Not done | only the fixed "Review before arming" |
| Run RC auxiliary functions | #205 | Not done | |
| User-defined warnings | #206 | Not done | |
| Points of interest; no-fly and airport overlays | #207, #208 | Not done | |
| Proximity and obstacle view; raw sensor view | #209, #210 | Not done | |
| ESC telemetry and cell display; altitude reference and QNH | #211, #212 | Not done | |
| HUD options and swapping panes | #216 | Not done | |
| Camera footprint on the map | #215 | Not done | needs #171 |
| 3D map view; line-of-sight coverage | #217, #218 | Not done | needs terrain (#83) |
| Geomagnetic activity indicator | #219 | Not done | |
| Moving base and follow-me | #220 | Not done | |
| Custom imagery and GeoTIFF overlays | #221 | Not done | |

## Planner

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Mission document model with undo and redo | #67 | Partial | mission only; no dirty state or crash draft |
| Per-vehicle mission command definitions | #68 | Partial | the sixteen commands the backend knows; not per vehicle |
| Plan screen with map and item list | #69 | Partial | no 700-item budget measure |
| Add, drag, insert, delete waypoints on the map | #70 | Partial | no rectangle multi-select |
| Editable mission table | #71 | Partial | no multi-row paste |
| Altitude frames and defaults | #72 | Partial | no terrain frame choice or convert-on-change |
| Write to and read from the vehicle, verified | #73 | Partial | the backend and library exist; **no screen** (upload, download, diff, progress) |
| Takeoff, land, return and loiter helpers | #74 | Partial | no one-action helpers |
| Spline, jump, DO and condition commands | #75 | Partial | only ROI and set-home beyond navigation |
| Transform a mission | #76 | Not done | |
| Plan statistics | #77 | Partial | no time, per-leg or battery estimate |
| Mission validation before upload | #78 | Partial | nothing to gate yet (needs #73) |
| Mission files | #79 | Partial | codecs for `.plan` and `.waypoints` in the backend; no open/save screen; no CSV or JSON |
| Import KML and KMZ | #80 | Not done | |
| Geofence editor | #81 | Partial | backend only |
| Rally point editor | #82 | Partial | backend only |
| Terrain elevation service, profile, data for the vehicle | #83, #84, #85 | Not done | a decision document comes first (terrain/elevation) |
| Home position in planning | #86 | Not done | |
| Resume an interrupted mission | #87 | Not done | needs #73 |
| Landing sequence helper; camera-trigger items | #88, #89 | Not done | |
| Load and append missions | #222 | Partial | no open/append command on the Plan page |
| UTM and MGRS coordinate entry | #223 | Not done | |
| Circle and spline-circle generators; polygon tools | #224, #225 | Not done | |
| Import SHP and DXF; text to waypoints | #226, #227 | Not done | |
| Manage the command list | #228 | Not done | |
| Import local elevation data; terrain files for the SD card | #229, #230 | Not done | needs terrain |
| Survey grid, corridor scan, terrain-following missions | #168, #169, #170 | Not done | |
| Camera database and footprint calculator | #171 | Not done | |
| Circular survey; vertical face mapping | #251, #252 | Not done | |

## Setup

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Setup screen with progress across required steps | #90 | Partial | Copter only; progress is inferred from parameters |
| Frame class and type | #91 | Partial | no SITL e2e of a change after reboot |
| Board orientation | #92 | Partial | no live attitude preview |
| Accelerometer calibration | #93 | Partial | own position diagrams not found; needs-hardware-verification |
| Compass ordering, enable and orientation | #94 | Partial | no enable or orientation editing |
| Onboard compass calibration | #95 | Partial | needs-hardware-verification |
| Compass-motor interference calibration | #96 | Not done | needs-hardware-verification |
| Radio calibration | #97 | Partial | no channel reversal; needs-hardware-verification |
| RC auxiliary switches | #98 | Partial | no test that a switch triggers its function |
| Servo output setup | #99 | Partial | read-only table; needs-hardware-verification |
| ESC setup and calibration | #100 | Partial | no ESC calibration flow; needs-hardware-verification |
| Flight mode assignment | #101 | Partial | no live switch-position indicator |
| Failsafes | #102 | Partial | no confirmation for disabling |
| Motor test | #103 | Partial | no "all motors"; needs-hardware-verification |
| Initial tune values | #104 | Partial | implemented; the e2e runs on the built-in simulated vehicle, not SITL |
| Serial port functions and baud rates | #105 | Partial | no per-board port names or conflict callout |
| GPS setup | #106 | Not done | needs-hardware-verification |
| Battery monitor setup | #107 | Partial | no sensor presets; needs-hardware-verification |
| Multiple batteries | #108 | Partial | no BATT3 and up; no aggregate |
| Airspeed, rangefinders, optical flow | #109, #110, #111 | Not done | needs-hardware-verification |
| Onscreen display, gimbal, camera setup | #112, #113, #114 | Not done | needs-hardware-verification |
| ADS-B receiver; parachute, landing gear, relays; RPM and other sensors | #115, #116, #117 | Not done | needs-hardware-verification |
| Onboard file browser | #118 | Not done | MAVFTP exists only for logs and parameters |
| Onboard scripts | #119 | Not done | see Scripting |
| Vehicle and board information | #121 | Partial | no copyable diagnostics |
| Batch sampling and in-flight FFT setup | #122 | Partial | no FFT_ENABLE |
| Arming checks and safety switch | #231 | Not done | |
| Force a calibration result | #232 | Not done | needs-hardware-verification |
| GPS ordering, moving-baseline yaw, CAN bus, proximity, gimbal test | #233, #234, #235, #236, #237 | Not done | needs-hardware-verification |

## Tuning

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Tune screen with paired parameters and live graph | #123 | Partial | roll rate graph only; no SITL e2e |
| Basic pilot feel | #124 | Partial | no angle limit, yaw rate, climb rates |
| Rate and attitude controllers | #125 | Partial | no "large step" warning |
| Position and navigation tuning | #126 | Partial | speeds only as choices |
| Filters | #127 | Partial | accel filter and D-term filters missing |
| Harmonic notch setup | #128 | Partial | blocked on #122 |
| AutoTune | #129 | Partial | no start guide or progress; needs-hardware-verification |
| In-flight transmitter tuning | #130 | Partial | choice of function only |
| PID error review | #131 | Not done | |
| Plane controllers and TECS; Rover steering and speed | #132, #133, #134 | Not done | |

## Vehicle types

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Per-vehicle capability registry | #135 | Not done | first, for every other type |
| Plane: basic setup; takeoff and landing | #136, #137 | Not done | |
| QuadPlane: enable and frame; transitions; tuning; tilt-rotor and tailsitter | #138, #139, #140, #141 | Not done | |
| Rover: setup; navigation; boats; sailboats | #142, #143, #144, #145 | Not done | |
| Sub: frame; depth and modes; buttons | #146, #147, #148 | Not done | |
| Traditional helicopter: swashplate; rotor speed; tail and tuning | #149, #150, #151 | Not done | needs-hardware-verification |
| Antenna tracker; blimp | #152, #153 | Not done | |
| Group control, formation, follow-path swarm, onboard follow | #238, #239, #240, #241 | Not done | need several vehicles (#32) |

## Logs

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Onboard log list | #154 | Partial | no sorting, flight length or free space |
| Fast, resumable log download | #155 | Partial | no throughput report or budget check |
| Erase onboard logs | #156 | Partial | no SITL e2e that the list is empty afterwards |
| DataFlash log parser | #157 | Partial | no large-file budget; no fuzz test |
| Log browser | #158 | Partial | no switch-time budget |
| Log graphing | #159 | Partial | no stacking, expressions or presets |
| Log flight path on the map | #160 | Partial | no colouring by mode or value |
| Telemetry log playback | #161 | Partial | not all of Flight Data; narrower speed range |
| Tlog extraction | #162 | Partial | no parameter or mission extraction |
| Export flight paths | #163 | Partial | no KMZ |
| Automated log review | #164 | Partial | no compass, power or motor-imbalance checks |
| Anonymize logs for sharing | #165 | Not done | |
| Logging configuration | #242 | Partial | no backend or buffer settings |
| FFT and spectrogram analysis | #243 | Partial | budget and non-batch data to verify |
| Compass fitting from a log | #244 | Not done | |
| Organize and index log files | #245 | Partial | no per-vehicle folders or search |
| Log download over SCP; MATLAB and DashWare exports | #246, #247 | Not done | |
| Record DataFlash over MAVLink; geotag photos | #248, #249 | Not done | |

## Simulation

| Capability | Issue | Status | What remains |
|---|---|---|---|
| In-app SITL launcher | #166 | Not done | SITL runs only in the CI harness |
| Simulator controls | #167 | Not done | |
| Simulate several vehicles | #250 | Not done | |
| Flying with a gamepad or radio from the app | (none) | Out of scope | done by the separate `padcom/sitl-transmitter` program; the app's own joystick and RC control were removed (#516, #517) |

## Scripting

Scripting is **deferred**: the design document is reviewed by the leader before any code.

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Scripting API design; local API server; read and command APIs | #172, #173, #174, #175 | Deferred | the design first |
| Raw MAVLink access; declared UI forms; script manager | #176, #177, #178 | Deferred | scripting is undecided (not superseded) |

## Localization and preferences

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Translations (en, de, es, it, pl, ru, uk) | #180 | Partial | no right-to-left layout, no pseudo-locale check on every screen |
| Units and regional preferences | #179 | Not done | |
| In-app translation editor | #255 | Not done | |
| Preferences screen | #253 | Partial | no startup, rates, units, search or reset |

## Video, speech, firmware and hardware

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Spoken alerts | (none) | Out of scope | no speech in the app |
| Firmware manifest, bootloader, install screen | #187, #188, #189 | Needs hardware | |
| DroneCAN node list, parameters, firmware, inspector | #192, #193, #269 | Needs hardware | |
| RTK corrections; base station | #194, #270 | Needs hardware | |
| Bootloader update, secure boot, CubeID, Remote ID, transponder, tracker output | #262, #263, #266, #267, #268, #271 | Needs hardware | |

**Closed, so not counted:** video in the HUD (receive, show, extra sources, record with the HUD: #184, #185, #186, #260, #261) was
skipped by the leader on 2026-11-22 and is out of scope; the map engine under the host's CSP (#47) is superseded by the app's own
raster engine; the Sub joystick control (#325) is superseded by `padcom/sitl-transmitter`.

## Everything else

| Capability | Issue | Status | What remains |
|---|---|---|---|
| Parity rules and this matrix | #8 | **Done** by the change that adds this file | |
| Final parity audit | #183 | Not done | after localization, packaging and the rest |
| Linux packaging and release | #182 | Not done | |
| Update check | #256 | Not done | needs packaging |
| Help and diagnostics bundle | #259 | Not done | |
| Flaky `sitl-reconnect` e2e | #343 | Partial | keep open until it has not recurred |

Not in the matrix on purpose: a theme editor (one theme is a design rule, CLAUDE.md).

## How the matrix is kept

When a pull request changes a capability's status, it changes its row. The rows say what the code does; a closed issue is removed
from the table.
