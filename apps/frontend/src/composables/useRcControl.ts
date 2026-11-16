// The RC control, as the whole application sees it: ONE service (made with the Configurator, so it lives across screens)
// that reads the gamepad, makes the 16 pulses of the mapping, holds the throttle back until the stick has been low (the gate),
// and sends them to the backend's `rc.control` / `rc.input`. Everything that ends the control RELEASES it (the subscription
// ends, and the backend releases the channels), turns the switch OFF, and says why; a release is never undone by itself: the
// person turns it on again, which starts with the gate shut. What ends it: the person (the switch, the indicator), the pad
// (unplugged, a late read, the window hidden: `onGap`), the link or the vehicle (lost, another one), `rc.allow` turned off, a
// mapping that was edited, the vehicle's parameters that are not known any more, the page's stop, and the backend (its own
// watchdog and refusals). Navigating between screens does not. It sends only what the read of the moment made (never an old
// frame), every 40 ms at the most.
import { type ComputedRef, type Ref, type ShallowRef, computed, getCurrentScope, onScopeDispose, shallowRef, watch } from 'vue'
import type { RcSettings } from './useRcSettings'
import { type GamepadModel, useGamepad } from './useGamepad'
import { type BackendClient, BackendError, type Subscription } from '@/backend/client'
import type { ConnectRequest, Connection, RcState } from '@/generated/app'
import { type ControlBlock, controlBlock, isSimulatorLink } from '@/lib/rc/gate'
import { channelsOf } from '@/lib/rc/mapping'
import type { Environment } from '@/lib/rc/reader'
import { type Gate, START_GATE, guard } from '@/lib/rc/safety'
import { serialiseProfile } from '@/lib/rc/store'
import type { PadSample, Profile } from '@/lib/rc/types'
import { type Facts, vehicleChannels, vehicleProblems } from '@/lib/rc/vehicle'

/** How often the sticks are sent at the most (ms): the backend sends at its own rate, and a frozen page is silent to it. */
export const SEND_MS = 40

/** Where the control is: `off`, `starting` (asked of the backend, not yet on), or `on`. */
export type RcControlState = 'off' | 'starting' | 'on'

/** What the control needs from the rest of the interface. */
export interface RcControlDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The vehicle's connection. */
  connection: Readonly<Ref<Connection>>
  /** What the connection was asked for. */
  request: Readonly<Ref<ConnectRequest | null>>
  /** The settings of the RC control (allowed, and the mapping of a device). */
  settings: RcSettings
  /** What the vehicle's parameters say of its channels, or null when they are not known. */
  facts: Readonly<Ref<Facts | null>>
  /** Says something short to the person (a toast). */
  tell: (severity: 'info' | 'warning', text: string) => void
  /** The words for a reason it ended or was refused (`rc.reason.<code>`). */
  reasonText: (code: string) => string
  /** What the pad reads (the browser's by default): a test gives its own. */
  env?: Environment
  /** Whether something else holds the vehicle (a guided flow, a calibration): then no control begins. */
  busy?: () => string | null
}

/** The RC control as refs and actions. */
export interface RcControlModel {
  /** Where it is. */
  readonly state: ShallowRef<RcControlState>
  /** Whether it is on or starting. */
  readonly active: ComputedRef<boolean>
  /** Why it last ended or was refused (a code), or null. */
  readonly why: ShallowRef<string | null>
  /** Whether the throttle is being sent (the gate is open): until then the person must lower the throttle. */
  readonly gateOpen: ShallowRef<boolean>
  /** The id of the pad that is flown with, or null. */
  readonly device: ShallowRef<string | null>
  /** What stops a control from being turned on now, before the pad and the mapping are looked at (`off`, `link`), or null. */
  readonly block: ComputedRef<Extract<ControlBlock, 'off' | 'link'> | null>
  /** Whether the person has said yes to the summary of what turning it on does, in this session. */
  readonly confirmed: ShallowRef<boolean>
  /** Turns it on (the person pressed the switch): refused with a reason when something is not as it must be. */
  enable: () => Promise<void>
  /** Turns it on after the summary has been asked once in this session (`ask` shows it): nothing when the answer is no. */
  turnOn: (ask: () => Promise<boolean>) => Promise<void>
  /** Turns it off (and releases). */
  disable: () => void
  /** Turns it off when it is on, on when it is off. */
  toggle: () => void
}

/** The RC control. */
class RcControl implements RcControlModel {
  readonly state = shallowRef<RcControlState>('off')
  readonly active = computed(() => this.state.value !== 'off')
  readonly why = shallowRef<string | null>(null)
  readonly gateOpen = shallowRef(false)
  readonly device = shallowRef<string | null>(null)
  readonly confirmed = shallowRef(false)
  readonly block = computed(() => this.blockNow())
  private readonly pad: GamepadModel
  private subscription: Subscription | undefined
  private profile: Profile | null = null
  private snapshot = ''
  private gate: Gate = START_GATE
  private seq = 0
  private sentAt = Number.NEGATIVE_INFINITY

  /**
   * Makes it.
   *
   * @param deps what it needs
   */
  constructor(private readonly deps: RcControlDeps) {
    this.pad = useGamepad({ env: deps.env, onGap: gap => this.over(`PAD_${gap.toUpperCase()}`) })
    // A read comes at once: what it says is sent now, or not at all (the watch is not left to the next tick of the page).
    watch(this.pad.reading, reading => reading.kind === 'live' && this.send(reading.sample, reading.at), { flush: 'sync' })
    this.follow()

    if (getCurrentScope() !== undefined) {
      onScopeDispose(this.disable)
    }
  }

  /** Whatever the control depends on that changes under it ends it. */
  private follow(): void {
    const { deps } = this
    const vehicle = (): string => `${deps.connection.value.vehicle?.sysid}:${deps.connection.value.vehicle?.compid}`

    watch(() => deps.settings.allowed.value, allowed => !allowed && this.over('NOT_ALLOWED'))
    watch(() => deps.connection.value.state, state => state !== 'connected' && this.over('LINK_LOST'))
    watch(vehicle, () => this.over('VEHICLE_CHANGED'))
    watch(() => isSimulatorLink(deps.request.value), simulator => !simulator && this.over('NOT_SIMULATOR'))
    watch(() => deps.facts.value, facts => (facts === null || !facts.complete) && this.over('PARAMS_UNKNOWN'))
    watch(() => this.keptMapping(), kept => kept !== this.snapshot && this.over('EDITED'))
  }

  /**
   * What stops it before the pad and the mapping are looked at: the setting, and the link.
   *
   * @returns the block, or null
   */
  private blockNow(): 'off' | 'link' | null {
    if (!this.deps.settings.allowed.value) {
      return 'off'
    }

    return isSimulatorLink(this.deps.request.value) && this.deps.connection.value.state === 'connected' ? null : 'link'
  }

  /**
   * The mapping of the pad that is flown with, as the settings keep it now ('' while none is flown with).
   *
   * @returns its text
   */
  private keptMapping(): string {
    const device = this.device.value
    const kept = device === null ? null : this.deps.settings.profileOf(device)

    return kept === null ? '' : serialiseProfile(kept)
  }

  enable = async (): Promise<void> => {
    const profile = this.state.value === 'off' ? this.prepare() : null

    if (profile !== null) {
      await this.begin(profile)
    }
  }

  /**
   * Looks at what a control needs, and says so when it cannot begin.
   *
   * @returns the mapping to fly with, or null (the reason is kept and told)
   */
  private prepare(): Profile | null {
    const found = this.look()

    if (typeof found === 'string') {
      this.pad.stop()
      this.refuse(found)

      return null
    }

    return found
  }

  /**
   * What stands in the way of a control, or the mapping that is flown with. The pad is read at once, and what is flown with is
   * what it says now.
   *
   * @returns the reason (a code), or the mapping
   */
  private look(): Profile | string {
    const refused = this.refusal()

    if (refused !== null) {
      return refused
    }
    this.pad.start()
    const profile = this.padProfile()

    return this.profileBlock(profile) ?? profile ?? 'pad'
  }

  /**
   * Why a control may not begin before the pad is read: the setting, the link, and what else holds the vehicle.
   *
   * @returns the reason (a code), or null
   */
  private refusal(): string | null {
    return this.block.value ?? this.deps.busy?.() ?? null
  }

  /**
   * The mapping of the pad that is read now, when it has one.
   *
   * @returns the mapping, or null
   */
  private padProfile(): Profile | null {
    const id = this.pad.id.value

    return id === null ? null : this.deps.settings.profileOf(id)
  }

  /**
   * Whether the mapping and the vehicle allow a control.
   *
   * @param profile the mapping, or null
   * @returns the block (a code), or null
   */
  private profileBlock(profile: Profile | null): string | null {
    return controlBlock({
      allowed: this.deps.settings.allowed.value,
      request: this.deps.request.value,
      padLive: this.pad.live.value,
      profile,
      vehicle: profile === null ? [] : vehicleProblems(this.deps.facts.value, profile),
    })
  }

  /**
   * Starts the control: the gate is shut, and the backend is asked for the subscription.
   *
   * @param profile the mapping that is flown with
   */
  private async begin(profile: Profile): Promise<void> {
    this.profile = profile
    this.snapshot = serialiseProfile(profile)
    this.device.value = profile.device
    this.gate = START_GATE
    this.gateOpen.value = false
    this.seq = 0
    this.sentAt = Number.NEGATIVE_INFINITY
    this.why.value = null
    this.state.value = 'starting'
    const subscription = this.deps.client.subscribe(
      'rc.control',
      null,
      state => this.told(state),
      ending => this.over(ending?.code ?? 'ENDED', true),
    )

    this.subscription = subscription

    try {
      await subscription.ready
    } catch (failure) {
      this.over(failure instanceof BackendError ? failure.code : 'ERROR', true)
    }
  }

  /**
   * The backend says where the control is.
   *
   * @param state what it said
   */
  private told(state: RcState): void {
    if (state.state === 'released') {
      this.over(state.why ?? 'ENDED', true)
    } else if (this.state.value === 'starting') {
      this.state.value = 'on'
    }
  }

  /**
   * The mapping and the vehicle's facts that are flown with, while the control is on.
   *
   * @returns them, or null when it is not on
   */
  private flying(): { profile: Profile, facts: Facts } | null {
    const { profile } = this
    const facts = this.deps.facts.value

    return this.state.value === 'on' && profile !== null && facts !== null ? { profile, facts } : null
  }

  /**
   * Sends what a read says: the pulses of the mapping, held by the guards. Only a read of the moment is sent (never an old one),
   * and not more often than every `SEND_MS`.
   *
   * @param sample what the pad said
   * @param at when the page read it (its clock, ms)
   */
  private send(sample: PadSample, at: number): void {
    const flying = this.flying()

    if (flying === null || at - this.sentAt < SEND_MS) {
      return
    }
    const vehicle = vehicleChannels(flying.facts)
    const guarded = guard(channelsOf(flying.profile, sample, vehicle.range), vehicle, this.gate)

    this.sentAt = at
    this.gate = guarded.gate
    this.gateOpen.value = guarded.gate.open
    this.seq += 1
    void this.push(this.seq, guarded.channels)
  }

  /**
   * Gives the backend the pulses. A frame it does not take is of a control that is over there already, and its end comes as the
   * end of the subscription: nothing is said of it here.
   *
   * @param seq the number of the frame
   * @param channels the 16 pulses
   */
  private async push(seq: number, channels: number[]): Promise<void> {
    try {
      await this.deps.client.call('rc.input', { seq, channels })
    } catch {
      // (said by the end of the subscription)
    }
  }

  /**
   * Turns it off, whichever way (once): the pad stops, the subscription ends (the backend releases the channels when it does),
   * and the person is told why unless they asked for it.
   *
   * @param why the reason (a code)
   * @param byBackend whether the backend ended it (its subscription is over already)
   */
  private over(why: string, byBackend = false): void {
    if (this.state.value === 'off') {
      return
    }
    this.pad.stop()
    this.letGo(byBackend)
    this.state.value = 'off'
    this.profile = null
    this.snapshot = ''
    this.device.value = null
    this.gate = START_GATE
    this.gateOpen.value = false
    this.why.value = why

    if (why !== 'RELEASED') {
      this.deps.tell('warning', this.deps.reasonText(why))
    }
  }

  /**
   * Ends the subscription (the backend releases the channels when it does), unless the backend ended it.
   *
   * @param byBackend whether the backend ended it
   */
  private letGo(byBackend: boolean): void {
    if (!byBackend) {
      this.subscription?.stop()
    }
    this.subscription = undefined
  }

  /**
   * A control that could not begin: the reason is kept and told.
   *
   * @param why the reason (a code)
   */
  private refuse(why: string): void {
    this.why.value = why
    this.deps.tell('warning', this.deps.reasonText(why))
  }

  turnOn = async (ask: () => Promise<boolean>): Promise<void> => {
    if (this.state.value !== 'off' || (!this.confirmed.value && !await ask())) {
      return
    }
    this.confirmed.value = true
    await this.enable()
  }

  disable = (): void => {
    this.over('RELEASED')
  }

  toggle = (): void => {
    if (this.state.value === 'off') {
      void this.enable()
    } else {
      this.disable()
    }
  }
}

/**
 * Makes the RC control. It is turned off, and released, with the scope it was made in.
 *
 * @param deps what it needs
 * @returns the model
 */
export function useRcControl(deps: RcControlDeps): RcControlModel {
  return new RcControl(deps)
}
