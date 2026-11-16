// The RC control over a mock vehicle and a scripted pad, for the tests: what is allowed, the mapping kept for the pad, the link
// and the vehicle's facts are refs to change, and what the control said to the person is collected.
import { vi } from 'vitest'
import { computed, effectScope, shallowRef } from 'vue'
import { type BackendClient, createBackendClient } from '@/backend/client'
import { type RcControlModel, useRcControl } from '@/composables/useRcControl'
import type { RcSettings } from '@/composables/useRcSettings'
import type { ConnectRequest, Connection } from '@/generated/app'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import type { Profile } from '@/lib/rc/types'
import type { Facts } from '@/lib/rc/vehicle'
import { FakePads, TX16S } from '@/testing/fakeGamepads'
import { calibratedSuggestion, vehicleFacts } from '@/testing/rcProfiles'

/** The built-in simulator. */
export const SIMULATOR: ConnectRequest = { transport: 'simulator' }

/** A connected vehicle. */
export const CONNECTED: Connection = {
  state: 'connected',
  vehicle: { sysid: 1, compid: 1, type: 'quad', autopilot: 'ardupilot' },
}

/** A value that a test changes. */
interface Box<T> {
  /** The value. */
  value: T
}

/** What a test works with. */
export interface RcRig {
  /** The control. */
  rc: RcControlModel
  /** The scripted pads. */
  pads: FakePads
  /** What the mock vehicle counted of the control. */
  control: MockControl
  /** What the control said to the person. */
  told: string[]
  /** Whether RC control is allowed. */
  allowed: Box<boolean>
  /** The mappings kept, by device. */
  profiles: Box<Record<string, Profile>>
  /** The connection. */
  connection: Box<Connection>
  /** What the connection was asked for. */
  request: Box<ConnectRequest | null>
  /** What the vehicle says of its channels. */
  facts: Box<Facts | null>
  /** What else holds the vehicle (the control is not begun while it is a code). */
  holder: { busy: string | null }
  /** Ends the scope the control lives in. */
  stop: () => void
}

/**
 * The mappings kept at the start.
 *
 * @param profile the mapping of the pad, `null` for none, nothing for the calibrated suggestion
 * @returns the mappings by device
 */
function kept(profile: Profile | null | undefined): Record<string, Profile> {
  if (profile === null) {
    return {}
  }

  return { [TX16S]: profile ?? calibratedSuggestion(TX16S) }
}

/**
 * The settings of the RC control, over refs.
 *
 * @param allowed whether it is allowed
 * @param allowed.value whether it is
 * @param profiles the mappings kept
 * @param profiles.value the mappings by device
 * @returns the settings
 */
function settingsOver(allowed: Box<boolean>, profiles: Box<Record<string, Profile>>): RcSettings {
  return {
    allowed: computed(() => allowed.value),
    allow: on => Promise.resolve(void (allowed.value = on)),
    profileOf: device => profiles.value[device] ?? null,
    save: profile => Promise.resolve(void (profiles.value = { ...profiles.value, [profile.device]: profile })),
  }
}

/**
 * The RC control over a mock vehicle that is connected and disarmed, and a scripted pad.
 *
 * @param options what is different from the usual
 * @param options.allowed whether RC control is allowed (it is)
 * @param options.profile the mapping kept for the pad: the calibrated suggestion, or null for none
 * @param options.wrap what the control's client is made of the real one (to hold an answer back)
 * @returns what a test works with
 */
export async function rcRig(options: {
  allowed?: boolean
  profile?: Profile | null
  wrap?: (client: BackendClient) => BackendClient
} = {}): Promise<RcRig> {
  const control: MockControl = {}
  const real = createBackendClient(mockBackend({ settings: { version: 1, ui: [] }, control }))
  const client = options.wrap?.(real) ?? real

  await real.call('vehicle.connect', SIMULATOR)
  // (the vehicle is disarmed, and says so: a control is not begun on a state that is not known)
  control.armed!(false)
  // (the backend reads the throttle channel and its minimum from the vehicle: the facts below say channel 3 and 1100)
  control.rc!.throttle(3, 1100)
  const told: string[] = []
  const holder = { busy: null as string | null }
  const allowed = shallowRef(options.allowed !== false)
  const profiles = shallowRef(kept(options.profile))
  const connection = shallowRef<Connection>(CONNECTED)
  const request = shallowRef<ConnectRequest | null>(SIMULATOR)
  const facts = shallowRef<Facts | null>(vehicleFacts())
  const pads = new FakePads()
  const scope = effectScope()
  const rc = scope.run(() => useRcControl({
    client, connection, request, facts, env: pads.env(), settings: settingsOver(allowed, profiles),
    tell: (_severity, text) => told.push(text),
    reasonText: code => code,
    busy: () => holder.busy,
  }))!

  return { rc, pads, control, told, allowed, profiles, connection, request, facts, holder, stop: () => scope.stop() }
}

/** Lets what was sent reach the backend, and what it answers reach the page. */
export async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

/**
 * Lets time pass as it does for a page that runs: one read at a time, with what is sent reaching the backend (and answered)
 * between the reads.
 *
 * @param rig the rig
 * @param ms how long
 */
export async function run(rig: RcRig, ms: number): Promise<void> {
  for (let spent = 0; spent < ms; spent += 20) {
    rig.pads.advance(20)
    // eslint-disable-next-line no-await-in-loop
    await settle()
  }
}

/**
 * Brings the radio up with the throttle at the bottom, and turns the control on.
 *
 * @param rig the rig
 * @returns the rig
 */
export async function flying(rig: RcRig): Promise<RcRig> {
  rig.pads.connect(TX16S)
  rig.pads.set([0, 0, -1, 0])
  rig.pads.advance(20)
  await rig.rc.enable()
  await settle()

  return rig
}

/**
 * The throttle each frame the backend was given carried.
 *
 * @param control what the mock counted
 * @returns the pulses of the throttle channel (3), in order
 */
export function throttles(control: MockControl): number[] {
  return control.rc!.frames().map(frame => frame.channels[2]!)
}
