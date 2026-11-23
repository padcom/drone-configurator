// The palette's speed budget, for the part that is not the browser's: with 1,500 parameters loaded (and a description for each,
// as the metadata gives) every keystroke is answered in 16 ms: the commands ranked and the parameters searched, with the list the
// palette shows made. Drawing the rows is measured in the window (e2e/command-speed.e2e.ts). The numbers are real timings of this
// machine, so the budget is checked on the median and the 95th percentile of many keystrokes, not on one.
import { describe, expect, it } from 'vitest'
import { fakeContext } from '@/testing/commandContext'
import { CommandRegistry } from './registry'
import { ParameterProvider } from './parameters'
import { goToScreens } from './navigation'
import { RebootFlightController } from './vehicle'
import { ConnectToVehicle, DisconnectFromVehicle } from './app'
import { DownloadParameters } from './snapshots'

/** What a keystroke may take (ms), and how many parameters the vehicle has. */
const BUDGET_MS = 16
const PARAMETERS = 1500

/** The queries the user types, a letter at a time. */
const TYPED = ['ATC_RAT_RLL_P', 'battery capacity', 'failsafe', 'frame', 'switch to log']

/**
 * 1,500 parameter names of the kind ArduPilot has: a group, a number and a field.
 *
 * @returns the names
 */
function names(): string[] {
  const groups = ['ATC', 'BATT', 'FS', 'INS', 'RC', 'SERVO', 'SERIAL', 'COMPASS', 'EK3', 'LOG']

  const field = (i: number) => i % 7 === 0 ? 'ENABLE' : 'P'

  return Array.from({ length: PARAMETERS }, (_, i) => `${groups[i % groups.length]}${Math.floor(i / groups.length)}_${field(i)}`)
}

/**
 * The registry the palette has, with a good number of commands and the provider of the parameters.
 *
 * @returns the registry
 */
function registry(): CommandRegistry {
  const commands = new CommandRegistry()

  goToScreens().forEach(command => commands.register(command));
  [new RebootFlightController(), new DownloadParameters(), new ConnectToVehicle(), new DisconnectFromVehicle()]
    .forEach(command => commands.register(command))
  commands.register(new ParameterProvider())

  return commands
}

/**
 * How long each keystroke took to answer, for what is typed a letter at a time.
 *
 * @returns the times, in ms
 */
function keystrokes(): number[] {
  const fake = fakeContext()
  fake.parameters.ids = names()
  const meta = (id: string) => ({ description: `What ${id} does to the vehicle in flight` })
  fake.parameters.metadata = new Map(fake.parameters.ids.map(id => [id, meta(id)]))
  const commands = registry()
  // The first search builds the index of the parameters (once, as the application does when they have been downloaded).
  commands.search('ba', fake.ctx)

  return TYPED.flatMap(text => Array.from(text, (_, i) => text.slice(0, i + 1))).map(query => {
    const start = performance.now()
    commands.search(query, fake.ctx)

    return performance.now() - start
  })
}

/**
 * A percentile of some numbers.
 *
 * @param values the numbers
 * @param share between 0 and 1
 * @returns the value at that share of the sorted numbers
 */
function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
}

describe('a keystroke in the palette, with 1,500 parameters loaded', () => {
  it('is answered within the budget: the median and the 95th percentile of the keystrokes of five queries', () => {
    keystrokes()
    const times = keystrokes()

    console.info(`palette keystroke (ms) over ${times.length} keystrokes: median ${percentile(times, 0.5).toFixed(2)}, `
      + `p95 ${percentile(times, 0.95).toFixed(2)}, max ${Math.max(...times).toFixed(2)}`)
    expect(percentile(times, 0.5)).toBeLessThan(BUDGET_MS)
    expect(percentile(times, 0.95)).toBeLessThan(BUDGET_MS)
  })

  it('has that many parameters in the search: a query that matches many is cut to what the palette shows', () => {
    const fake = fakeContext()
    fake.parameters.ids = names()
    const commands = registry()

    expect(fake.parameters.ids).toHaveLength(PARAMETERS)
    expect(commands.search('ATC', fake.ctx).length).toBeLessThan(60)
    expect(commands.search('ATC', fake.ctx).some(command => command.id.startsWith('param.'))).toBe(true)
  })
})
