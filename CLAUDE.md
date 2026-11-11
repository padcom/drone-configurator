# Drone Configurator

A control center for ArduPilot vehicles: configuration, flight planning and mission execution. Vue 3 frontend in
`apps/frontend`, Pico backend in `apps/backend`, contract in `packages/contracts`. Work is tracked in GitHub issues.

## Commands

- `pnpm ui`: the frontend in a plain browser on the mock backend. `#/gallery` shows every kit control (development only).
- `pnpm test`, `pnpm lint`, `pnpm e2e`.
- In `apps/frontend`: `pnpm exec vitest run`, `pnpm typecheck`.

Branches are named `agent/<issue>-<part>-<topic>`. Pin exact dependency versions.

## Building from the design

The design is exported to `docs/design/boards/`. Every screen is one `*.dc.html` file. `canvas.json` lists them: `boards`
gives each file a `title` and a `page` (no page means the main "Control center" page), and `pages` names the groups.

**What the export preserves:** the structure of each screen, its copy, its states and how they change (the
`class Component` script at the bottom of each file), its tweakable props (`data-props`), and the links between screens.

**What it doesn't:**

- It doesn't run on its own: `support.js` is the design tool's runtime and isn't in the repo.
- It isn't code to copy. Inline styles and literal colours are how the tool works. Build with the kit and its tokens.
- Vehicles, values, parameter lists and timers are sample data. Real ones come from the backend and ArduPilot's metadata.
- `data-l` attributes and `<style data-shell>` are the prototype's version of the scrolling rule below. Don't port them.

**How to work:** one screen at a time. Pick a board, build it from the kit, confirm it against the board and its issue,
then move on. Where a board and an issue disagree, ask.

Kit: `apps/frontend/src/components/ui`. Shared boards map to kit pieces: `EnumField`, `HoldButton`, `PanelForm`, `TopBar`, `Rail`.
If a screen needs a control the kit lacks, add it to the kit rather than to the screen.

## Design rules

Values live in one place: `apps/frontend/src/assets/styles/tokens.css`. Use the tokens, and change a value there or nowhere.

**Colour**

- `--color-accent` (cyan) is the one accent: the primary action on a screen, the selected item, focus, live data.
- `--color-route` (magenta) is only for the planned path on a map.
- `--color-ok`, `--color-warn` and `--color-error` are only for status, and always come with an icon or text. Colour is
  never the only sign. `-soft` variants are the background behind text of that colour.
- `--color-border` divides. `--color-border-strong` is the edge of a control.

**Type:** IBM Plex Sans, with IBM Plex Mono for values, units and parameter names (not bundled yet).

| Use | Size and weight |
|---|---|
| Page title | `--font-size-xl`, 600 |
| Panel title | `--font-size-lg`, 600 |
| Section label | 11 to 12 px, 600, capitals, wide letter-spacing, muted |
| Body and controls | `--font-size-md` |
| Secondary text | `--font-size-sm`, muted |

**Space and shape:** a 4 px step (`--space-*`). Panels pad 20 px, main content 28 to 32 px. Radii are `--radius-sm` for
small things, `--radius-md` for controls and `--radius-lg` for panels.

**Controls:** every control and pressable row is `--control-height` (44 px).

**Scrolling** (#13): from 1000 px wide the page never scrolls. The shell fills the window, and each panel scrolls on its
own. Toolbars and tab bars above a list stay put. Maps and video fill their panel, down to 240 px. Below 1000 px the
panels stack and the page scrolls.

**Numbers with names:** where a value has a name, show the name. `EnumField` picks from a list or takes a number, and a
number with no name is shown as the number.

**Confirming dangerous actions** (#16): always through `SafetyConfirm`, and say what will happen and on which vehicle.

| Action | Confirmation |
|---|---|
| Arming, and anything as dangerous | Hold |
| Destructive or group commands | Second press on the same button, showing exactly what it applies to |
| Bench tests such as spinning motors | A tick box unlocks them |
| Anything else | None, to keep workflows short |

Enter alone must never confirm. After a write to the vehicle, read it back and show the result.

**Copy:** for pilots and builders in the field. Plain, short sentences that say what happens: "Return home", "Nothing is
sent until you confirm." Name the vehicle. Errors say what to do next. Every string goes through i18n, and every action
works from the keyboard.

## Never

- A light theme, a high-contrast theme or a density option. There is one dark theme and one control height.
- Page-level scrolling at desktop widths.
- Typed confirmations ("type DELETE to continue").
- Spinning motors with propellers on, whatever ArduPilot's procedure says. Bench tests are always propellers off.
- A second accent colour, or a status colour used for decoration.
- Mission Planner's code, layouts or assets (GPL-3.0). Build from the MAVLink specification and ArduPilot's documentation.
- ArduPilot's GPL parameter metadata in the application bundle (#35).
