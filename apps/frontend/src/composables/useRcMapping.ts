// The mapping of the pad on the Settings screen: the mapping being edited (kept in the settings with every change), "move it",
// the calibration wizard, the live pulse of each row, and what stands in the way of turning control on. Every change of a mapping
// goes through `lib/rc/edits` (which takes away the wizard's mark), and nothing here talks to the vehicle: the screen only
// reads the pad and edits what is kept; the control itself is not turned on from here.
import { type ComputedRef, type Ref, computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { RcSettings } from './useRcSettings'
import type { GamepadModel } from './useGamepad'
import type { ConnectRequest } from '@/generated/app'
import { addRow, changeRow, removeRow } from '@/lib/rc/edits'
import { type ControlBlock, controlBlock } from '@/lib/rc/gate'
import { rowPulse, validChannel } from '@/lib/rc/mapping'
import { type Problem, hasSource, problemsOf } from '@/lib/rc/profile'
import { movedControl } from '@/lib/rc/source'
import { freeChannel, newButton, newStick, newSwitch, suggestedProfile } from '@/lib/rc/suggest'
import { DEFAULT_RANGE, NO_SOURCE, type PadSample, type Profile, type Row } from '@/lib/rc/types'
import { ARM_FUNCTIONS, type Facts, type VehicleProblem, vehicleChannels, vehicleProblems } from '@/lib/rc/vehicle'
import { Wizard } from '@/lib/rc/wizard'

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
}

/** One thing that stands in the way, with where it comes from. */
export interface Issue {
  /** The code: a mapping's (`channel`, `duplicate`, ...) or the vehicle's (`unknown`, `range`, `arm`, `zone`). */
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

/** The wizard as the screen shows it. */
export interface WizardView {
  /** Where it is. */
  step: 'rest' | 'move'
  /** Whether the first step has enough reads to go on. */
  ready: boolean
  /** How far each stick's axis has travelled so far (raw, of 2 for a whole axis). */
  axes: { axis: number, travel: number }[]
  /** The axes that did not make it the last time it was asked to finish. */
  failed: number[]
}

/** What "move it" is waiting for. */
interface Capturing {
  /** The row. */
  index: number
  /** What the pad said when it began (null until the first read). */
  baseline: PadSample | null
}

/** A kind of row that can be added. */
export type NewRow = Row['kind']

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
  /** The wizard, or null when it is not running. */
  readonly wizard: ComputedRef<WizardView | null>
  /** What stands in the way. */
  readonly issues: ComputedRef<Issue[]>
  /** Whether a row has no control yet (the wizard waits for it, and the mapping is wrong until it has one). */
  readonly unsourced: ComputedRef<boolean>
  /** The first thing that stops control from being turned on, or null. */
  readonly block: ComputedRef<ControlBlock | null>
  /** The pulse a row makes now (µs), or null when no pad is read. */
  pulseOf: (row: Row) => number | null
  /** Adds a row of a kind, on the channel given (refused for one that arms or stops the vehicle) or else the next free one. */
  add: (kind: NewRow, channel?: number) => void
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
  /** Begins the wizard. */
  startWizard: () => void
  /** Goes to its second step. */
  nextStep: () => void
  /** Puts what it measured into the mapping. */
  finishWizard: () => void
  /** Stops it. */
  cancelWizard: () => void
}

/** The mapping on the screen. */
class Mapping implements RcMapping {
  readonly device = shallowRef<string | null>(null)
  readonly draft = shallowRef<Profile | null>(null)
  readonly refusal = shallowRef<Refusal | null>(null)
  private readonly waiting = shallowRef<Capturing | null>(null)
  private readonly running = shallowRef<Wizard | null>(null)
  private readonly lacking = shallowRef<number[]>([])
  /** Counts the reads the wizard was given (what it measures is not reactive). */
  private readonly reads = shallowRef(0)
  /** Whether the person has changed what is shown (a suggestion that was not touched follows the vehicle). */
  private touched = false

  readonly capturing = computed(() => this.waiting.value?.index ?? null)
  readonly wizard = computed((): WizardView | null => this.viewOfWizard())
  readonly issues = computed((): Issue[] => this.issuesOf())
  readonly unsourced = computed(() => (this.draft.value?.rows ?? []).some(row => !hasSource(row)))
  readonly block = computed((): ControlBlock | null => this.blockOf())

  /**
   * Makes it.
   *
   * @param deps what it needs
   */
  constructor(private readonly deps: RcMappingDeps) {
    const stops = [
      // (both at once, not at the next tick of the page: the wizard must not miss a read, and a read is for the pad it came from)
      watch(deps.pad.id, id => this.seen(id), { immediate: true, flush: 'sync' }),
      watch(deps.pad.reading, reading => {
        if (reading.kind === 'live') {
          this.read(reading.sample)
        }
      }, { flush: 'sync' }),
      watch(deps.facts, () => this.suggestAgain()),
    ]

    onScopeDispose(() => stops.forEach(stop => stop()))
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
    const kept = this.deps.settings.profileOf(id)

    this.device.value = id
    this.waiting.value = null
    this.running.value = null
    this.refusal.value = null
    this.draft.value = kept ?? suggestedProfile(id, this.deps.facts.value)
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
   * A read of the pad: "move it" and the wizard are fed.
   *
   * @param sample what the pad said
   */
  private read(sample: PadSample): void {
    this.feedCapture(sample)
    const wizard = this.running.value

    if (wizard !== null) {
      wizard.feed(sample)
      this.reads.value += 1
    }
  }

  /**
   * "Move it" is fed a read: the first is the baseline, and the control that moves from it is the row's source.
   *
   * @param sample what the pad said
   */
  private feedCapture(sample: PadSample): void {
    const waiting = this.waiting.value
    const row = this.rowWaiting()

    if (waiting === null || row === undefined) {
      return
    }
    if (waiting.baseline === null) {
      waiting.baseline = sample
    } else {
      this.found(waiting.index, row, movedControl(row.kind, waiting.baseline, sample))
    }
  }

  /**
   * The row that "move it" waits for.
   *
   * @returns the row, or undefined when nothing waits (or the row is gone)
   */
  private rowWaiting(): Row | undefined {
    const waiting = this.waiting.value

    return waiting === null ? undefined : this.draft.value?.rows[waiting.index]
  }

  /**
   * "Move it" found what was moved (or has not yet): the row is read from it from now on.
   *
   * @param index the row's place
   * @param row the row
   * @param control the axis or button that moved, or null
   */
  private found(index: number, row: Row, control: number | null): void {
    if (control !== null) {
      this.waiting.value = null
      this.change(index, row.kind === 'button' ? { button: control } : { axis: control })
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
   * The channels of the vehicle, for the pulses.
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

  add = (kind: NewRow, on?: number): void => {
    const draft = this.editable()

    if (draft !== null) {
      this.addOn(draft, kind, on ?? freeChannel(draft, this.deps.facts.value))
    }
  }

  /**
   * Adds a row on a channel, when it may be there.
   *
   * @param draft the mapping
   * @param kind the kind of row
   * @param channel the channel, or null when there is none to take
   */
  private addOn(draft: Profile, kind: NewRow, channel: number | null): void {
    if (channel !== null && this.mayTake(draft, channel)) {
      this.refusal.value = null
      // (a new row has NO control: until the person has moved the one they mean it makes nothing, and the mapping is wrong. It
      // must never follow some control it was given by default: a function of the vehicle on its channel would fire with it)
      this.keep(addRow(draft, { stick: newStick, switch: newSwitch, button: newButton }[kind](channel, NO_SOURCE)))
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

  /**
   * The mapping, when it may be edited (there is one, and the wizard is not running).
   *
   * @returns the mapping, or null
   */
  private editable(): Profile | null {
    return this.running.value === null ? this.draft.value : null
  }

  remove = (index: number): void => {
    const draft = this.editable()

    if (draft !== null) {
      this.waiting.value = null
      this.keep(removeRow(draft, index))
    }
  }

  change = (index: number, change: Partial<Row>): void => {
    const draft = this.editable()

    // (a number that is not a number would be kept as nothing: the mapping would be lost at the next start)
    if (draft !== null && Object.values(change).flat().every(value => typeof value !== 'number' || Number.isFinite(value))) {
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
    if (this.running.value === null) {
      this.waiting.value = { index, baseline: null }
    }
  }

  cancelCapture = (): void => {
    this.waiting.value = null
  }

  startWizard = (): void => {
    if (this.draft.value !== null && this.deps.pad.live.value && !this.unsourced.value) {
      this.waiting.value = null
      this.lacking.value = []
      this.running.value = new Wizard(this.throttleChannel())
    }
  }

  /**
   * The vehicle's throttle channel (`RCMAP_THROTTLE`), or null when the vehicle has not said.
   *
   * @returns the channel, or null
   */
  private throttleChannel(): number | null {
    return this.deps.facts.value?.map.throttle ?? null
  }

  nextStep = (): void => {
    this.running.value?.toMove()
    this.reads.value += 1
  }

  finishWizard = (): void => {
    const wizard = this.running.value
    const draft = this.draft.value

    if (wizard === null || draft === null) {
      return
    }
    const result = wizard.finish(draft)

    if ('rows' in result) {
      this.running.value = null
      this.keep(result)
    } else {
      this.lacking.value = result.axes
    }
    this.reads.value += 1
  }

  cancelWizard = (): void => {
    this.running.value = null
    this.lacking.value = []
  }

  /**
   * The wizard as the screen shows it.
   *
   * @returns the view, or null when it is not running
   */
  private viewOfWizard(): WizardView | null {
    const wizard = this.running.value

    // (what the wizard measured is not reactive: the count of reads says it changed)
    void this.reads.value

    return wizard === null ? null : this.viewOf(wizard)
  }

  /**
   * What a wizard that runs shows.
   *
   * @param wizard the wizard
   * @returns the view
   */
  private viewOf(wizard: Wizard): WizardView {
    const sticks = (this.draft.value?.rows ?? []).filter(row => row.kind === 'stick')

    return {
      step: wizard.step,
      ready: wizard.step === 'move' || wizard.restDone(),
      axes: sticks.map(row => ({ axis: row.axis, travel: wizard.travel(row.axis) })),
      failed: this.lacking.value,
    }
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
    const own = problemsOf(draft).map(problem => ({ ...problem, blocks: true, from: 'mapping' as const }))
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
      padLive: this.deps.pad.live.value,
      profile: draft,
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
