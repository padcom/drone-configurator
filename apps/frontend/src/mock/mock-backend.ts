// A stand-in for the Pico backend, in TypeScript over an in-memory link: the UI then runs in any
// browser (`pnpm ui`) and in Vitest. It speaks the same protocol as the host and implements
// packages/contracts/app.cddl with the simulated vehicle of fixtures.ts: only the "simulator"
// transport connects; UDP and TCP fail as they would with nothing listening.
import { type Transport, memoryTransportPair } from '@pico-desktop/communicator'
import { type Envelope, decodeEnvelope, encodeEnvelope } from '@pico-desktop/protocol'
import type {
  CalibrationStart, Connection, ConnectRequest, MessagesParams, Param, ParamListRequest, ParamWrite, RebootResult, SeriesAsk, LogsLocalSpectrumAsk, Settings, SettingsPatch,
  SettingsState, VehicleMessage,
} from '@/generated/app'
import { COPTER_MODES, PARAMS, SCRIPTED_MESSAGES, SERIAL_PORTS, VEHICLE, VEHICLE_DETAILS, telemetryAt } from './fixtures'
import { MockCalibration, type MockCalibrationOptions } from './mock-calibration'
import type { ExportAsk } from './mock-local-browser'
import { MockLocalLogs } from './mock-local-logs'
import { MockLogs, type MockLogsOptions } from './mock-logs'
import { MockMotors, type MockMotorsControl } from './mock-motors'

type Outgoing = Omit<Envelope, 'v'>
type Send = (e: Outgoing) => void

export interface MockOptions {
  /** Telemetry interval (ms). */
  telemetryMs?: number
  /** How long a step of reading a log on this computer takes (ms; it reads in three steps; 5 by default). */
  localLogsStepMs?: number
  /** Parameters the vehicle rounds to whole numbers on write (it reports the rounded value). */
  rounding?: string[]
  /** Parameters whose writes get no reply (the write times out). */
  silent?: string[]
  /** Filled in with controls for tests: `restart()` restarts the backend as the host does. */
  control?: MockControl
  /** The settings the backend starts with (what an earlier run saved), and the notice it gives about them. */
  settings?: Settings
  settingsNotice?: { notice: string, noticeCode: string }
  /** How long a vehicle that accepted a reboot stays gone (ms; 300 by default). */
  rebootMs?: number
  /** A download that takes its time: `steps` progress events, `intervalMs` apart, then the list (no events when not set). */
  progress?: { steps: number, intervalMs: number }
  /** How the vehicle's file transfer behaves at the start (see `MockControl.ftp`). */
  ftp?: 'ok' | 'unsupported' | 'timeout'
  /** How the logs on the vehicle download (four events of 20 ms for each log by default), and which they are. */
  logs?: MockLogsOptions
  /** The backend has no `logs.*` handler, as the real one has none yet: every call is answered with UNKNOWN_METHOD. */
  withoutLogs?: boolean
  /** The vehicle's parameters, when not the usual few (`SETUP_PARAMS` is a Copter that was set up). */
  params?: Param[]
  /** How the vehicle calibrates (its steps are 25 ms apart by default). */
  calibration?: MockCalibrationOptions
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
  /** The vehicle says something (a STATUSTEXT): stored and sent to the subscribers of `vehicle.messages`. */
  say?: (severity: number, text: string) => void
  /**
   * Sets what `vehicle.reboot` sees of the vehicle's armed state, and what the telemetry says: true or false, or null for
   * "not known" (no recent heartbeat). Until it is called, the state is the telemetry's own (armed from its fourth sample).
   */
  armed?: (armed: boolean | null) => void
  /** Whether a parameter write or download is under way, as `vehicle.reboot` sees it (it refuses with BUSY). */
  busy?: (busy: boolean) => void
  /** How the vehicle's file transfer behaves: `ok` (the default), `unsupported` or `timeout` (a download falls back to the list). */
  ftp?: (mode: 'ok' | 'unsupported' | 'timeout') => void
  /** What the vehicle answers to a reboot (`accepted` unless set). */
  rebootAnswer?: (answer: RebootResult['result']) => void
  /** How many reboot commands the vehicle has been sent (a refused call sends none). */
  rebootsSent?: () => number
  /** What the motor test has done (see `MockMotorsControl`). */
  motors?: MockMotorsControl
}

/** How long a rebooting mock vehicle is gone (ms), unless `MockOptions.rebootMs` says. */
const REBOOT_MS = 300

/** How many messages the mock keeps, how many it replays by default, and at most (as the backend does). */
const MESSAGE_RING = 500
const DEFAULT_REPLAY = 100
const MAX_REPLAY = 200

class MockVehicle {
  connection: Connection = { state: 'disconnected' }
  params: Param[]
  readonly watchers = new Set<number>()
  readonly timers = new Map<number, ReturnType<typeof setInterval>>()
  /** The subscriptions to `vehicle.messages`, and the messages kept for them (ids go up for as long as the mock runs). */
  readonly messageSubscribers = new Set<number>()
  messages: VehicleMessage[] = []
  nextMessageId = 1

  /** What a test set for the armed state (undefined: the telemetry's own, null: not known), and what the telemetry last said. */
  armedOverride: boolean | null | undefined
  telemetryArmed: boolean | undefined
  busy = false
  /** How the vehicle's file transfer behaves (the download falls back to the list when it is not `ok`). */
  ftpMode: 'ok' | 'unsupported' | 'timeout' = 'ok'
  /** The download that takes its time (`MockOptions.progress`): its timer, and how to fail it. */
  pendingList: { timer: ReturnType<typeof setInterval>, fail: (code: string, message: string) => void } | undefined
  rebootAnswer: RebootResult['result'] = 'accepted'
  rebootsSent = 0
  readonly logs: MockLogs
  /** The calibration of the vehicle's sensors. */
  readonly calibration: MockCalibration
  /** The logs on this computer (no vehicle needed). */
  readonly localLogs: MockLocalLogs
  /** The motor test. */
  readonly motors: MockMotors

  epoch = 1
  saved: { path: string, text: string } | null = null
  /** What the "file" holds: it outlives a restart of the mock backend, as the real file does. */
  settings: Settings

  constructor(private readonly send: Send, private readonly options: MockOptions) {
    this.settings = options.settings ?? { version: 1, ui: [] }
    this.params = (options.params ?? PARAMS).map(p => ({ ...p }))
    this.ftpMode = options.ftp ?? 'ok'
    this.logs = new MockLogs(send, options.logs ?? { steps: 4, intervalMs: 20 }, () => this.armedState())
    this.localLogs = new MockLocalLogs(send, options.localLogsStepMs)
    this.calibration = new MockCalibration(send, options.calibration ?? {}, () => this.armedState(), (id, value) => this.announceParam(id, value))
    this.motors = new MockMotors(send, () => this.armedState() ?? null, () => this.connection.state === 'connected')
    if (options.control) {
      options.control.motors = this.motors.control()
      options.control.restart = () => this.restart()
      options.control.announce = (id, value) => this.announceParam(id, value)
      options.control.connection = connection => this.push(connection)
      options.control.say = (severity, text) => this.say(severity, text)
      options.control.armed = armed => { this.armedOverride = armed }
      options.control.busy = busy => { this.busy = busy }
      options.control.ftp = mode => { this.ftpMode = mode }
      options.control.rebootAnswer = answer => { this.rebootAnswer = answer }
      options.control.rebootsSent = () => this.rebootsSent
    }
  }

  /**
   * The vehicle announces a parameter it changed on its own (another ground station, a calibration that was accepted).
   *
   * @param id the parameter
   * @param value its new value
   */
  announceParam(id: string, value: number) {
    const param = this.params.find(p => p.id === id)
    if (param) {
      param.value = value
      this.send({ k: 'event', n: 'params.changed', p: { ...param } })
    }
  }

  /** What the host does when the backend restarts: a new backend, without the vehicle session. */
  restart() {
    this.send({ k: 'lifecycle', n: 'restarting' })
    for (const timer of this.timers.values()) {
      clearInterval(timer)
    }
    this.timers.clear()
    if (this.pendingList) {
      clearInterval(this.pendingList.timer)
      this.pendingList = undefined
    }
    this.logs.reset()
    this.calibration.reset()
    this.motors.reset()
    this.watchers.clear()
    this.messageSubscribers.clear()
    this.connection = { state: 'disconnected' }
    this.epoch += 1
    setTimeout(() => this.send({ k: 'lifecycle', n: 'ready', e: this.epoch }), 5)
  }


  receive(e: Envelope) {
    if (e.k === 'lifecycle' && e.n === 'hello') {
      this.send({ k: 'lifecycle', n: 'ready', e: this.epoch })
    } else if (e.k === 'unsubscribe') {
      this.watchers.delete(e.s!)
      this.messageSubscribers.delete(e.s!)
      this.motors.unsubscribe(e.s!)
      clearInterval(this.timers.get(e.s!))
      this.timers.delete(e.s!)
    } else if (e.k === 'request' || e.k === 'subscribe') {
      this.answer(e)
    }
  }

  answer(e: Envelope) {
    const ok = (p: Envelope['p']) => this.send({ k: 'response', id: e.id!, p })
    const fail = (code: string, message: string) => this.send({ k: 'error', id: e.id!, err: { code, message } })
    if (this.options.withoutLogs && e.n?.startsWith('logs.')) {
      return fail('UNKNOWN_METHOD', `no handler for ${e.n}`)
    }
    switch (e.n) {
      case 'vehicle.connect': return this.connect(e.p as ConnectRequest, ok)
      case 'vehicle.disconnect': return this.update({ state: 'disconnected' }, ok)
      case 'vehicle.connection':
        this.watchers.add(e.id!)
        this.send({ k: 'response', id: e.id!, s: e.id! })
        return this.send({ k: 'event', n: 'vehicle.connection', s: e.id!, p: this.connection })
      case 'params.list': return this.connected(fail) && this.list((e.p as ParamListRequest | null)?.method ?? 'auto', ok, fail)
      case 'params.cancel': return this.cancelList(ok)
      case 'params.write': return this.connected(fail) && this.write(e.p as ParamWrite, ok, fail)
      case 'vehicle.reboot': return this.reboot(ok, fail)
      case 'vehicle.info': return this.connected(fail) && ok({ ...VEHICLE_DETAILS, sensors: [...VEHICLE_DETAILS.sensors] })
      case 'vehicle.modes': return this.connected(fail) && ok({ kind: 'copter', modes: COPTER_MODES })
      case 'calibration.start': return this.connected(fail) && this.calibration.start(e.p as CalibrationStart, ok, fail)
      case 'calibration.confirm': return this.calibration.confirm((e.p as { position: number }).position, ok, fail)
      case 'calibration.accept': return this.calibration.accept((e.p as { compasses?: number } | null)?.compasses ?? 0, ok, fail)
      case 'calibration.finish': return this.calibration.finishRadio(ok, fail)
      case 'calibration.cancel': return this.calibration.cancel(ok)
      case 'calibration.status': return this.calibration.status(ok)
      case 'logs.vehicle.list': return this.connected(fail) && this.logs.list(ok)
      case 'logs.download': return this.connected(fail) && this.logs.download((e.p as { ids: number[] }).ids, ok, fail)
      case 'logs.cancel': return this.logs.cancel(ok)
      case 'logs.erase': return this.connected(fail) && this.logs.erase(ok, fail)
      case 'logs.housekeeping': return ok({ removed: [], removedCount: 0, freed: 0, kept: 0, unverified: 0, overCap: false, partsRemoved: 0 })
      case 'logs.local.list': return this.localLogs.list(ok)
      case 'logs.import': return this.localLogs.importFile(ok)
      case 'logs.local.read': return this.localLogs.read((e.p as { key: string }).key, ok, fail)
      case 'logs.local.modes': return this.localLogs.modes((e.p as { key: string }).key, ok, fail)
      case 'logs.local.review': return this.localLogs.review((e.p as { key: string }).key, ok, fail)
      case 'logs.local.series': return this.localLogs.series(e.p as { key: string, series: SeriesAsk[], buckets: number }, ok, fail)
      case 'logs.local.messages': return this.localLogs.messages((e.p as { key: string }).key, ok, fail)
      case 'logs.local.at': return this.localLogs.at(e.p as { key: string, message: string, timeUs: number }, ok, fail)
      case 'logs.local.export': return this.localLogs.export(e.p as ExportAsk, ok, fail)
      case 'logs.local.batches': return this.localLogs.batches((e.p as { key: string }).key, ok, fail)
      case 'logs.local.spectrum': return this.localLogs.spectrum(e.p as LogsLocalSpectrumAsk, ok, fail)
      case 'logs.local.cancel': return this.localLogs.cancel(ok)
      case 'motors.test': return this.motors.subscribe(e)
      case 'motors.hold': return this.motors.hold(ok, fail)
      case 'telemetry.stream': return this.telemetry(e)
      case 'vehicle.messages': return this.subscribeToMessages(e, fail)
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

  /**
   * The download: by file transfer where the vehicle has it, else by list (the way is `ftp` in the mock's own words: `ok`,
   * `unsupported` or `timeout`, see `MockControl.ftp`). With `MockOptions.progress` it takes its time, sending progress
   * as it goes, and `params.cancel` ends it.
   *
   * @param method what the caller asked for
   * @param ok sends the result
   * @param fail sends an error
   */
  list(method: 'auto' | 'list' | 'ftp', ok: (p: Envelope['p']) => void, fail: (code: string, message: string) => void) {
    const failure = this.ftpMode === 'ok' ? null : this.ftpMode
    if (method === 'ftp' && failure) {
      return fail(failure === 'timeout' ? 'TIMEOUT' : 'UNSUPPORTED', `file transfer: ${failure}`)
    }
    const byFtp = method !== 'list' && !failure
    const source = byFtp ? 'ftp' as const : 'list' as const
    const fallback = method === 'list' ? 'disabled' : failure
    const steps = this.options.progress?.steps ?? 0
    const intervalMs = this.options.progress?.intervalMs ?? 0
    const result = {
      params: this.params,
      count: this.params.length,
      complete: true,
      missing: [] as number[],
      source,
      ...fallback ? { fallback } : {},
      elapsedMs: steps > 0 ? steps * intervalMs : byFtp ? 800 : 6200,
    }
    if (steps <= 0) {
      return ok(result)
    }
    let done = 0
    const total = this.params.length
    const timer = setInterval(() => {
      done += 1
      this.send({ k: 'event', n: 'params.progress', p: { received: Math.round(total * done / steps), total, source } })
      if (done >= steps) {
        clearInterval(timer)
        this.pendingList = undefined
        ok(result)
      }
    }, intervalMs)
    this.pendingList = { timer, fail }
  }

  /**
   * Stops the download that is under way, if there is one; it fails with `ABORTED`.
   *
   * @param ok sends the (empty) answer
   */
  cancelList(ok: (p: Envelope['p']) => void) {
    const pending = this.pendingList
    if (pending) {
      clearInterval(pending.timer)
      this.pendingList = undefined
      pending.fail('ABORTED', 'the parameter list: cancelled')
    }
    ok(null)
  }

  settingsState(): SettingsState {
    return { settings: this.settings, ...this.options.settingsNotice }
  }

  /** Whether the vehicle is armed: a test's say, else the telemetry's; undefined or null when it is not known. */
  armedState(): boolean | null | undefined {
    return this.armedOverride === undefined ? this.telemetryArmed : this.armedOverride
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
      this.params = (this.options.params ?? PARAMS).map(p => ({ ...p }))
      this.telemetryArmed = undefined
      this.logs.reset()
      this.update({ state: 'connected', vehicle: { ...VEHICLE } }, ok)
      this.messages = []
      for (const [severity, text] of SCRIPTED_MESSAGES) {
        this.say(severity, text)
      }
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
    const armed = this.armedState()
    // A write from a Setup page (`guarded`) is refused while the vehicle is armed or not known to be disarmed, as the backend does.
    if (w.guarded === true && (armed === undefined || armed === null || armed)) {
      return armed ? fail('ARMED', 'the vehicle is armed') : fail('STATE_UNKNOWN', 'the vehicle\'s state is unknown (no heartbeat for 3 s)')
    }
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

  /**
   * The backend's `vehicle.reboot`: refuses, sending nothing, when the vehicle is not connected, is armed or not known to be
   * disarmed, or a parameter operation is under way; otherwise "sends" the command once and answers as set. A vehicle that
   * accepted goes `reconnecting` with the code REBOOTING, and comes back as the same vehicle (resumed).
   */
  reboot(ok: (p: Envelope['p']) => void, fail: (code: string, message: string) => void) {
    if (!this.connected(fail)) {
      return undefined
    }
    const armed = this.armedState()
    if (armed === undefined || armed === null) {
      return fail('STATE_UNKNOWN', 'the vehicle\'s state is unknown (no heartbeat for 3 s)')
    }
    if (armed) {
      return fail('ARMED', 'the vehicle is armed')
    }
    if (this.busy) {
      return fail('BUSY', 'parameters are being written or downloaded, or a reboot is already under way')
    }
    this.rebootsSent += 1
    if (this.rebootAnswer === 'accepted') {
      this.goesAndComesBack()
    }

    return ok({ result: this.rebootAnswer })
  }

  /** The vehicle reboots: the link goes quiet for a moment (REBOOTING), then it is the same vehicle again. */
  goesAndComesBack() {
    const { vehicle } = this.connection
    this.busy = true
    setTimeout(() => {
      this.push({ state: 'reconnecting', vehicle, error: 'the vehicle is rebooting', errorCode: 'REBOOTING', attempt: 1, nextRetryMs: 1000 })
      setTimeout(() => {
        this.busy = false
        this.push({ state: 'connected', vehicle, resumed: true })
      }, this.options.rebootMs ?? REBOOT_MS)
    }, 20)
  }

  /** The vehicle says something: kept (the last 500) and sent to everyone who is subscribed. */
  say(severity: number, text: string) {
    const message: VehicleMessage = {
      id: this.nextMessageId++,
      time: Date.now(),
      system: VEHICLE.sysid,
      component: VEHICLE.compid,
      severity,
      text,
      truncated: false,
    }
    this.messages.push(message)
    this.messages.splice(0, Math.max(0, this.messages.length - MESSAGE_RING))
    for (const s of this.messageSubscribers) {
      this.send({ k: 'event', n: 'vehicle.messages', s, p: message })
    }
  }

  /** The stored messages asked for (oldest first), then every new one. */
  subscribeToMessages(e: Envelope, fail: (code: string, message: string) => void) {
    const replay = (e.p as MessagesParams | null)?.replay ?? DEFAULT_REPLAY
    if (replay > MAX_REPLAY) {
      return fail('INVALID_VALUE', `replay is 0 to ${MAX_REPLAY}, not ${replay}`)
    }
    const s = e.id!
    this.send({ k: 'response', id: s, s })
    this.messageSubscribers.add(s)
    for (const message of this.messages.slice(Math.max(0, this.messages.length - replay))) {
      this.send({ k: 'event', n: 'vehicle.messages', s, p: message })
    }
  }

  telemetry(e: Envelope) {
    const s = e.id!
    let n = 0
    this.send({ k: 'response', id: s, s })
    this.timers.set(s, setInterval(() => {
      if (this.connection.state === 'connected') {
        const sample = telemetryAt(n++)
        if (this.armedOverride !== undefined && this.armedOverride !== null) {
          sample.armed = this.armedOverride
        }
        this.telemetryArmed = sample.armed
        this.send({ k: 'event', n: 'telemetry.stream', s, p: sample })
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
