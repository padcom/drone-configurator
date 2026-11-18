// The RC control, as the whole application sees it: ONE service (made with the Configurator, so it lives across screens)
// that reads the gamepad, makes the 16 pulses of the mapping, sends nothing until the four sticks have been at rest (the gate),
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
import type { ConnectRequest, Connection, RcState, Telemetry } from '@/generated/app'
import { armedOf, landedOf } from '@/lib/app/armed'
import { type ControlBlock, controlBlock, isSimulatorLink } from '@/lib/rc/gate'
import { channelsOf } from '@/lib/rc/mapping'
import { continueAllowed } from '@/lib/rc/modes'
import type { Environment } from '@/lib/rc/reader'
import { type NotAtRest, REST_TIMEOUT_MS, type Sticks, notAtRest } from '@/lib/rc/rest'
import { type Gate, type Guarded, START_GATE, guard, lowRead, rudderHeld } from '@/lib/rc/safety'
import { serialiseProfile } from '@/lib/rc/store'
import { NOT_MINE, type PadLayout, type PadSample, type Profile, type ThrottleStyle, type VehicleChannels } from '@/lib/rc/types'
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
  /** The latest telemetry: whether the vehicle is armed, and whether it says it is landed. Without it the yaw is always held. */
  telemetry?: Readonly<Ref<Telemetry | null>>
  /** Says something short to the person (a toast). */
  tell: (severity: 'info' | 'warning', text: string) => void
  /** The words for a reason it ended or was refused (`rc.reason.<code>`). */
  reasonText: (code: string) => string
  /** What the pad reads (the browser's by default): a test gives its own. */
  env?: Environment
  /** Whether something else holds the vehicle (a guided flow, a calibration): then no control begins. */
  busy?: () => string | null
}

/** What a control flies with: the mapping and what the vehicle says of its channels. */
interface Flying {
  /** The mapping. */
  profile: Profile
  /** The vehicle's facts. */
  facts: Facts
}

/** The RC control as refs and actions. */
export interface RcControlModel {
  /** Where it is. */
  readonly state: ShallowRef<RcControlState>
  /** Whether it is on or starting. */
  readonly active: ComputedRef<boolean>
  /** Why it last ended or was refused (a code), or null. */
  readonly why: ShallowRef<string | null>
  /** Whether the channels are being sent (the gate is open): until then every stick must be at rest, for a moment. */
  readonly gateOpen: ShallowRef<boolean>
  /** The sticks that are not at rest while the gate is shut (what the person is told to centre), none once it is open. */
  readonly restWait: ShallowRef<NotAtRest[]>
  /** How the throttle rests in the mapping the control flew with last (null before the first control): what the summary says. */
  readonly style: ShallowRef<ThrottleStyle | null>
  /**
   * Whether the sticks may arm and disarm in this control (the rudder guard is lifted): what the setting said when it began, so
   * that turning the setting over does not change a control that flies. False while it is off.
   */
  readonly rudderLifted: ShallowRef<boolean>
  /**
   * How many frames, in this control, the stick wanted more yaw than the arming guard allowed (so it was held): the frames the
   * page's own guard held, plus those the backend did (it repeats `on` with its count when it changes). Kept after the control
   * ended; 0 when the next one begins.
   */
  readonly held: ShallowRef<number>
  /** The words for why it is off when it ended or was refused (what the toast said): kept on the screen, or null. */
  readonly explanation: ComputedRef<string | null>
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
  /** Tells that a place shows why it is off (or no longer does): while one does, a refusal is not a toast too. */
  reasonShown: (shown: boolean) => void
  /** Turns it off (and releases). */
  disable: () => void
  /** Turns it off when it is on, on when it is off. */
  toggle: () => void
}

/**
 * What the control depends on in the vehicle's facts, as text (to see that it changed): the sticks' channels, the ranges, the
 * dead zones and the functions of the channels.
 *
 * @param facts what the vehicle says, or null
 * @returns the text ('' for none)
 */
function factsKey(facts: Facts | null): string {
  return facts === null ? '' : JSON.stringify([facts.map, facts.ranges, facts.zones, facts.options, facts.complete])
}

/**
 * The throttle channel the vehicle says, and the least pulse its range says.
 *
 * @param facts what the vehicle says, or null
 * @returns them, or null when it did not say
 */
function throttleOf(facts: Facts | null): { channel: number, least: number | undefined } | null {
  if (facts === null) {
    return null
  }
  const channel = facts.map.throttle

  return { channel, least: facts.ranges[channel - 1]?.min }
}

/** The RC control. */
class RcControl implements RcControlModel {
  readonly state = shallowRef<RcControlState>('off')
  readonly active = computed(() => this.state.value !== 'off')
  readonly why = shallowRef<string | null>(null)
  readonly gateOpen = shallowRef(false)
  readonly restWait = shallowRef<NotAtRest[]>([])
  readonly style = shallowRef<ThrottleStyle | null>(null)
  // (read once, when a control begins, after allowed, a simulator and a ready mapping were checked: a change of the setting while
  // the control flies does nothing to it)
  readonly rudderLifted = shallowRef(false)
  readonly held = shallowRef(0)
  // (the frames the page's own guard held the yaw in, and those the backend did: the page's guard holds the yaw to the limit
  // before the backend sees it, so the backend alone would count nothing)
  private pageHeld = 0
  private backendHeld = 0
  readonly explanation = computed(() => this.explain())
  readonly device = shallowRef<string | null>(null)
  readonly confirmed = shallowRef(false)
  readonly block = computed(() => this.blockNow())
  private readonly pad: GamepadModel
  private subscription: Subscription | undefined
  private profile: Profile | null = null
  private snapshot = ''
  private gate: Gate = START_GATE
  /** When (the page's clock, ms) the gate began to wait for the sticks to be at rest, or null while it does not. */
  private waitedSince: number | null = null
  private seq = 0
  private sentAt = Number.NEGATIVE_INFINITY
  /** The number of the control that runs or ran last: what an older one says is ignored. */
  private run = 0
  /** Whether a frame is on its way to the backend (one at a time). */
  private pushing = false
  /** What the vehicle's facts were when the control began. */
  private facts = ''
  /** How many places show the reason the control is off (the Fly switch's line): a refusal is not a toast then. */
  private lines = 0

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
    watch(() => this.linkFits(), fits => !fits && this.over('NOT_SIMULATOR'))
    watch(() => deps.facts.value, facts => (facts === null || !facts.complete) && this.over('PARAMS_UNKNOWN'))
    // (what the vehicle says of its channels is what the throttle is held to: a change under the control ends it)
    watch(() => factsKey(deps.facts.value), key => this.facts !== '' && key !== this.facts && this.over('PARAMS_CHANGED'))
    watch(() => this.keptMapping(), kept => kept !== this.snapshot && this.over('EDITED'))
    // (a centred throttle is only flown in the modes that read it as a climb rate, or take none: any other mode releases at once)
    watch(() => deps.telemetry?.value?.mode, mode => this.modeChanged(mode))
  }

  /**
   * The vehicle's mode changed (or was heard for the first time): a centred throttle that is flying in a mode that would take its
   * middle for thrust is let go of, whatever the page asked.
   *
   * @param mode the mode's name
   */
  private modeChanged(mode: string | undefined): void {
    if (this.state.value !== 'off' && this.profile !== null && !continueAllowed(this.profile.throttleStyle === 'centred', mode)) {
      this.over('MODE')
    }
  }

  /**
   * Why it is off, in words, while it is off and something ended or refused it (the person turning it off is no reason).
   *
   * @returns the words, or null
   */
  private explain(): string | null {
    const why = this.why.value

    return this.state.value === 'off' && why !== null && why !== 'RELEASED' ? this.deps.reasonText(why) : null
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

    return this.linkFits() && this.deps.connection.value.state === 'connected' ? null : 'link'
  }

  /**
   * Whether what the connection was asked for may be a simulator: it is one, or it is not known (a page that was reloaded over a
   * live backend, or a session that came back): then the backend's `NOT_SIMULATOR` decides, and says so.
   *
   * @returns false only for a request that is known and is not a simulator
   */
  private linkFits(): boolean {
    const { request } = this.deps

    return request.value === null || isSimulatorLink(request.value)
  }

  /**
   * The mapping of the pad that is flown with, as the settings keep it now ('' while none is flown with).
   *
   * @returns its text
   */
  private keptMapping(): string {
    const device = this.device.value
    const kept = device === null ? null : this.deps.settings.profileOf(device, this.layoutNow())

    return kept === null ? '' : serialiseProfile(kept.profile)
  }

  /**
   * What each channel of the pad that is read is.
   *
   * @returns the layout, or null while the pad is not read
   */
  private layoutNow(): PadLayout | null {
    const reading = this.pad.reading.value

    return reading.kind === 'live' ? reading.layout : null
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

    return id === null ? null : this.deps.settings.profileOf(id, this.layoutNow())?.profile ?? null
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
      letBackendDecide: this.deps.connection.value.state === 'connected',
      padLive: this.pad.live.value,
      profile,
      layout: this.layoutNow(),
      sticks: this.sticksNow(),
      mode: this.modeNow(),
      vehicle: profile === null ? [] : vehicleProblems(this.deps.facts.value, profile),
    })
  }

  /**
   * The channels of the vehicle's four sticks.
   *
   * @returns them, or null when the vehicle has not said
   */
  private sticksNow(): Sticks | null {
    return this.deps.facts.value?.map ?? null
  }

  /**
   * The vehicle's flight mode, as the telemetry says it.
   *
   * @returns its name, or undefined when it is not known
   */
  private modeNow(): string | undefined {
    return this.deps.telemetry?.value?.mode
  }

  /**
   * Whether the yaw is held back from the arming gesture now: always, unless the person's option is on for this control and the
   * vehicle is disarmed, or armed and landed (the telemetry the page shows; the backend decides again from its own heartbeat).
   *
   * @returns true when it is held
   */
  private yawHeld(): boolean {
    const telemetry = this.deps.telemetry?.value ?? null

    return rudderHeld(this.rudderLifted.value, armedOf(telemetry), landedOf(telemetry))
  }

  /**
   * What a control begins with: the mapping it flies with, the gate shut, nothing counted, and a number of its own.
   *
   * @param profile the mapping that is flown with
   */
  private startFor(profile: Profile): void {
    this.profile = profile
    this.snapshot = serialiseProfile(profile)
    this.device.value = profile.device
    this.gate = START_GATE
    this.gateOpen.value = false
    this.restWait.value = []
    this.waitedSince = null
    this.style.value = profile.throttleStyle
    this.rudderLifted.value = this.deps.settings.rudderArm.value
    this.seq = 0
    this.sentAt = Number.NEGATIVE_INFINITY
    this.why.value = null
    this.resetHeld()
    this.state.value = 'starting'
    this.facts = factsKey(this.deps.facts.value)
    this.pushing = false
    this.run += 1
  }

  /**
   * Starts the control: the gate is shut, and the backend is asked for the subscription.
   *
   * @param profile the mapping that is flown with
   */
  private async begin(profile: Profile): Promise<void> {
    this.startFor(profile)
    const mine = this.run
    try {
      // (whatever goes wrong in asking for the subscription ends the control with a reason: never left starting, or off with
      // nothing said; the option goes along: the backend lifts its hold only when its own settings say so too)
      const subscription = this.deps.client.subscribe(
        'rc.control',
        { rudderArm: this.rudderLifted.value },
        state => this.told(mine, state),
        ending => this.ended(mine, ending?.code ?? 'ENDED'),
      )

      this.subscription = subscription
      await subscription.ready
    } catch (failure) {
      this.ended(mine, failure instanceof BackendError ? failure.code : 'ERROR')
    }
  }

  /**
   * The backend ended control number `mine` (or refused it). What an older control says is nothing to the one that runs now.
   *
   * @param mine the number of the control it is about
   * @param why the reason (a code)
   */
  private ended(mine: number, why: string): void {
    if (mine === this.run) {
      this.over(why, true)
    }
  }

  /**
   * The backend says where control number `mine` is.
   *
   * @param mine the number of the control it is about
   * @param state what it said
   */
  private told(mine: number, state: RcState): void {
    if (mine === this.run) {
      this.heard(state)
    }
  }

  /**
   * What the backend said of the control that runs.
   *
   * @param state what it said
   */
  private heard(state: RcState): void {
    this.countHeld(state)

    if (state.state === 'released') {
      this.over(state.why ?? 'ENDED', true)
    } else if (this.state.value === 'starting') {
      this.on(state)
    }
  }

  /**
   * Keeps the count of held yaw pulses the backend told (in `on`, again whenever it changed, and in `released`): the page that
   * turns the control off never hears `released`, and has the last count it was told.
   *
   * @param state what the backend said
   */
  private countHeld(state: RcState): void {
    this.backendHeld = state.held ?? this.backendHeld
    this.held.value = this.pageHeld + this.backendHeld
  }

  /** Begins counting held frames again (a control begins). */
  private resetHeld(): void {
    this.pageHeld = 0
    this.backendHeld = 0
    this.held.value = 0
  }

  /**
   * Counts a frame in which the page's own guard held the yaw.
   *
   * @param held whether it did
   */
  private countFrame(held: boolean): void {
    this.pageHeld += held ? 1 : 0
    this.held.value = this.pageHeld + this.backendHeld
  }

  /**
   * The backend has begun: what it says of the throttle must be what the page knows of the vehicle, else the page and the backend
   * would hold the throttle to different channels or minimums, and the control ends.
   *
   * @param state what the backend said (`on`)
   */
  private on(state: RcState): void {
    const throttle = throttleOf(this.deps.facts.value)

    if (throttle !== null && state.throttleChannel === throttle.channel && state.throttleMin === throttle.least) {
      this.state.value = 'on'
    } else {
      this.over('PARAMS_CHANGED')
    }
  }

  /**
   * The mapping and the vehicle's facts that are flown with, while the control is on.
   *
   * @returns them, or null when it is not on
   */
  private flying(): Flying | null {
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

    // (one frame is in flight at a time: a read that comes while the last is not answered is left, not queued)
    if (flying === null || this.pushing || at - this.sentAt < SEND_MS) {
      return
    }
    const { guarded, waiting } = this.frameOf(flying, sample)

    this.sentAt = at
    this.gate = guarded.gate
    this.countFrame(guarded.yawHeld)
    this.gateOpen.value = guarded.gate.open
    this.waitForRest(waiting, at)
    this.seq += 1
    void this.push(this.seq, guarded.channels)
  }

  /**
   * What a read makes of the mapping: the pulses, held by the guards, and the sticks the gate is still waiting for.
   *
   * @param flying the mapping and the vehicle's facts that are flown with
   * @param sample what the pad said
   * @returns the guarded pulses with the gate after the read, and the sticks that are not at rest (none once the gate is open)
   */
  private frameOf(flying: Flying, sample: PadSample): { guarded: Guarded, waiting: NotAtRest[] } {
    const vehicle = vehicleChannels(flying.facts)
    const pulses = channelsOf(flying.profile, sample, vehicle.range)
    const rest = this.restOf(flying, sample, vehicle, pulses)
    const guarded = guard(pulses, vehicle, this.gate, {
      holdRudder: this.yawHeld(),
      rested: rest.length === 0,
      centred: flying.profile.throttleStyle === 'centred',
    })

    return { guarded, waiting: guarded.gate.open ? [] : rest }
  }

  /**
   * Which of the four sticks are not at rest in a read (the rest check: nothing is sent until all four are, for a while).
   *
   * @param flying the mapping and the vehicle's facts that are flown with
   * @param sample what the pad said
   * @param vehicle the vehicle's channels
   * @param pulses the pulses the mapping made
   * @returns the sticks that are not
   */
  private restOf(flying: Flying, sample: PadSample, vehicle: VehicleChannels, pulses: number[]): NotAtRest[] {
    const range = vehicle.range(vehicle.throttle)
    const low = lowRead(pulses[vehicle.throttle - 1] ?? NOT_MINE, range, vehicle.throttleDeadZone ?? 0)

    return notAtRest(flying.profile, sample, flying.facts.map, low)
  }

  /**
   * Keeps what the gate waits for (what the screen says) and turns the control off when it has waited too long: a control left
   * "on, waiting" is not a control.
   *
   * @param waiting the sticks that are not at rest while the gate is shut (none once it is open)
   * @param at when the page read it (its clock, ms)
   */
  private waitForRest(waiting: NotAtRest[], at: number): void {
    this.restWait.value = waiting

    if (this.gate.open) {
      this.waitedSince = null

      return
    }
    this.waitedSince ??= at

    if (at - this.waitedSince >= REST_TIMEOUT_MS) {
      this.over('REST_TIMEOUT')
    }
  }

  /**
   * Gives the backend the pulses. A frame it does not take is of a control that is over there already, and its end comes as the
   * end of the subscription: nothing is said of it here.
   *
   * @param seq the number of the frame
   * @param channels the 16 pulses
   */
  private async push(seq: number, channels: number[]): Promise<void> {
    const mine = this.run

    this.pushing = true

    try {
      await this.deps.client.call('rc.input', { seq, channels })
    } catch {
      // (said by the end of the subscription)
    } finally {
      // (of this control only: a frame of an older one that is answered late is not the one in flight now)
      this.pushing = mine === this.run ? false : this.pushing
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
    this.facts = ''
    this.device.value = null
    this.gate = START_GATE
    this.gateOpen.value = false
    this.restWait.value = []
    this.waitedSince = null
    this.rudderLifted.value = false
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
    // (a refusal is said by the line of the Fly switch when it is on the screen; the end of a control that was flying is always a
    // toast too: it must not be missed)
    this.say(why)
  }

  /** The summary was not confirmed: the reason, while the control is off. */
  private declined(): void {
    if (this.state.value === 'off') {
      this.why.value = 'DECLINED'
    }
  }

  reasonShown = (shown: boolean): void => {
    this.lines = Math.max(0, this.lines + (shown ? 1 : -1))
  }

  /**
   * Says a reason to the person, unless the screen shows it already (the line of the Fly switch).
   *
   * @param why the reason (a code)
   */
  private say(why: string): void {
    if (this.lines === 0) {
      this.deps.tell('warning', this.deps.reasonText(why))
    }
  }

  turnOn = async (ask: () => Promise<boolean>): Promise<void> => {
    if (this.state.value !== 'off') {
      return
    }
    if (!this.confirmed.value && !await ask()) {
      // (the summary was answered no, or another question took its place: it is not turned on, and the screen says so; but not
      // when another turn-on went through meanwhile and the control is on now)
      this.declined()

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
