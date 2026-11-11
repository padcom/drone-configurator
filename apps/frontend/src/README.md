# The layout of `apps/frontend/src`

Files are grouped by what they are, as in a regular Vue application.

| Folder | What is in it |
|---|---|
| (root) | `main.ts`, `router.ts`, `test-setup.ts`: the glue of the application |
| `components/ui/` | the kit: the controls, dialogs, menus and surfaces (`Button`, `Dialog`, `Menu`, `Select`, `Tabs`, `Icon`, `HoldButton` ...) |
| `components/fields/` | fields bound to a value of the vehicle: `EnumField`, `BitField`, `PanelForm`, `TruthValue` |
| `components/params/` | the Parameters screen's parts: table, editor, filter, groups, view, description, staged changes, snapshots |
| `components/fly/` | the Fly screen's parts: aside, messages, failsafe banner, `hud/` |
| `components/shell/` | the frame: `Shell`, `Rail`, `TopBar`, the dialogs, toasts and the settings notice |
| `screens/` | one component per screen, and `registry.ts`, the list of screens that the router and the rail read |
| `composables/` | the state and the actions that use the backend (`useConfigurator`, `useParams`, `useStaged` ...), and the small stores (`favourites`, `toasts`, `writeLock`) |
| `lib/params/`, `lib/fly/`, `lib/app/`, `lib/ui/` | plain logic, with no Vue state: the numbers, the text and the decisions behind the components |
| `state/` | the `State` type and the once-a-frame ref (`frame.ts`) |
| `backend/` | the client of the backend (the only place that sees the Communicator) |
| `generated/` | written by `pico-desktop generate` from the contract: do not edit, do not move |
| `i18n/` | the messages (`locales/en.json`), `i18n.ts` and `useFormat.ts` |
| `assets/styles/` | all the stylesheets, and the tests that read them |
| `mock/` | the simulated vehicle (`mock-backend.ts`, `fixtures.ts`), used by `pnpm ui` and the tests |
| `testing/` | helpers for component tests |
| `tests/` | the tests that belong to no single file: the flows, the build, the style rules, the lint and message checks |

Rules:

- **A test lives next to its file** (`X.test.ts` beside `X.vue` or `x.ts`); a test of several parts goes beside the main one.
  Cross-cutting tests go in `tests/`.
- Imports between folders use the alias `@/` (for `src/`); a file imports a neighbour in its own folder as `./x`.
- Components are `PascalCase.vue`; logic and composables are `camelCase.ts`; folders are lowercase.
