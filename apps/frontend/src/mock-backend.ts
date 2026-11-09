// A stand-in for the Pico backend, in TypeScript over an in-memory link: the UI then runs in any
// browser (`pnpm ui`) and in Vitest. It speaks the same protocol as the host and implements
// packages/contracts/app.cddl with the simulated vehicle of fixtures.ts: only the "simulator"
// transport connects; UDP and TCP fail as they would with nothing listening.
import { type Transport, memoryTransportPair } from '@pico-desktop/communicator'
import { type Envelope, decodeEnvelope, encodeEnvelope } from '@pico-desktop/protocol'
import type { Connection, ConnectRequest, Param, ParamWrite, Settings, SettingsPatch, SettingsState } from './generated/app'
import { PARAMS, SERIAL_PORTS, VEHICLE, telemetryAt } from './fixtures'

type Outgoing = Omit<Envelope, 'v'>
type Send = (e: Outgoing) => void

export interface MockOptions {
  /** Telemetry interval (ms). */
  telemetryMs?: number
  /** Parameters the vehicle rounds to whole numbers on write (it reports the rounded value). */
  rounding?: string[]
  /** Parameters whose writes get no reply (the write times out). */
  silent?: string[]
  /** Filled in with controls for tests: `restart()` restarts the backend as the host does. */
  control?: MockControl
  /** The settings the backend starts with (what an earlier run saved), and the notice it gives about them. */
  settings?: Settings
  settingsNotice?: { notice: string, noticeCode: string }
}

/**
 * The settings with a patch applied, as the backend does it (the limits are the backend's to enforce, not the mock's).
 *
 * @param doc the settings
 * @param patch what to change
 * @returns the new settings
 */
export function patchSettings(doc: Settings, patch: SettingsPatch): Settings {
  const next: Settings = { ...doc, ui: [...doc.ui] }
  if (patch.language !== undefined) {
    next.language = patch.language
  }
  if (patch.theme !== undefined) {
    next.theme = patch.theme
  }
  for (const entry of patch.ui ?? []) {
    const at = next.ui.findIndex(e => e.key === entry.key)
    if (at < 0) {
      next.ui.push({ ...entry })
    } else {
      next.ui[at] = { ...entry }
    }
  }
  for (const name of patch.remove ?? []) {
    if (name === 'language') {
      delete next.language
    } else if (name === 'theme') {
      delete next.theme
    } else {
      next.ui = next.ui.filter(e => e.key !== name)
    }
  }

  return next
}

export interface MockControl {
  restart?: () => void
  /** The vehicle announces a parameter changed elsewhere (as by another ground station). */
  announce?: (id: string, value: number) => void
  /** The backend reports a new connection state on its own (the link was lost, a try failed, it came back). */
  connection?: (connection: Connection) => void
}

class MockVehicle {
  connection: Connection = { state: 'disconnected' }
  params: Param[] = PARAMS.map(p => ({ ...p }))
  readonly watchers = new Set<number>()
  readonly timers = new Map<number, ReturnType<typeof setInterval>>()

  epoch = 1
  saved: { path: string, text: string } | null = null
  /** What the "file" holds: it outlives a restart of the mock backend, as the real file does. */
  settings: Settings

  constructor(private readonly send: Send, private readonly options: MockOptions) {
    this.settings = options.settings ?? { version: 1, ui: [] }
    if (options.control) {
      options.control.restart = () => this.restart()
      options.control.announce = (id, value) => {
        const param = this.params.find(p => p.id === id)
        if (param) {
          param.value = value
          this.send({ k: 'event', n: 'params.changed', p: { ...param } })
        }
      }
      options.control.connection = connection => this.push(connection)
    }
  }

  /** What the host does when the backend restarts: a new backend, without the vehicle session. */
  restart() {
    this.send({ k: 'lifecycle', n: 'restarting' })
    for (const timer of this.timers.values()) {
      clearInterval(timer)
    }
    this.timers.clear()
    this.watchers.clear()
    this.connection = { state: 'disconnected' }
    this.epoch += 1
    setTimeout(() => this.send({ k: 'lifecycle', n: 'ready', e: this.epoch }), 5)
  }


  receive(e: Envelope) {
    if (e.k === 'lifecycle' && e.n === 'hello') {
      this.send({ k: 'lifecycle', n: 'ready', e: this.epoch })
    } else if (e.k === 'unsubscribe') {
      this.watchers.delete(e.s!)
      clearInterval(this.timers.get(e.s!))
      this.timers.delete(e.s!)
    } else if (e.k === 'request' || e.k === 'subscribe') {
      this.answer(e)
    }
  }

  answer(e: Envelope) {
    const ok = (p: Envelope['p']) => this.send({ k: 'response', id: e.id!, p })
    const fail = (code: string, message: string) => this.send({ k: 'error', id: e.id!, err: { code, message } })
    switch (e.n) {
      case 'vehicle.connect': return this.connect(e.p as ConnectRequest, ok)
      case 'vehicle.disconnect': return this.update({ state: 'disconnected' }, ok)
      case 'vehicle.connection':
        this.watchers.add(e.id!)
        this.send({ k: 'response', id: e.id!, s: e.id! })
        return this.send({ k: 'event', n: 'vehicle.connection', s: e.id!, p: this.connection })
      case 'params.list':
        return this.connected(fail) && ok({ params: this.params, count: this.params.length, complete: true, missing: [] })
      case 'params.write': return this.connected(fail) && this.write(e.p as ParamWrite, ok, fail)
      case 'telemetry.stream': return this.telemetry(e)
      case 'files.save': {
        // A pretend file system: what was saved last is what opening gives back.
        const { name, text } = e.p as { name: string, text: string }
        this.saved = { path: `/mock/${name}`, text }

        return ok({ path: this.saved.path })
      }
      case 'files.open': return ok(this.saved ?? {})
      case 'serial.ports': return ok({ ports: SERIAL_PORTS })
      case 'settings.get': return ok(this.settingsState())
      case 'settings.set': {
        this.settings = patchSettings(this.settings, e.p as SettingsPatch)
        const state = this.settingsState()
        this.send({ k: 'event', n: 'settings.changed', p: state })

        return ok(state)
      }
      default: return fail('UNKNOWN_METHOD', `the mock has no ${e.n}`)
    }
  }

  settingsState(): SettingsState {
    return { settings: this.settings, ...this.options.settingsNotice }
  }

  connected(fail: (code: string, message: string) => void): boolean {
    if (this.connection.state !== 'connected') {
      fail('NOT_CONNECTED', 'no vehicle is connected')
    }

    return this.connection.state === 'connected'
  }

  connect(request: ConnectRequest, ok: (p: Envelope['p']) => void) {
    // The flight controller on the mock's USB port is the simulated vehicle too.
    if (request.transport === 'simulator' || (request.transport === 'serial' && request.device === '/dev/ttyACM0')) {
      this.params = PARAMS.map(p => ({ ...p }))
      this.update({ state: 'connected', vehicle: { ...VEHICLE } }, ok)
    } else if (request.transport === 'serial') {
      this.update({ state: 'disconnected', error: `no heartbeat from serial ${request.device ?? '(no device)'} at ${request.baud ?? 115200}` }, ok)
    } else {
      const where = `${request.host ?? '127.0.0.1'}:${request.port ?? (request.transport === 'udp' ? 14550 : 5760)}`
      this.update({ state: 'disconnected', error: `no heartbeat from ${request.transport} ${where}` }, ok)
    }
  }

  /** Tells every watcher of the connection that it is now `connection`. */
  push(connection: Connection) {
    this.connection = connection
    for (const s of this.watchers) {
      this.send({ k: 'event', n: 'vehicle.connection', s, p: connection })
    }
  }

  update(connection: Connection, ok: (p: Envelope['p']) => void) {
    this.push(connection)
    ok(connection)
  }

  write(w: ParamWrite, ok: (p: Envelope['p']) => void, fail: (code: string, message: string) => void) {
    const param = this.params.find(p => p.id === w.id)
    if (!param) {
      return fail('UNKNOWN_PARAM', `the vehicle has no ${w.id}`)
    }
    if (this.options.silent?.includes(w.id)) {
      return setTimeout(() => fail('TIMEOUT', `no PARAM_VALUE for ${w.id} after PARAM_SET (4 tries)`), 50)
    }
    param.value = this.options.rounding?.includes(w.id) ? Math.round(w.value) : w.value

    return ok({ param: { ...param }, verified: param.value === w.value })
  }

  telemetry(e: Envelope) {
    const s = e.id!
    let n = 0
    this.send({ k: 'response', id: s, s })
    this.timers.set(s, setInterval(() => {
      if (this.connection.state === 'connected') {
        this.send({ k: 'event', n: 'telemetry.stream', s, p: telemetryAt(n++) })
      }
    }, this.options.telemetryMs ?? 1000))
  }
}

/** The app's end of a link to the mock backend. */
export function mockBackend(options: MockOptions = {}): Transport {
  const [app, backend] = memoryTransportPair()
  const vehicle = new MockVehicle(e => backend.send(encodeEnvelope(e)), options)
  backend.connect(bytes => vehicle.receive(decodeEnvelope(bytes)))

  return app
}
