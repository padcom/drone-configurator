// The pads of the mock backend: what the real one (apps/backend/pad.pi) says to the page, with pads that are made up.
// `pad.list` and `pad.devices` tell what is plugged in (a test plugs pads in and out), and `pad.read` sends a sample every
// 20 ms of the values a test sets, until the page unsubscribes or the pad is unplugged (`DISCONNECTED`). It is read only,
// like the real one: nothing here touches the vehicle.
import type { Envelope } from '@pico-desktop/protocol'
import type { PadChannel, PadInfo, PadList, PadSample } from '@/generated/app'

type Outgoing = Omit<Envelope, 'v'>

/** How often a sample is sent (ms), and how many channels a pad has at the most. */
const TICK_MS = 20
const CHANNELS = 16

/** A made-up pad: what it is, and how many axes and buttons it has (the buttons follow the axes in the channels). */
export interface MockPadSpec {
  /**
   *
   */
  id: string
  /**
   *
   */
  name: string
  /**
   *
   */
  axes: number
  /**
   *
   */
  buttons: number
  /**
   *
   */
  legacyId?: string
}

/** What a test can do with the mock's pads. */
export interface MockPadsControl {
  /** Plugs a pad in (the lists are told). */
  plug: (pad: MockPadSpec) => void
  /** Unplugs it (the lists are told, and its readings end with `DISCONNECTED`). */
  unplug: (id: string) => void
  /** Sets a channel (CH1 is 1) of a pad: -1 to 1. */
  set: (id: string, channel: number, value: number) => void
  /** Whether the platform has a pad backend (default true): when it has not, no pads, and a read ends with `UNSUPPORTED`. */
  supported: (is: boolean) => void
  /** Makes a pad one that this user may not open (`PERMISSION_DENIED`), or lets them. */
  deny: (id: string, denied: boolean) => void
  /** How many pads are being read now. */
  reading: () => number
  /** The backend ends a read by itself: with this code. */
  end: (id: string, code: string) => void
}

/** A pad that is plugged in. */
interface Plugged {
  spec: MockPadSpec
  values: number[]
  denied: boolean
}

/** A subscription to `pad.read`. */
interface Reading {
  s: number
  id: string
  seq: number
  timer: ReturnType<typeof setInterval>
}

/**
 * The channels a pad's axes are.
 *
 * @param count how many axes
 * @returns CH1 and on
 */
function axisChannels(count: number): PadChannel[] {
  return Array.from({ length: Math.min(count, CHANNELS) }, (_, i) => (
    { n: i + 1, from: 'axis' as const, code: i, min: 0, max: 2047, flat: 127 }
  ))
}

/**
 * What the contract says of a pad.
 *
 * @param spec the pad
 * @returns its channels: the axes, then the buttons, at most 16
 */
function infoOf(spec: MockPadSpec): PadInfo {
  const axes = axisChannels(spec.axes)
  const buttons = Array.from({ length: Math.min(spec.buttons, CHANNELS - axes.length) }, (_, j) => (
    { n: axes.length + j + 1, from: 'button' as const, code: 0x130 + j }
  ))

  return {
    id: spec.id,
    legacyId: spec.legacyId ?? spec.name,
    name: spec.name,
    vendor: 0x1209,
    product: 0x4f54,
    source: 'fake',
    channels: [...axes, ...buttons],
  }
}

/** The pads of the mock. */
export class MockPads {
  private plugged: Plugged[] = []
  private supported = true
  private devices = new Set<number>()
  private readings: Reading[] = []

  /**
   * Makes it.
   *
   * @param send how the mock sends to the page
   */
  constructor(private readonly send: (e: Outgoing) => void) {}

  /**
   * What a test does.
   *
   * @returns the controls
   */
  control(): MockPadsControl {
    return {
      plug: spec => this.plug(spec),
      unplug: id => this.unplug(id),
      set: (id, channel, value) => this.set(id, channel, value),
      supported: is => {
        this.supported = is
        this.changed()
      },
      deny: (id, denied) => this.deny(id, denied),
      reading: () => this.readings.length,
      end: (id, code) => this.endRead(id, code),
    }
  }

  /**
   * The list, as the contract says it.
   *
   * @returns it
   */
  private list(): PadList {
    const there = this.supported ? this.plugged : []

    return {
      supported: this.supported,
      pads: there.filter(p => !p.denied).map(p => infoOf(p.spec)),
      denied: there.filter(p => p.denied).map(p => ({ id: p.spec.id, name: p.spec.name, code: 'PERMISSION_DENIED' })),
    }
  }

  /**
   * `pad.list`.
   *
   * @param ok answers the call
   */
  listPads(ok: (p: PadList) => void): void {
    ok(this.list())
  }

  /**
   * A subscription to `pad.devices`: the list at once, and again whenever it changes.
   *
   * @param e the request
   */
  subscribeDevices(e: Envelope): void {
    const s = e.id!
    this.send({ k: 'response', id: s, s })
    this.devices.add(s)
    this.send({ k: 'event', n: 'pad.devices', s, p: this.list() })
  }

  /**
   * A subscription to `pad.read`: refused, as the real one does, with the code as the subscription's error.
   *
   * @param e the request
   */
  subscribeRead(e: Envelope): void {
    const s = e.id!
    const id = (e.p as { id?: string } | null)?.id
    this.send({ k: 'response', id: s, s })
    const refusal = this.refusal(id)
    if (refusal !== null) {
      this.send({ k: 'unsubscribe', s, err: { code: refusal, message: 'refused' } })

      return
    }
    const timer = setInterval(() => this.tick(s), TICK_MS)
    this.readings.push({ s, id: id!, seq: 0, timer })
  }

  /**
   * Why a read may not begin, or null.
   *
   * @param id the pad asked for
   * @returns the code
   */
  private refusal(id: string | undefined): string | null {
    const pad = this.plugged.find(p => p.spec.id === id)
    const checks: [boolean, string][] = [
      [id === undefined, 'INVALID_VALUE'],
      [!this.supported, 'UNSUPPORTED'],
      [pad === undefined, 'NOT_FOUND'],
      [pad?.denied === true, 'PERMISSION_DENIED'],
    ]

    return checks.find(([failed]) => failed)?.[1] ?? null
  }

  /**
   * One sample of a read.
   *
   * @param s the subscription
   */
  private tick(s: number): void {
    const reading = this.readings.find(r => r.s === s)
    const pad = this.plugged.find(p => p.spec.id === reading?.id)
    if (reading === undefined || pad === undefined) {
      return
    }
    const have = Math.min(pad.spec.axes + pad.spec.buttons, CHANNELS)
    const sample: PadSample = {
      seq: reading.seq,
      at: Math.round(performance.now()),
      channels: pad.values.map((v, i) => (i < have ? v : 0)),
      have: (1 << have) - 1,
    }
    reading.seq += 1
    this.send({ k: 'event', n: 'pad.read', s, p: sample })
  }

  /**
   * Plugs a pad in.
   *
   * @param spec the pad
   */
  private plug(spec: MockPadSpec): void {
    const values = new Array<number>(CHANNELS).fill(0)
    this.plugged = [...this.plugged.filter(p => p.spec.id !== spec.id), { spec, values, denied: false }]
    this.changed()
  }

  /**
   * Unplugs a pad: its readings end.
   *
   * @param id the pad
   */
  private unplug(id: string): void {
    this.plugged = this.plugged.filter(p => p.spec.id !== id)
    this.endRead(id, 'DISCONNECTED')
    this.changed()
  }

  /**
   * Makes a pad one that may not be opened, or lets it.
   *
   * @param id the pad
   * @param denied whether it is denied
   */
  private deny(id: string, denied: boolean): void {
    const pad = this.plugged.find(p => p.spec.id === id)
    if (pad) {
      pad.denied = denied
      this.changed()
    }
  }

  /**
   * Sets a channel.
   *
   * @param id the pad
   * @param channel CH1 is 1
   * @param value -1 to 1
   */
  private set(id: string, channel: number, value: number): void {
    const pad = this.plugged.find(p => p.spec.id === id)
    if (pad && channel >= 1 && channel <= CHANNELS) {
      pad.values[channel - 1] = value
    }
  }

  /**
   * Ends the reads of a pad.
   *
   * @param id the pad
   * @param code why
   */
  private endRead(id: string, code: string): void {
    for (const reading of this.readings.filter(r => r.id === id)) {
      clearInterval(reading.timer)
      this.send({ k: 'unsubscribe', s: reading.s, err: { code, message: code } })
    }
    this.readings = this.readings.filter(r => r.id !== id)
  }

  /** The list changed: every `pad.devices` subscription is told. */
  private changed(): void {
    for (const s of this.devices) {
      this.send({ k: 'event', n: 'pad.devices', s, p: this.list() })
    }
  }

  /**
   * The page unsubscribed.
   *
   * @param s the subscription
   */
  unsubscribe(s: number): void {
    this.devices.delete(s)

    for (const reading of this.readings.filter(r => r.s === s)) {
      clearInterval(reading.timer)
    }
    this.readings = this.readings.filter(r => r.s !== s)
  }

  /** The mock restarts: nothing is subscribed. */
  reset(): void {
    for (const reading of this.readings) {
      clearInterval(reading.timer)
    }
    this.readings = []
    this.devices.clear()
  }
}
