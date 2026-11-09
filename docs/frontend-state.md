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

## Where the state lives

The interface's state is held by composables that use the client, one per concern, each a set of shallow refs and the
actions that change them:

- `useVehicle()` (`src/useVehicle.ts`): the connection, the serial ports, the notice when the backend went away, and the
  telemetry; `connect`, `disconnect`, `listPorts`.
- `useParams()` (`src/useParams.ts`): the parameter list and how its download went, the filter and the selection, the
  draft of a new value, and writing it.
- `useMetadata()` (`src/useMetadata.ts`): the parameter metadata loaded from a file, and why a file was not loaded.
- `useSnapshots()` (`src/useSnapshots.ts`): saving the parameters as a snapshot, loading one for review, the ticks, and
  writing the ticked changes after one confirmation.
- `useTelemetry()` (`src/useTelemetry.ts`): the telemetry, once per frame (see below).

Each is given what it needs from the rest as arguments (the client, a way to ask the user to confirm, and so on), so a
test builds its own on the mock backend. `createConfigurator()` (`src/useConfigurator.ts`) puts them together once, when
the page starts, and `useConfigurator()` gives a component the result: the composables to call, and `fields`, one ref
per piece of the `State` type (`src/state.ts`) that is the very ref the composable holding it changes. A component reads
the refs it needs and is woken by those only. There is no central object and no re-render loop.

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

## Screens and navigation

The application is one Vue app (`Shell.vue`) over a list of screens (`screens.ts`, `router.ts`).

- **Hash routes.** The host serves one document, so a screen is the part of the URL after `#` (`#/parameters`). The
  first screen, Flight data, is also where an unknown address goes. A screen is a dynamic import, loaded the first time
  it is shown.
- **A screen that was shown stays alive.** The shell wraps the screen in `<KeepAlive>`, so what is in its components
  (a typed filter, an open panel) is there when the user comes back. Since there are seven screens and each is cached
  once, there is no `max`; if the number of screens grows a lot, set one. State that must outlive a screen's
  components (the parameters, the selection, the draft) lives in the composables, as everywhere else.
- **Scroll.** The page is one document, so how far it is scrolled belongs to the page, not to a screen, and a short
  screen would reset it. The router remembers the position when a screen is left and gives it back when the screen is
  shown again (`scrollBehavior` and `beforeEach` in `router.ts`); a screen shown for the first time starts at the top.
- **Speed.** The real-window test `e2e/shell.e2e.ts` times a switch to a screen that has been shown before, from the
  click to the first frame with the screen in it, and fails above 100 ms. It prints the times, so a slow machine's
  numbers can be read from the log.

## While the link is being brought back

When the backend loses the vehicle it reports `reconnecting` (`attempt`, `nextRetryMs`) until the vehicle is back
(`connected`, with `resumed` when it is the same vehicle) or the user disconnects. In that time:

- the vehicle and the parameters stay on screen and no edit is offered (the session has ended for the writer, so a
  write in flight is stopped); a backend restart or stop ends it for good (`lost`, with the notice), as in any session;
- the last telemetry stays, and every card says "last heard, reconnecting" and is marked stale;
- **the numbers are snapshots.** The ages on the cards are frozen at the last event (nothing arrives to update them),
  and "next in S s" is the delay the backend gave when it reported the try: it does not count down. The next report
  (the next try) replaces it. That is deliberate: a ticking counter would need a clock in the page that agrees with the
  backend's, for a number that is only a hint.

## Settings

What survives a restart is the backend's (`settings.get`, `settings.set`, the event `settings.changed`); the interface
holds a copy in `useSettings()` (`settings`, `notice`) and does not read or write anything of its own in the browser.

- **Starting.** `createConfigurator` reads the settings once. What they name is applied at once: a kept theme goes on the
  page (`useTheme().set`), a kept language into the messages. What they do not name is left as it is (the system's theme,
  English). Until they arrive the page shows the defaults; there is no wait for them.
- **Choosing.** `settings.chooseTheme(next)` shows the theme first and then keeps it, so the page does not wait for the
  backend; if it cannot be kept the theme stays shown and `notice` says so. The answer, and every `settings.changed`,
  is applied the same way (`changed`), also when another window made the change.
- **The notice** is the backend's English text about the file (set aside, newer, cannot be written) or the interface's
  own when the backend cannot be asked. Dismissing it hides that text; the backend repeats it with every answer, and it
  is not shown again unless it changes.
- **The old language key.** An earlier version kept the language in `localStorage`. It is read once, moved into the
  settings if they have no language yet, and removed. If the move fails the key stays and is tried next start.
- **The interface's own entries** (`ui`, such as a layout) are for the screens that need them; they get their own
  helpers when the first one does (the Flight data layout).
