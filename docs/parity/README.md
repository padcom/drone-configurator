# Parity with Mission Planner: the rules

Drone Configurator aims to let a user do what they expect to do in Mission Planner: configure a vehicle, plan and fly a mission,
read the logs. This folder holds the rules that every parity issue is built under, and the matrix that says where each capability
stands (`matrix.md`).

## The clean-room rule

**Mission Planner is a named comparison, never a source.** It is GPL-3.0; this project is MIT and stays MIT.

What counts as a source:

- **The MAVLink specification**: messages, enums, commands, their units and their semantics.
- **ArduPilot's documentation**: the wiki, the parameter descriptions, the source of ArduPilot itself where behaviour has to be
  checked (what a mode does, when a command is accepted).
- **ArduPilot's parameter metadata**, as a file the user supplies or the app downloads at run time (it is GPL data and is not
  bundled; see `THIRD-PARTY-NOTICES.md` and CLAUDE.md).
- The vehicle itself: ArduPilot SITL and the built-in simulator are where behaviour is observed.

What does not:

- Mission Planner's **code**, in any language, in whole or in part, translated or paraphrased line by line.
- Its **screen layouts**: where a control sits, how a page is divided, its icons, its colours, its wording.
- Its **assets**: images, icons, sounds, translations, sample files.
- Reading its source to "see how it does it" and then writing the same thing. If a question cannot be answered from the MAVLink
  specification, ArduPilot's documentation or the vehicle, the issue says it is open; it is not answered from Mission Planner.

How to write a parity issue under the rule:

1. Name the capability as a user would ("upload a mission to the vehicle"), and name Mission Planner only to say "this is what the
   user expects to find".
2. Specify it from the MAVLink specification and ArduPilot's documentation: which messages or parameters, what the vehicle answers,
   what can go wrong.
3. Design the screen from this project's own design (`docs/design/boards/`, the kit in `apps/frontend/src/components/ui`), not from
   a picture of another program.

A pull request that copies from Mission Planner is rejected, whatever else it does.

## What a source for the matrix is

`matrix.md` lists each capability, the issue that covers it, and where it stands. Its statuses mean:

| Status | Meaning |
|---|---|
| **Done** | every acceptance point of the issue is merged (code, tests, budgets) |
| **Partial** | something real is merged and something is missing; the note says what |
| **Not done** | nothing is merged |
| **Needs hardware** | cannot be verified without a vehicle or a device; it may be built against SITL and then carries the label "not verified on hardware" (the leader's decision of 2026-11-22) |
| **Deferred** | decided to wait: a decision document or an upstream change first |
| **Out of scope** | will not be built (the leader decided so, or the app does it another way) |
| **Superseded** | the issue is replaced by what was built another way |

An issue is closed with "Closes #N" only when every acceptance point is met; otherwise the pull request says "Part of #N" and says
what remains.

## The definition of done

Every parity issue is held to the same five things. An issue is not done until each is met or the pull request says in words why it
does not apply.

1. **Tests.** Unit tests for the logic; for a screen, a window end-to-end test against the fake vehicle in CI; for anything that
   talks to a vehicle, an end-to-end test against ArduPilot SITL on Linux (`needs-sitl`). Tests for a bug come with its fix. The
   locale tests (every key in every language, no literal text in a component) must pass.
2. **Speed budgets.** Where the issue names a budget (a screen switch, the palette, a table of many rows, telemetry coalescing, a
   plan of 700 items) the budget is measured by a test and fails the build when broken. A budget nobody measures is not a budget.
   Budgets belong in one place, so that a slower build is a visible change (issue #22 is making that so).
3. **i18n.** Every string goes through the translation files and exists in all seven languages (en, de, es, it, pl, ru, uk). Numbers,
   units and dates are formatted for the language. No text is built by joining pieces of sentences.
4. **Keyboard reach.** Every action can be done from the keyboard, in a sensible order, with a visible focus, and the common ones
   are commands in the palette. A control that only a pointer can reach is a bug.
5. **Safety confirmation.** An action that can hurt (arming, a motor test, a write to an armed vehicle, an erase, a group command)
   goes through `SafetyConfirm` as CLAUDE.md prescribes: a hold for arming and things as dangerous, a second press for destructive
   and group commands, a tick box for bench tests; it names what will happen and on which vehicle; Enter alone never confirms; a
   write to the vehicle is read back and the result shown.

Also, always: the colour rules, the one control height, no page scrolling at desktop widths, and a label "not verified on hardware"
on what could only be run against SITL where the issue carries the hardware-verification label.

## Where things are

- `matrix.md`: the capabilities, the issues and the status of each (as of the date at its top).
- `docs/design/boards/`: the design the screens are built from.
- CLAUDE.md: the design rules and the things never to do.
