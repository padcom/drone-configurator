// The mapping of the pad on the Settings screen: the mapping being edited (kept in the settings with every change), "move it",
// the one-click "Confirm this mapping" (nothing is calibrated in the app), the live reading of each row, and what stands in the
// way of turning control on. Every change of a mapping goes through `lib/rc/edits` (which takes away the confirmation), and
// nothing here talks to the vehicle: the screen only reads the pad and edits what is kept; the control itself is not turned on
// from here.
import { type ComputedRef, type Ref, computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { RcSettings } from './useRcSettings'
import type { GamepadModel } from './useGamepad'
import type { ConnectRequest } from '@/generated/app'
import { confirmed } from '@/lib/rc/confirm'
import { addRow, changeRow, removeRow, setThrottleStyle } from '@/lib/rc/edits'
import { type ControlBlock, controlBlock, sticksUnread } from '@/lib/rc/gate'
import { levelOf, rowPulse, validChannel } from '@/lib/rc/mapping'
import { type Problem, hasSource, problemsOf } from '@/lib/rc/profile'
import { type NotAtRest, type Sticks, notAtRest } from '@/lib/rc/rest'
import { lowRead } from '@/lib/rc/safety'
import { movedControl } from '@/lib/rc/source'
import type { StoredProfile } from '@/lib/rc/store'
import { freeChannel, newRow, suggestedProfile } from '@/lib/rc/suggest'
import {
  DEFAULT_RANGE,
  NOT_MINE,
  NO_SOURCE,
  type PadLayout,
  type PadSample,
  type Profile,
  type Row,
  type ThrottleStyle,
} from '@/lib/rc/types'
import { ARM_FUNCTIONS, type Facts, type VehicleProblem, vehicleChannels, vehicleProblems } from '@/lib/rc/vehicle'

/** ArduPilot's own channels for the sticks (`RCMAP_*` defaults), until the vehicle says. */
const DEFAULT_STICKS: Sticks = { roll: 1, pitch: 2, throttle: 3, yaw: 4 }

/** What the screen needs from the rest of the interface. */
export interface RcMappingDeps {
  /** The pad that is read. */
  pad: GamepadModel
  /** The settings of the RC control. */
  settings: RcSettings
  /** What the vehicle's parameters say of its channels, or null. */
  facts: Readonly<Ref<Facts | null>>
  /** What the connection was asked for. */
  request: Readonly<Ref<ConnectRequest | null>>
  /** The vehicle's flight mode (its name), or undefined when it is not known. */
  mode?: Readonly<Ref<string | undefined>>
  /**
   * Whether a vehicle is connected: a request that the page does not know (it was reloaded over a live backend) is then left to
   * the backend (`NOT_SIMULATOR`), as the Fly switch does, and the screen does not say "No simulator is connected" over it.
   */
  connected?: Readonly<Ref<boolean>>
  /**
   * Where the pad is read from (`browser` or `backend`): when it changes, the pad that was shown is not the one that is read any
   * more, and what is shown is forgotten (the pad of the new source is shown when it is read).
   */
  source?: Readonly<Ref<string>>
}

/** One thing that stands in the way, with where it comes from. */
export interface Issue {
  /** The code: a mapping's (`channel`, `duplicate`, ...) or the vehicle's (`unknown`, `range`, `arm`, `zone`, `centre`). */
  code: Problem['code'] | VehicleProblem['code']
  /** The channel it is about, 0 for the mapping or the vehicle as a whole. */
  channel: number
  /** Whether it stops the control (a warning does not). */
  blocks: boolean
  /** Whether it is the mapping's or the vehicle's. */
  from: 'mapping' | 'vehicle'
}

/** What the person has been told about a change that was not made. */
export interface Refusal {
  /** `arm`: the channel arms or stops the vehicle. `taken`: another row drives it. */
  code: 'arm' | 'taken'
  /** The channel. */
  channel: number
  /** Counts the refusals: the field that showed the refused value shows the real one again. */
  serial: number
}

/** What "move it" is waiting for. */
interface Capturing {
  /** The row. */
  index: number
  /** What the pad said when it began (null until the first read). */
  baseline: PadSample | null
}

/** The mapping on the screen, as refs and actions. */
export interface RcMapping {
  /** The id of the device whose mapping is shown, or null before one was seen. */
  readonly device: Readonly<Ref<string | null>>
  /** The mapping being edited, or null. */
  readonly draft: Readonly<Ref<Profile | null>>
  /** The row that waits for a control to be moved, or null. */
  readonly capturing: ComputedRef<number | null>
  /** The change that was not made, and why. */
  readonly refusal: Readonly<Ref<Refusal | null>>
  /** What each channel of the pad is now, or null while it is not read. */
  readonly layout: ComputedRef<PadLayout | null>
  /** What stands in the way. */
  readonly issues: ComputedRef<Issue[]>
  /** Whether a row has no control yet (the mapping is wrong until it has one). */
  readonly unsourced: ComputedRef<boolean>
  /** The first thing that stops control from being turned on, or null. */
  readonly block: ComputedRef<ControlBlock | null>
  /** Whether the mapping on the screen is confirmed for the pad that is read. */
  readonly confirmed: ComputedRef<boolean>
  /** Whether "Confirm this mapping" may be pressed: the pad is read, and every row and the four control channels are right. */
  readonly canConfirm: ComputedRef<boolean>
  /** Whether the mapping on the screen was converted from the first version and has not been looked at since. */
  readonly converted: ComputedRef<boolean>
  /**
   * The channels of the vehicle's four sticks (`RCMAP_*`; ArduPilot's own 1 to 4 until the vehicle says: what the suggestion uses
   * too, and a control does not begin on a vehicle that has not said).
   */
  readonly sticks: ComputedRef<Sticks>
  /** The sticks that are not at rest now (what the control's turn-on would wait for), or null when no pad is read. */
  readonly notAtRest: ComputedRef<NotAtRest[] | null>
  /** The pulse a row makes now (µs), or null when no pad is read. */
  pulseOf: (row: Row) => number | null
  /** What a row reads now, from -1 to 1 (turned when inverted, before the zone and the curve), or null. */
  levelOf: (row: Row) => number | null
  /** Adds a row on the channel given (refused for one that arms or stops the vehicle) or else the next free one. */
  add: (channel?: number) => void
  /** Takes a row away. */
  remove: (index: number) => void
  /** Changes a row (finite numbers only). */
  change: (index: number, change: Partial<Row>) => void
  /** Moves a row to a channel (refused for one that arms or stops the vehicle). */
  setChannel: (index: number, channel: number) => void
  /** Waits for the person to move the control a row is read from. */
  capture: (index: number) => void
  /** Stops waiting. */
  cancelCapture: () => void
  /** Chooses how the throttle stick rests (the mapping is then not confirmed). */
  setStyle: (style: ThrottleStyle) => void
  /** Confirms the mapping as it is, for the pad as it is. */
  confirm: () => void
}

/** The mapping on the screen. */
class Mapping implements RcMapping {
  readonly device = shallowRef<string | null>(null)
  readonly draft = shallowRef<Profile | null>(null)
  readonly refusal = shallowRef<Refusal | null>(null)
  private readonly waiting = shallowRef<Capturing | null>(null)
  /** Whether the person has changed what is shown (a suggestion that was not touched follows the vehicle). */
  private touched = false
  /** Whether what is shown was converted from the first version and has not been confirmed since. */
  private readonly convertedFrom = shallowRef(false)

  readonly capturing = computed(() => this.waiting.value?.index ?? null)
  readonly layout = computed((): PadLayout | null => {
    const reading = this.deps.pad.reading.value

    return reading.kind === 'live' ? reading.layout : null
  })

  readonly issues = computed((): Issue[] => this.issuesOf())
  readonly unsourced = computed(() => (this.draft.value?.rows ?? []).some(row => !hasSource(row)))
  readonly block = computed((): ControlBlock | null => this.blockOf())
  readonly confirmed = computed(() => this.issues.value.every(issue => issue.code !== 'unconfirmed'))
  readonly canConfirm = computed(() => this.canConfirmNow())
  readonly converted = computed(() => this.convertedFrom.value && !this.confirmed.value)
  readonly sticks = computed((): Sticks => this.deps.facts.value?.map ?? DEFAULT_STICKS)
  readonly notAtRest = computed((): NotAtRest[] | null => this.restOf())

  /**
   * Makes it.
   *
   * @param deps what it needs
   */
  constructor(private readonly deps: RcMappingDeps) {
    const stops = [
      // (both at once, not at the next tick of the page: a read is for the pad it came from)
      watch(deps.pad.id, id => this.seen(id), { immediate: true, flush: 'sync' }),
      watch(deps.pad.reading, reading => {
        if (reading.kind === 'live') {
          // (a pad is shown by every read of it, not only by a change of its id: after the source changed and changed back
          // between two reads, the id of the pad never changed, and nothing else would show it)
          this.seen(reading.id)
          this.feedCapture(reading.sample)
        }
      }, { flush: 'sync' }),
      watch(deps.facts, () => this.suggestAgain()),
      watch(() => deps.source?.value, () => this.forget(), { flush: 'sync' }),
    ]

    onScopeDispose(() => stops.forEach(stop => stop()))
  }

  /**
   * The source of the pad changed: what was shown is forgotten (the reading of the old source is a pad of the old source, even
   * until the next read). The pad of the new source is shown when it is read: its id is then a change.
   */
  private forget(): void {
    this.device.value = null
    this.draft.value = null
    this.waiting.value = null
    this.refusal.value = null
    this.convertedFrom.value = false
    this.touched = false
  }

  /**
   * A pad was seen: its mapping is shown (what the settings keep, or the suggestion).
   *
   * @param id the pad's id, or null when none is read
   */
  private seen(id: string | null): void {
    if (id === null || id === this.device.value) {
      return
    }

    this.show(id, this.deps.settings.profileOf(id, this.layout.value, this.deps.pad.legacyId.value))
  }

  /**
   * Shows the mapping of a pad.
   *
   * @param id the pad's id
   * @param kept what the settings keep of it, or null for none (the suggestion is shown)
   */
  private show(id: string, kept: StoredProfile | null): void {
    this.device.value = id
    this.waiting.value = null
    this.refusal.value = null
    this.draft.value = kept === null ? suggestedProfile(id, this.deps.facts.value) : kept.profile
    this.convertedFrom.value = kept !== null && kept.converted
    this.touched = kept !== null
  }

  /** What the vehicle says came or changed: a suggestion nobody touched follows it. */
  private suggestAgain(): void {
    const id = this.device.value

    if (id !== null && !this.touched) {
      this.draft.value = suggestedProfile(id, this.deps.facts.value)
    }
  }

  /**
   * "Move it" is fed a read: the first is the baseline, and the channel that moves from it is the row's source.
   *
   * @param sample what the pad said
   */
  private feedCapture(sample: PadSample): void {
    const waiting = this.waiting.value

    if (waiting === null || !this.hasRow(waiting.index)) {
      return
    }
    if (waiting.baseline === null) {
      waiting.baseline = sample
    } else {
      this.lookFor(waiting.index, waiting.baseline, sample)
    }
  }

  /**
   * Whether the mapping has a row in a place.
   *
   * @param index the place
   * @returns true when it has
   */
  private hasRow(index: number): boolean {
    return this.draft.value?.rows[index] !== undefined
  }

  /**
   * "Move it" compares a read with the baseline: the pad channel that moved is the row's source from now on.
   *
   * @param index the row's place
   * @param baseline what the pad said when the capture began
   * @param sample what it says now
   */
  private lookFor(index: number, baseline: PadSample, sample: PadSample): void {
    const moved = movedControl(baseline, sample)

    if (moved !== null) {
      this.waiting.value = null
      this.change(index, { source: moved })
    }
  }

  /**
   * Keeps a mapping that was edited: shown at once, and kept in the settings.
   *
   * @param next the mapping
   */
  private keep(next: Profile): void {
    this.touched = true
    this.draft.value = next
    void this.deps.settings.save(next)
  }

  /**
   * The range of a channel, for the pulses.
   *
   * @param channel the channel
   * @returns its range
   */
  private rangeOf(channel: number) {
    const facts = this.deps.facts.value

    return facts === null ? DEFAULT_RANGE : vehicleChannels(facts).range(channel)
  }

  pulseOf = (row: Row): number | null => {
    const reading = this.deps.pad.reading.value

    return reading.kind === 'live' ? rowPulse(row, reading.sample, this.rangeOf(row.channel)) : null
  }

  levelOf = (row: Row): number | null => {
    const reading = this.deps.pad.reading.value

    return reading.kind === 'live' ? levelOf(row, reading.sample) : null
  }

  add = (on?: number): void => {
    const draft = this.draft.value

    if (draft !== null) {
      this.addOn(draft, on ?? freeChannel(draft, this.deps.facts.value))
    }
  }

  /**
   * Adds a row on a channel, when it may be there.
   *
   * @param draft the mapping
   * @param channel the channel, or null when there is none to take
   */
  private addOn(draft: Profile, channel: number | null): void {
    if (channel !== null && this.mayTake(draft, channel)) {
      this.refusal.value = null
      // (a new row has NO source: until the person has moved the one they mean it makes nothing, and the mapping is wrong. It
      // must never follow some control it was given by default: a function of the vehicle on its channel would fire with it)
      this.keep(addRow(draft, newRow(channel, NO_SOURCE)))
      this.capture(draft.rows.length)
    }
  }

  /**
   * Whether a row may be added on a channel: it is a channel, no row drives it, and the vehicle does not arm or stop with it (the
   * person is told when it does).
   *
   * @param draft the mapping
   * @param channel the channel
   * @returns true when it may
   */
  private mayTake(draft: Profile, channel: number): boolean {
    if (!validChannel(channel) || draft.rows.some(row => row.channel === channel)) {
      return false
    }
    if (this.arms(channel)) {
      this.refusal.value = { code: 'arm', channel, serial: this.refusals() + 1 }

      return false
    }

    return true
  }

  remove = (index: number): void => {
    const draft = this.draft.value

    if (draft !== null) {
      this.waiting.value = null
      this.keep(removeRow(draft, index))
    }
  }

  change = (index: number, change: Partial<Row>): void => {
    const draft = this.draft.value

    // (a number that is not a number would be kept as nothing: the mapping would be lost at the next start)
    if (draft !== null && Object.values(change).every(value => typeof value !== 'number' || Number.isFinite(value))) {
      this.keep(changeRow(draft, index, change))
    }
  }

  setChannel = (index: number, channel: number): void => {
    if (!validChannel(channel)) {
      return
    }
    const refused = this.channelRefusal(index, channel)

    if (refused === null) {
      this.refusal.value = null
      this.change(index, { channel })
    } else {
      this.refusal.value = { code: refused, channel, serial: this.refusals() + 1 }
    }
  }

  /**
   * Why a row may not move to a channel: the vehicle arms or stops with it, or another row drives it.
   *
   * @param index the row's place
   * @param channel the channel
   * @returns the reason, or null
   */
  private channelRefusal(index: number, channel: number): 'arm' | 'taken' | null {
    if (this.arms(channel)) {
      return 'arm'
    }

    return this.draft.value?.rows.some((row, place) => place !== index && row.channel === channel) === true ? 'taken' : null
  }

  /**
   * How many refusals the screen has told of (the last one's number).
   *
   * @returns the count
   */
  private refusals(): number {
    return this.refusal.value?.serial ?? 0
  }

  /**
   * Whether the vehicle arms or stops with a channel.
   *
   * @param channel the channel
   * @returns true when it does
   */
  private arms(channel: number): boolean {
    return ARM_FUNCTIONS.includes(this.deps.facts.value?.options[channel - 1] ?? 0)
  }

  capture = (index: number): void => {
    this.waiting.value = { index, baseline: null }
  }

  cancelCapture = (): void => {
    this.waiting.value = null
  }

  setStyle = (style: ThrottleStyle): void => {
    const draft = this.draft.value

    if (draft !== null && draft.throttleStyle !== style) {
      this.keep(setThrottleStyle(draft, style))
    }
  }

  confirm = (): void => {
    const draft = this.draft.value
    const layout = this.layout.value

    if (draft !== null && layout !== null && this.canConfirm.value) {
      this.convertedFrom.value = false
      this.keep(confirmed(draft, layout))
    }
  }

  /**
   * Whether "Confirm this mapping" may be pressed: the pad is read and every row and the four control channels are right (the
   * only thing that is not right yet is the confirmation itself).
   *
   * @returns true when it may
   */
  private canConfirmNow(): boolean {
    const draft = this.draft.value
    const layout = this.layout.value

    return draft !== null && layout !== null && this.deps.pad.live.value && this.confirmable(draft, layout)
  }

  /**
   * Whether a mapping is right for a pad but for its confirmation: no problem of its rows, every stick of the vehicle on an axis.
   *
   * @param draft the mapping
   * @param layout what each channel of the pad is
   * @returns true when it is
   */
  private confirmable(draft: Profile, layout: PadLayout): boolean {
    const others = problemsOf(draft, layout).filter(problem => problem.code !== 'unconfirmed')

    return others.length === 0 && !sticksUnread(draft, layout, this.sticks.value)
  }

  /**
   * What the four sticks do now: which are not at rest.
   *
   * @returns the sticks, or null when the pad is not read or the mapping is not there
   */
  private restOf(): NotAtRest[] | null {
    const reading = this.deps.pad.reading.value
    const draft = this.draft.value

    return reading.kind === 'live' && draft !== null ? this.restFor(draft, reading.sample) : null
  }

  /**
   * The sticks that are not at rest in a read of the pad.
   *
   * @param draft the mapping
   * @param sample what the pad said
   * @returns the sticks
   */
  private restFor(draft: Profile, sample: PadSample): NotAtRest[] {
    const sticks = this.sticks.value
    const throttle = draft.rows.find(row => row.channel === sticks.throttle)
    const range = this.rangeOf(sticks.throttle)
    const pulse = throttle === undefined ? NOT_MINE : rowPulse(throttle, sample, range)
    const zone = this.deps.facts.value?.zones[sticks.throttle - 1] ?? 0

    return notAtRest(draft, sample, sticks, lowRead(pulse, range, zone))
  }

  /**
   * What stands in the way: the mapping's problems, and what the vehicle says of it.
   *
   * @returns the issues
   */
  private issuesOf(): Issue[] {
    const draft = this.draft.value

    if (draft === null) {
      return []
    }
    const own = problemsOf(draft, this.layout.value).map(problem => ({ ...problem, blocks: true, from: 'mapping' as const }))
    const theirs = vehicleProblems(this.deps.facts.value, draft).map(problem => ({ ...problem, from: 'vehicle' as const }))

    return [...own, ...theirs]
  }

  /**
   * Whether control could be turned on, and if not what stops it first.
   *
   * @returns the block, or null
   */
  private blockOf(): ControlBlock | null {
    const draft = this.draft.value

    return controlBlock({
      allowed: this.deps.settings.allowed.value,
      request: this.deps.request.value,
      letBackendDecide: this.deps.connected?.value === true,
      padLive: this.deps.pad.live.value,
      profile: draft,
      layout: this.layout.value,
      sticks: this.sticks.value,
      mode: this.deps.mode?.value,
      vehicle: draft === null ? [] : vehicleProblems(this.deps.facts.value, draft),
    })
  }
}

/**
 * The mapping on the Settings screen. It stops following the pad with the scope it was made in.
 *
 * @param deps what it needs
 * @returns the mapping, as refs and actions
 */
export function useRcMapping(deps: RcMappingDeps): RcMapping {
  return new Mapping(deps)
}
