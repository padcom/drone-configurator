// A command context for tests: the vehicle's facts are plain values to set, and everything a command does to the outside (a
// navigation, a confirmation, a toast, a reboot) is recorded, so that a test can say what was asked and how often.
import type { CommandContext, ParameterFacts, ParameterWork, RebootResult, VehicleFacts } from '@/lib/commands/command'
import type { Connection } from '@/generated/app'
import type { Metadata } from '@/lib/params/metadata'
import { indexFor } from '@/lib/params/paramSearch'
import type { SafetyOptions } from '@/lib/app/safety'
import type { ToastInput } from '@/composables/toasts'
import { say, sayEnglish } from '@/i18n/say'

/** What a test sets, and reads back. */
export interface Fake {
  /** The context to give to the commands. */
  ctx: CommandContext
  /** The vehicle as the commands will see it: change it between calls. */
  facts: {
    connection: Connection
    armed: boolean | undefined
    busy: ParameterWork | null
    rebootResult: RebootResult
    /** When set, `vehicle.reboot` rejects with it (the backend's refusal, or a failure). */
    rebootError?: unknown
  }
  /** The vehicle's parameters as the commands will see them: change them between calls. */
  parameters: {
    ids: string[]
    metadata: Metadata
    favourites: Set<string>
  }
  /** What the confirmation will answer. */
  answer: { confirm: boolean | (() => boolean) }
  /** Everything the commands did to the outside. */
  calls: {
    navigate: string[]
    /** One entry for each time a metadata file was asked to be opened. */
    metadata: string[]
    confirm: SafetyOptions[]
    toast: ToastInput[]
    /** One entry per call to `vehicle.reboot`: the arguments it got (always none). */
    reboot: unknown[][]
    /** The parameters shown with `parameters.reveal`. */
    reveal: string[]
  }
}

const IDENTITY = { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' }

/**
 * The vehicle of a fake: its facts are read when asked, so a test can change them between calls.
 *
 * @param fake the fake
 * @returns the facts, with a `reboot` that records
 */
function vehicleOf(fake: Fake): VehicleFacts {
  return {
    connection: () => fake.facts.connection,
    armed: () => fake.facts.armed,
    busy: () => fake.facts.busy,
    reboot: (...args: unknown[]) => {
      fake.calls.reboot.push(args)

      const { rebootError, rebootResult } = fake.facts

      return rebootError === undefined ? Promise.resolve(rebootResult) : Promise.reject(rebootError)
    },
  }
}

/**
 * The parameters of a fake: read when asked, so a test can change them between calls.
 *
 * @param fake the fake
 * @returns the facts, with a `reveal` that records
 */
function parametersOf(fake: Fake): ParameterFacts {
  let before: ReturnType<typeof indexFor> | null = null

  return {
    searchIndex: () => {
      before = indexFor(before, fake.parameters.ids, fake.parameters.metadata)

      return before
    },
    favourites: () => fake.parameters.favourites,
    describe: id => fake.parameters.metadata.get(id)?.description ?? '',
    reveal: id => void fake.calls.reveal.push(id),
  }
}

/**
 * A fake context: a connected, disarmed vehicle with no parameter work under way, unless told otherwise.
 *
 * @param facts what to change
 * @returns the context and the things to set and to read
 */
export function fakeContext(facts: Partial<Fake['facts']> = {}): Fake {
  const connection: Connection = { state: 'connected', vehicle: IDENTITY }
  const fake: Fake = {
    facts: { connection, armed: false, busy: null, rebootResult: { result: 'accepted' }, ...facts },
    parameters: { ids: [], metadata: new Map(), favourites: new Set() },
    answer: { confirm: true },
    calls: { navigate: [], metadata: [], confirm: [], toast: [], reboot: [], reveal: [] },
    ctx: {} as CommandContext,
  }
  fake.ctx = {
    files: { loadMetadata: () => void fake.calls.metadata.push('load') },
    navigate: (path: string) => Promise.resolve(void fake.calls.navigate.push(path)),
    parameters: parametersOf(fake),
    vehicle: vehicleOf(fake),
    confirm: (options: SafetyOptions) => {
      fake.calls.confirm.push(options)
      const { confirm } = fake.answer

      return Promise.resolve(typeof confirm === 'function' ? confirm() : confirm)
    },
    toast: (input: ToastInput) => void fake.calls.toast.push(input),
    say,
    sayEnglish,
  }

  return fake
}
