// The order of the palette's list: the commands run last first, then the others by their label in the language of the page;
// with a query the match ranking decides, and the same order only breaks a tie.
import { afterEach, describe, expect, it } from 'vitest'
import { fakeContext } from '@/testing/commandContext'
import { setLanguage } from '@/i18n/i18n'
import { CommandRegistry } from './registry'
import { preferred } from './search'
import { goToScreens } from './navigation'
import { RebootFlightController } from './vehicle'
import { ConnectToVehicle, DisconnectFromVehicle } from './app'
import { DownloadParameters } from './snapshots'

afterEach(() => {
  setLanguage('en')
})

/**
 * A registry with a few commands, registered in an order that is not alphabetical.
 *
 * @returns the registry
 */
function registry(): CommandRegistry {
  const commands = new CommandRegistry()
  const others = [new RebootFlightController(), new DownloadParameters(), new ConnectToVehicle(), new DisconnectFromVehicle()]

  goToScreens().slice(0, 2).forEach(command => commands.register(command))
  others.forEach(command => commands.register(command))

  return commands
}

/**
 * The ids the palette lists for a query.
 *
 * @param recent the commands run lately, the one run last first
 * @param query what is typed
 * @returns the ids in the order of the list
 */
function listed(recent: string[], query = ''): string[] {
  const fake = fakeContext({ recent })

  return registry().search(query, fake.ctx).map(command => command.id)
}

/** In English: Connect to a vehicle…, Disconnect, Download parameters, Reboot flight controller, Switch to Flight data, Plan. */
const ALPHABETICAL = ['connect.open', 'vehicle.disconnect', 'params.download', 'vehicle.reboot', 'go.flight', 'go.plan']

describe('the list with nothing typed', () => {
  it('is alphabetical by the label when nothing was run lately', () => {
    expect(listed([])).toEqual(ALPHABETICAL)
  })

  it('has the commands run last first, the newest on top, then the rest alphabetically', () => {
    expect(listed(['params.download', 'go.plan'])).toEqual([
      'params.download',
      'go.plan',
      'connect.open',
      'vehicle.disconnect',
      'vehicle.reboot',
      'go.flight',
    ])
  })

  it('ignores a remembered id that is no command any more', () => {
    expect(listed(['gone.command', 'go.plan'])[0]).toBe('go.plan')
    expect(listed(['gone.command'])).toEqual(ALPHABETICAL)
  })

  it('sorts by the label in the language that is on the page', () => {
    setLanguage('de')
    const fake = fakeContext()
    const commands = registry()
    const labels = listed([]).map(id => fake.ctx.say(commands.get(id)?.labelKey ?? ''))

    expect(labels).toEqual(labels.toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
  })
})

describe('the order by the language of the page', () => {
  it('uses the collation of the interface\'s language, not the browser\'s (Polish puts ł after l and ś after s)', () => {
    setLanguage('pl')
    const fake = fakeContext()
    const named = (id: string, label: string) => ({
      id, label, labelKey: '', groupKey: '', isEnabled: () => ({ enabled: true as const }), execute: () => ({}),
    })
    const commands = [named('a', 'Łódź'), named('b', 'Lublin'), named('c', 'Mielec')]
    const ids = (language: string) => preferred(commands, { ...fake.ctx, language: () => language }).map(command => command.id)

    // With base sensitivity "Ł" is a letter of its own after "L" in Polish, but only a variant of "L" by default.
    expect(ids('pl')).toEqual(['b', 'a', 'c'])
    expect(ids('sv')).not.toEqual(ids('pl').toReversed())
  })

  it('asks the page for its language: the context says it', () => {
    setLanguage('uk')

    expect(fakeContext().ctx.language()).toBe('uk')
  })
})

describe('a dangerous command', () => {
  it('is never boosted by having been run lately: it stays where the alphabet puts it', () => {
    expect(listed(['vehicle.reboot', 'go.plan'])).toEqual([
      'go.plan',
      'connect.open',
      'vehicle.disconnect',
      'params.download',
      'vehicle.reboot',
      'go.flight',
    ])
    expect(listed(['vehicle.reboot'])[0]).not.toBe('vehicle.reboot')
  })

  it('is flagged: the reboot', () => {
    expect(new RebootFlightController().dangerous).toBe(true)
  })
})

describe('the list with something typed', () => {
  it('keeps the match ranking: a command run last does not outrank a better match', () => {
    // "Connect to a vehicle…" starts with "connect"; "Disconnect" only contains it.
    expect(listed(['vehicle.disconnect'], 'connect').slice(0, 2)).toEqual(['connect.open', 'vehicle.disconnect'])
  })

  it('breaks a tie by the commands run last, then by the label', () => {
    // "to" is a word of "Connect to a vehicle…" and of both "Switch to …": the same rank for the three.
    expect(listed([], 'to')).toEqual(['connect.open', 'go.flight', 'go.plan'])
    expect(listed(['go.plan'], 'to')).toEqual(['go.plan', 'connect.open', 'go.flight'])
  })
})
