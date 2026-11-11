// Going to a screen: a command for each screen of the product, made from the screens' list, with a name in every language.
import { afterEach, describe, expect, it } from 'vitest'
import { LANGUAGES, i18n, setLanguage } from '@/i18n/i18n'
import { PRODUCT_SCREENS, SCREENS, type Screen } from '@/screens/registry'
import { fakeContext } from '@/testing/commandContext'
import { goToScreens } from './navigation'

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
    const parameters = goToScreens().find(command => command.id === 'go.parameters')

    expect(await parameters?.execute(fake.ctx)).toEqual({ focus: 'main' })
    expect(fake.calls.navigate).toEqual(['/parameters'])
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
