// Going to a screen: a command for each screen of the product, made from the screens' list, with a name in every language.
import { afterEach, describe, expect, it } from 'vitest'
import { LANGUAGES, i18n, setLanguage } from '@/i18n/i18n'
import { PRODUCT_SCREENS, SCREENS, type Screen } from '@/screens/registry'
import { fakeContext } from '@/testing/commandContext'
import { goToScreens, goToSections } from './navigation'

afterEach(() => {
  setLanguage('en')
})

describe('the commands that go to a screen', () => {
  it('are one for each screen of the product, in the order of the rail, and not for the gallery', () => {
    const ids = goToScreens().map(command => command.id)

    expect(ids).toEqual(PRODUCT_SCREENS.map(screen => `go.${screen.id}`))
    expect(ids).not.toContain('go.gallery')
    expect(SCREENS.length).toBeGreaterThanOrEqual(PRODUCT_SCREENS.length)
  })

  it('are made from whatever screens they are given: a new screen needs no change here', () => {
    const load = () => Promise.reject(new Error('x'))
    const screen: Screen = { id: 'new', path: '/new', titleKey: 'screen.logs', icon: 'file', load }

    expect(goToScreens([screen]).map(command => [command.id, command.labelKey])).toEqual([['go.new', 'palette.go.new']])
  })
})

describe('what a command that goes to a screen does', () => {
  it('is always enabled, in the Navigate group, and take no confirmation', () => {
    const { ctx } = fakeContext({ connection: { state: 'disconnected' }, armed: true })

    for (const command of goToScreens()) {
      expect(command.isEnabled()).toEqual({ enabled: true })
      expect(command.groupKey).toBe('palette.group.navigate')
      expect('confirmation' in command).toBe(false)
      expect(ctx).toBeDefined()
    }
  })

  it('navigate to the path of the screen, and leave the focus to the screen', async () => {
    const fake = fakeContext()
    const plan = goToScreens().find(command => command.id === 'go.plan')

    expect(await plan?.execute(fake.ctx)).toEqual({ focus: 'main' })
    expect(fake.calls.navigate).toEqual(['/plan'])
  })
})

describe('where the focus goes after a command that goes to a screen', () => {
  it('is the place the screen names: the Parameters screen\'s search box, so that typing can start', async () => {
    const fake = fakeContext()
    const parameters = goToScreens().find(command => command.id === 'go.parameters')

    expect(await parameters?.execute(fake.ctx)).toEqual({ focus: 'params.search' })
    expect(fake.calls.navigate).toEqual(['/parameters'])
  })

  it('take the place from the screen\'s own entry, so that another screen can have one', async () => {
    const load = () => Promise.reject(new Error('x'))
    const screen: Screen = { id: 'next', path: '/next', titleKey: 'screen.logs', icon: 'file', focus: 'params.search', load }
    const fake = fakeContext()

    expect(await goToScreens([screen])[0]?.execute(fake.ctx)).toEqual({ focus: 'params.search' })
  })
})

const LOGS_PARTS = ['flights', 'replay', 'spectrum', 'vehicle', 'tools']
const TUNE_PARTS = ['rate', 'more', 'filters']
const SETUP_PARTS = [
  'home', 'frame', 'accel', 'compass', 'radio', 'motors', 'modes', 'failsafes', 'battery', 'serial', 'devices', 'info',
]

/**
 * Something made of each part of each screen that has parts, in the order of the screens.
 *
 * @param make makes it of a screen and a part
 * @returns what was made
 */
function eachPart(make: (screen: string, part: string) => string): string[] {
  const screens = [['setup', SETUP_PARTS], ['tune', TUNE_PARTS], ['logs', LOGS_PARTS]] as const

  return screens.flatMap(([screen, parts]) => parts.map(part => make(screen, part)))
}

describe('the commands that go to a part of a screen', () => {
  it('are one for each part of each screen that has parts, in order, with the address of the part', () => {
    const commands = goToSections()

    expect(commands.map(command => command.id)).toEqual(eachPart((screen, part) => `go.${screen}.${part}`))
    expect(commands.map(command => command.href)).toEqual(eachPart((screen, part) => `/${screen}/${part}`))
    expect(commands.every(command => command.groupKey === 'palette.group.navigate')).toBe(true)
    expect(commands.every(command => command.isEnabled().enabled)).toBe(true)
  })

  it('go to the part, and leave the focus to the screen', async () => {
    const fake = fakeContext()
    const vehicle = goToSections().find(command => command.id === 'go.logs.vehicle')

    expect(await vehicle?.execute(fake.ctx)).toEqual({ focus: 'main' })
    expect(fake.calls.navigate).toEqual(['/logs/vehicle'])
  })

  it('make the screen current for every part, and the part current only for its own address', () => {
    const all = [...goToScreens(), ...goToSections()]
    const active = (id: string, path: string) => all.find(command => command.id === id)?.isActive(fakeContext({ path }).ctx)

    expect([active('go.logs', '/logs/replay'), active('go.logs.replay', '/logs/replay'), active('go.parameters', '/logs/replay')])
      .toEqual([true, true, false])
    expect([active('go.logs', '/logsx'), active('go.logs.replay', '/logsx')]).toEqual([false, false])
    // A slash at the end of the address is the same address.
    expect([active('go.logs', '/logs/replay/'), active('go.logs.replay', '/logs/replay/')]).toEqual([true, true])
  })
})

describe('the commands that go to a part, made and named', () => {
  it('are made from the parts the screens are given', () => {
    const load = () => Promise.reject(new Error('x'))
    const screen: Screen = {
      id: 'new',
      path: '/new',
      titleKey: 'screen.logs',
      icon: 'file',
      sections: [{ id: 'a', path: 'a', titleKey: 'logs.section.tools', load }],
      load,
    }

    expect(goToSections([screen]).map(command => [command.id, command.labelKey])).toEqual([['go.new.a', 'palette.section.new.a']])
  })

  it.each(LANGUAGES)('have one whole message each in %s, naming the screen and the part', language => {
    for (const command of goToSections()) {
      const text = i18n.global.t(command.labelKey, {}, { locale: language })
      const [, screen = '', part = ''] = command.id.split('.')
      const name = i18n.global.t(`${screen}.section.${part}`, {}, { locale: language })

      expect([text !== command.labelKey, text.includes(name)], `${language} ${command.id}`).toEqual([true, true])
    }
  })
})

describe('the names of the commands', () => {
  const keys = PRODUCT_SCREENS.map(screen => `palette.go.${screen.id}`)

  it.each(LANGUAGES)('are one whole message for each screen in %s, which is not the key', language => {
    for (const key of keys) {
      const text = i18n.global.t(key, {}, { locale: language })

      expect(text, `${language} ${key}`).not.toBe(key)
      expect(text.trim()).not.toBe('')
    }
  })

  it.each(LANGUAGES)('hold the name of the screen as the rail says it, in %s', language => {
    // "Switch to Parameters", "Przejdź do ekranu Parametry": the screen's own name is in the sentence (with an ending
    // of its own, where the language needs one, which is why the sentence is one message and not a template).
    for (const screen of PRODUCT_SCREENS) {
      const label = i18n.global.t(`palette.go.${screen.id}`, {}, { locale: language })
      const name = i18n.global.t(screen.titleKey, {}, { locale: language })

      expect(label, `${language} ${screen.id}`).toContain(name)
    }
  })

  it('are said in the language of the page', () => {
    const { ctx } = fakeContext()
    setLanguage('pl')

    expect(ctx.say('palette.go.parameters')).toBe('Przejdź do ekranu Parametry')
    expect(ctx.sayEnglish('palette.go.parameters')).toBe('Switch to Parameters')
  })
})
