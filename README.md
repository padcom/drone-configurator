# Drone Configurator

A MAVLink 2 configuration dashboard built with [Pico Desktop](https://github.com/padcom/pico-desktop).
- **Frontend:** vanilla TypeScript and Vite.
- **Backend:** Pico, on [pico-mavlink](https://github.com/padcom/pico-mavlink).

It's the reference application of the Pico Desktop plan (§14). It's independent of the framework and not required for its release.

Status: **DR0 (the dashboard shell) and parts of DR1.**
- Connect to the built-in simulator (or over UDP/TCP), and see the vehicle and its heartbeat, mode, armed state, battery and attitude.
- Download the parameter list. An incomplete download says which indexes are missing.
- Filter the list, and see a parameter's typed value.
- Edit a value: it's checked against its type, you confirm the write, and the vehicle's read-back is verified. A value the vehicle changed, or a write it never confirmed, is reported as such, never as success.
- Save the parameters as a snapshot, and load one to review what it would change. Nothing is ticked at first, and a change that can't apply says why: not on this vehicle, another type, or out of range. Writing the ticked changes takes one confirmation, verifies each change, stops at the first one that doesn't verify, and keeps a backup of the values from before. In Pico Desktop, files go through the host's native dialogs.
- A backend restart ends the vehicle session. The parameters stay on screen, a write that was in flight is reported as unconfirmed (never resent), and you reconnect when you choose.

## Run it

It expects `pico-desktop`, `pico-lang` and `pico-mavlink` next to this folder (as in `~/projects/padcom/pico`). It also needs a pico with pico-lang PRs #103 and #105, until they're released.

```sh
pnpm install
pnpm dev      # the app, with the "Simulator" transport for a vehicle without hardware
pnpm ui       # the frontend alone in a browser, on a TypeScript mock of the backend
pnpm test     # Vitest (the UI's logic and rendering) and pico test (the backend)
```

For ArduPilot SITL, choose UDP on port 14550 (SITL's `--out` default) or TCP on port 5760.

## Layout

- `packages/contracts/app.cddl`: the contract (methods, subscriptions, types) between the dashboard and the backend.
- `apps/backend`: the Pico backend. It owns the MAVLink link: discovery, heartbeats, parameter list/read/write with retries and read-back, and telemetry.
- `apps/frontend`:
  - `configurator.ts`: the state and actions, without the DOM;
  - `render.ts`: pure HTML from the state;
  - `main.ts`: the DOM wiring;
  - `mock-backend.ts` and `fixtures.ts`: a deterministic simulated vehicle for Vitest and `pnpm ui`.

## Safety

Parameter writes change how a vehicle flies. Test against SITL or the simulator first, and keep a backup of the parameters before writing to real hardware.

## License

MIT
