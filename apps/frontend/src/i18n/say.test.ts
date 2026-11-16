// The words that plain modules make (the question of a write, the reason a file was refused, the notice of a failed setting)
// come from the locale files in the language of the page, and follow a switch of it.
import { afterEach, describe, expect, it } from 'vitest'
import { questionFor } from '@/composables/useStaged'
import { validateDraft } from '@/lib/params/draft'
import { checkMeta, parseMetadata } from '@/lib/params/metadata'
import { notConfirmedText } from '@/lib/params/paramValue'
import { parseSnapshot } from '@/lib/params/snapshot'
import { setLanguage } from './i18n'
import { say } from './say'

afterEach(() => {
  setLanguage('en')
})

const INT8 = { id: 'FS_THR_ENABLE', index: 0, kind: 'int', type: 'INT8', value: 1 } as const

describe('a message of the interface from code', () => {
  it('is English until another language is picked, and German after', () => {
    expect(say('draft.number')).toBe('a number, please')
    setLanguage('de')
    expect(say('draft.number')).toBe('bitte eine Zahl')
    setLanguage('en')
    expect(say('draft.number')).toBe('a number, please')
  })

  it('takes the plural form of its count', () => {
    expect(say('question.write', { count: 1 }, 1)).toBe('Write 1 parameter to the vehicle?')
    expect(say('question.write', { count: 3 }, 3)).toBe('Write 3 parameters to the vehicle?')
  })
})

describe('the words of the plain modules, in German', () => {
  it('are the question of a write, with its calibration note and its lines', () => {
    setLanguage('de')
    const changes = [{ id: 'RTL_ALT', from: 1500, to: 2000 }, { id: 'COMPASS_OFS_X', from: 1, to: 2, warning: 'Test' }]

    expect(questionFor(changes).split('\n')).toEqual([
      '2 Parameter ans Fahrzeug schreiben?',
      'Enthält Kalibrierwerte',
      'RTL_ALT 1500 → 2000',
      'COMPASS_OFS_X 1 → 2 (Test)',
    ])
  })

  it('are the errors and the warnings of the Value field', () => {
    setLanguage('de')

    expect(validateDraft(INT8, 'abc')).toBe('bitte eine Zahl')
    expect(validateDraft(INT8, '200')).toBe('INT8 reicht von -128 bis 127')
    expect(validateDraft(INT8, '1,500')).toContain('Tausendergruppe')
    expect(checkMeta({ min: 200, max: 300000, units: 'cm' }, 100)).toBe('Außerhalb des üblichen Bereichs 200–300000 cm')
    expect(checkMeta({ values: { 0: 'Aus' } }, 3)).toBe('Keiner der üblichen Werte: 0 (Aus)')
  })

  it('are the reasons a file is refused, and what the vehicle read back', () => {
    setLanguage('de')

    expect(parseMetadata('[')).toBe('kein JSON')
    expect(parseMetadata('{}')).toMatch(/^keine Parameter-Metadaten-Datei/u)
    expect(parseSnapshot('{"format":"x"}')).toBe('kein Drone-Configurator-Parameter-Snapshot')
    expect(notConfirmedText(2500, 3000)).toBe('das Fahrzeug meldet 2500, nicht 3000')
  })
})
