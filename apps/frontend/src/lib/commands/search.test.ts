// Finding a command by what is typed: its label and its group and its words, in the language of the page and in English.
import { afterEach, describe, expect, it } from 'vitest'
import { fold, rankCommands } from './search'
import { CommandRegistry } from './registry'
import { RebootFlightController } from './vehicle'
import { fakeContext } from '@/testing/commandContext'
import { goToScreens } from './navigation'
import { setLanguage } from '@/i18n/i18n'

afterEach(() => {
  setLanguage('en')
})

/**
 * A registry as the application will have it: the screens, then the reboot.
 *
 * @returns the registry
 */
function registry(): CommandRegistry {
  const commands = new CommandRegistry()
  goToScreens().forEach(command => commands.register(command))
  commands.register(new RebootFlightController())

  return commands
}

/**
 * The ids a query finds.
 *
 * @param query what is typed
 * @returns the ids, best first
 */
function ids(query: string): string[] {
  return registry().search(query, fakeContext().ctx).map(command => command.id)
}

describe('fold', () => {
  it('removes the case and the accents, in Latin and Cyrillic', () => {
    expect(fold('Übersicht Łódź Español')).toBe('ubersicht łodz espanol')
    expect(fold('Полёт Політ ЇЖАК Йод')).toBe('полет політ іжак иод')
  })
})

describe('an empty query', () => {
  it('lists every command in registry order: Navigate, then Vehicle', () => {
    const all = ids('')

    expect(all).toEqual([...goToScreens().map(command => command.id), 'vehicle.reboot'])
    expect(ids('   ')).toEqual(all)
  })
})

describe('a query', () => {
  it('finds a screen by the start of its label, and a word of it', () => {
    expect(ids('switch to param')).toEqual(['go.parameters'])
    expect(ids('param')).toEqual(['go.parameters'])
    expect(ids('data')).toEqual(['go.flight'])
  })

  it('finds the reboot by its label, a word of it, and the extra words', () => {
    expect(ids('rebo')).toEqual(['vehicle.reboot'])
    expect(ids('controller')).toEqual(['vehicle.reboot'])
    expect(ids('power cycle')).toEqual(['vehicle.reboot'])
  })

  it('needs every word, in any order, and the words may be split by spaces or underscores', () => {
    expect(ids('controller reboot')).toEqual(['vehicle.reboot'])
    expect(ids('flight_controller')).toEqual(['vehicle.reboot'])
    expect(ids('reboot parameters')).toEqual([])
  })

  it('finds the group: Vehicle lists the vehicle commands, Navigate the screens', () => {
    expect(ids('vehicle')).toEqual(['vehicle.reboot'])
    expect(ids('navigate')).toEqual(goToScreens().map(command => command.id))
  })

  it('ignores case, and finds nothing for what is not there', () => {
    expect(ids('REBOOT')).toEqual(['vehicle.reboot'])
    expect(ids('zzz')).toEqual([])
  })
})

describe('the order of what a query finds', () => {
  it('has a word of the label before the extra words, and registry order within a rank', () => {
    // "p" starts a word of "Plan" and of "Parameters" (in registry order), is inside a word of "Setup", and in the reboot
    // it is only in a keyword ("power").
    expect(ids('p')).toEqual(['go.plan', 'go.parameters', 'go.setup', 'vehicle.reboot'])
    expect(ids('switch to')).toEqual(goToScreens().map(command => command.id))
    expect(ids('flight')).toEqual(['go.flight', 'vehicle.reboot'])
  })
})

describe('in another language', () => {
  it('finds a command by its translated label, with the accents left out', () => {
    setLanguage('de')

    expect(ids('zu einrichtung')).toEqual(['go.setup'])
    expect(ids('neu')).toEqual(['vehicle.reboot'])
  })

  it('finds a command by its English label as well: type "reboot" in Polish', () => {
    setLanguage('pl')

    expect(ids('reboot')).toEqual(['vehicle.reboot'])
    expect(ids('uruchom')).toEqual(['vehicle.reboot'])
    expect(ids('switch to parameters')).toEqual(['go.parameters'])
  })

  it('folds Polish letters: "kontroler" and "ladowanie" style typing without the accents', () => {
    setLanguage('pl')

    expect(ids('przejdz do ekranu dane')).toEqual(['go.flight'])
  })
})

describe('in Russian and Ukrainian', () => {
  const CYRILLIC = [
    ['ru', 'полет', 'go.flight'],
    ['ru', 'перезагр', 'vehicle.reboot'],
    ['uk', 'політ', 'go.flight'],
    ['uk', 'перезавант', 'vehicle.reboot'],
  ] as const

  it.each(CYRILLIC)('finds Cyrillic: %s "%s"', (language, query, id) => {
    setLanguage(language)

    expect(ids(query)).toContain(id)
  })
})

describe('the list that is ranked', () => {
  it('is not changed by it, and is kept whole for an empty query', () => {
    expect(rankCommands(goToScreens(), '', fakeContext().ctx)).toHaveLength(goToScreens().length)
  })

  it('ranks over the list it is given, and does not change it', () => {
    const commands = goToScreens()
    const before = commands.map(command => command.id)
    rankCommands(commands, 'logs', fakeContext().ctx)

    expect(commands.map(command => command.id)).toEqual(before)
  })
})
