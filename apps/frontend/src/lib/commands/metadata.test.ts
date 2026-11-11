// "Load parameter metadata…": always available, runs the same flow as the Load metadata button (through `ctx.files`), and
// found by what it is about, in every language and in English.
import { afterEach, describe, expect, it } from 'vitest'
import { LANGUAGES, i18n, setLanguage } from '@/i18n/i18n'
import { fakeContext } from '@/testing/commandContext'
import { CommandRegistry } from './registry'
import { LoadMetadata } from './metadata'

afterEach(() => {
  setLanguage('en')
})

/**
 * A registry with the command in it.
 *
 * @returns the registry
 */
function registry(): CommandRegistry {
  const commands = new CommandRegistry()
  commands.register(new LoadMetadata())

  return commands
}

describe('the command that loads parameter metadata', () => {
  it('is available with no vehicle connected, and while armed, and while parameters are being written', () => {
    const load = new LoadMetadata()

    const fake = fakeContext({ connection: { state: 'disconnected' }, armed: true, busy: 'writing' })

    expect(load.isEnabled()).toEqual({ enabled: true })
    expect(registry().availability('metadata.load', fake.ctx)).toEqual({ enabled: true })
  })

  it('asks for the file once through the context, and leaves the focus where it was', async () => {
    const fake = fakeContext()
    const result = await registry().invoke('metadata.load', fake.ctx)

    expect(result).toEqual({ status: 'done', outcome: { focus: 'restore' } })
    expect(fake.calls.metadata).toEqual(['load'])
  })

  it.each(['metadata', 'descriptions', 'apm.pdef', 'load parameter'])('is found by "%s"', query => {
    expect(registry().search(query, fakeContext().ctx).map(command => command.id)).toEqual(['metadata.load'])
  })
})

describe('the words of the command', () => {
  it.each(LANGUAGES)('are in %s: a label, the group and the words to find it by', language => {
    const load = new LoadMetadata()
    const say = (key: string) => i18n.global.t(key, {}, { locale: language })

    expect(say(load.labelKey)).not.toBe(load.labelKey)
    expect(say(load.groupKey)).not.toBe(load.groupKey)
    expect(say(load.keywordKeys[0] as string)).toContain('apm.pdef')
  })

  it('is found by its English name in another language, and by its own', () => {
    setLanguage('de')

    expect(registry().search('metadata', fakeContext().ctx).map(command => command.id)).toEqual(['metadata.load'])
    expect(registry().search('metadaten laden', fakeContext().ctx).map(command => command.id)).toEqual(['metadata.load'])
  })
})
