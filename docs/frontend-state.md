# How the interface talks to the backend and holds its state

One page: backend calls, subscriptions and when they end, errors, and the frame rule. The code is in
`apps/frontend/src/backend/client.ts` and `apps/frontend/src/state/frame.ts`.

## The backend client

`createBackendClient(transport)` is the only place that uses the Communicator. Components and composables get a
`BackendClient` and nothing else: ESLint refuses an import of `@pico-desktop/communicator` outside `src/backend/`
(type imports are fine; `main.ts` picks the transport, the host's bridge or the mock backend).

- `client.call('params.write', { id, value })` calls a method and returns its response. The names and the types come
  from `src/generated/app.ts`, which is generated from `packages/contracts/app.cddl`, so a wrong name or payload is a
  type error.
- `client.subscribe('telemetry.stream', null, onValue, onEnd?)` returns `{ ready, stop }`.
- `client.onEvent('params.changed', listener)` listens to a one-way event and returns its stop function.
- `client.onState(listener)` observes the link: the backend restarts after a crash or an edit in development.
  Like the others, it ends with the effect scope it was made in.

## Subscriptions and when they end

A subscription ends when `stop()` is called, **or when the effect scope it was made in ends**: made in a component's
`setup`, it ends with the component, and no cleanup code is needed. Made outside any scope (in `main.ts`, or in a
test) it lives until `stop()`.

- `ready` resolves once the backend accepted the subscription and rejects with a `BackendError` if it did not. Always
  handle it (`await` it, or `.catch` it): an unhandled rejection is an error.
- `onEnd(error)` is called once when the **backend** ends the subscription: with a `BackendError` if it failed, with
  `null` if it ended normally. It is never called for a `stop()` of your own. A subscription the backend **refuses** is
  not an end: `ready` rejects (also when `stop()` came first).
- Stopping before the backend has answered is fine: the subscription is cancelled as soon as it is accepted, and no
  value reaches `onValue` in between.
- After a backend restart the Communicator subscribes again by itself. Values missed meanwhile are not replayed.

## Errors

Every failed call rejects with one error type, `BackendError { code, message }`:

- `code` is the protocol's or the application's own (`NOT_CONNECTED`, `TIMEOUT`, `UNKNOWN_PARAM`, ...), or `unknown`
  for anything that was not a failed call. Match on `code`, never on `message`.
- `message` is English text for people to read. Showing it is fine; the interface's own words come from
  `locales/en.json` (#18), and a code is how a component picks its own text.
- `cause` is the original error.

## The frame rule

Telemetry can arrive at 50 Hz; a screen draws at 60 Hz or less, and a 1200-row parameter table must not be touched
for every value. `useFrameRef(initial)` returns a `FrameRef`:

- `push(value)` can be called any number of times; at most once per animation frame the **latest** pushed value is
  published, and `value` (a read-only ref) changes only then.
- `flush()` publishes now and cancels the frame that was asked for; `stop()` drops the pending value. `stop()` is also
  done when the effect scope ends.
- The published value is the object that was pushed, not a Vue proxy of it (the ref is shallow).
- The scheduler is injectable (`useFrameRef(initial, schedule)`, `requestAnimationFrame` by default), so a test
  drives the frames by hand and asserts that 100 pushes in one frame make one publish.

A component reads `value`, so it renders once per frame however fast the data arrives. Data that arrives rarely (a
connection state, a list) does not need a frame ref.
