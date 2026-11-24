// The search by the everyday words this project ships (#36), the order of the words, the typos and the ranks.
import { describe, expect, it } from 'vitest'
import { EVERYDAY_WORDS } from './everydayWords'
import type { ParamMeta } from './metadata'
import { buildIndex, search } from './paramSearch'

const META = new Map<string, ParamMeta>([
  ['RTL_ALT', { description: 'RTL Altitude', longDescription: 'The minimum alt above home it will climb to.' }],
  ['RTL_ALT_FINAL', { description: 'RTL Final Altitude', longDescription: 'The altitude it moves to at the end.' }],
  ['FS_THR_ENABLE', { description: 'Throttle Failsafe Enable', longDescription: 'The throttle failsafe allows you to set.' }],
  ['FS_GCS_ENABLE', { description: 'Ground Station Failsafe Enable', longDescription: 'Whether failsafe will be invoked.' }],
  ['ALT_HOLD_RTL', { description: 'Hold altitude', longDescription: 'The rtl alt of the hold.' }],
  ['MIS_ALT', { description: 'Mission height', longDescription: 'The height of the rtl for missions.' }],
  ['RTL_ALTITUDE_MAX', { description: 'Most', longDescription: 'Most.' }],
  ['RTL_SPEED', { description: 'RTL speed', longDescription: 'The speed while it comes home.' }],
])
const IDS = [...META.keys()]
const WORDS = {
  RTL_ALT: 'return height, come home altitude',
  FS_THR_ENABLE: 'radio lost, signal loss',
  LAND_SPEED: 'touchdown speed',
}
const index = buildIndex(IDS, META, WORDS)
const found = (query: string) => search(index, query).map(hit => hit.id)

describe('the everyday words', () => {
  it('find a parameter by what a pilot calls it, and say which words', () => {
    expect(found('return height')).toEqual(['RTL_ALT'])
    expect(search(index, 'radio lost')).toEqual([{ id: 'FS_THR_ENABLE', reason: 'everyday', also: 'radio lost' }])
  })

  it('may be mixed with the name and the description', () => {
    expect(found('lost throttle')).toEqual(['FS_THR_ENABLE'])
  })

  it('are found without any metadata, as the names are', () => {
    const bare = buildIndex(['RTL_ALT', 'LAND_SPEED', 'BATT_CAPACITY'], new Map(), WORDS)

    expect(search(bare, 'return height').map(hit => hit.id)).toEqual(['RTL_ALT'])
    expect(search(bare, 'touchdown').map(hit => hit.id)).toEqual(['LAND_SPEED'])
    expect(search(bare, 'capacity').map(hit => hit.id)).toEqual(['BATT_CAPACITY'])
  })

  it('leave a parameter without an entry to its name and description', () => {
    expect(found('ground station')).toEqual(['FS_GCS_ENABLE'])
  })
})

describe('the shipped everyday words', () => {
  it('are the default, with "return height" for RTL_ALT and "radio lost" for FS_THR_ENABLE', () => {
    const shipped = buildIndex(['RTL_ALT', 'RTL_ALT_M', 'FS_THR_ENABLE', 'BATT_CAPACITY'], new Map(), EVERYDAY_WORDS)

    expect(search(shipped, 'return height').map(hit => hit.id)).toEqual(['RTL_ALT', 'RTL_ALT_M'])
    expect(search(shipped, 'radio lost').map(hit => hit.id)).toEqual(['FS_THR_ENABLE'])
  })

  it('are plain words of a few phrases each, for names a vehicle has', () => {
    for (const [id, words] of Object.entries(EVERYDAY_WORDS)) {
      expect(id).toMatch(/^[A-Z][A-Z0-9_]*$/u)
      expect(words).toMatch(/^[a-z0-9 .,]+$/u)
    }
  })
})

describe('the words of a search', () => {
  it('may come in any order', () => {
    expect(found('height return')).toEqual(['RTL_ALT'])
    expect(found('lost radio')).toEqual(['FS_THR_ENABLE'])
    expect(found('enable thr fs')).toEqual(['FS_THR_ENABLE'])
  })

  it('take an underscore as a space', () => {
    expect(found('fs_thr')).toEqual(found('fs thr'))
    expect(found('return_height')).toEqual(['RTL_ALT'])
  })
})

describe('a typo', () => {
  it('of one letter, in a word longer than three letters, is a close match, also in the everyday words', () => {
    expect(search(index, 'retun height')).toEqual([{ id: 'RTL_ALT', reason: 'close' }])
    expect(search(index, 'radeo lost')).toEqual([{ id: 'FS_THR_ENABLE', reason: 'close' }])
    expect(found('throtle')).toEqual(['FS_THR_ENABLE'])
  })

  it('of two letters, or in a short word, is not', () => {
    expect(found('rteurn height')).toEqual([])
    expect(found('retrn heigt')).toEqual(['RTL_ALT'])
    expect(found('rtrn height')).toEqual([])
    expect(found('rlt')).toEqual([])
  })
})

describe('the ranks', () => {
  it('are: the exact name, a name that starts with it, all words in the name, name and description, then the description', () => {
    const ids = ['X_RTL_ALT', 'MIS_ALT', 'RTL_ALT_FINAL', 'ALT_HOLD_RTL', 'RTL_ALT', 'RTL_ALT_X']
    const ranked = buildIndex(ids, new Map([['MIS_ALT', { longDescription: 'The rtl alt.' }]]), {})
    const expected = ['RTL_ALT', 'RTL_ALT_FINAL', 'RTL_ALT_X', 'X_RTL_ALT', 'ALT_HOLD_RTL', 'MIS_ALT']

    expect(search(ranked, 'rtl alt').map(hit => hit.id)).toEqual(expected)
    const byDescription = [['RTL_ALT', 'description'], ['RTL_SPEED', 'description']]
    expect(search(index, 'home').map(hit => [hit.id, hit.reason])).toEqual(byDescription)
  })

  it('put the everyday words after the description', () => {
    expect(search(index, 'height').map(hit => [hit.id, hit.reason])).toEqual([
      ['MIS_ALT', 'description'],
      ['RTL_ALT', 'everyday'],
    ])
  })

  it('put the close matches after everything else', () => {
    const metadata = new Map([...META, ['BATT_WEIGHT', { description: 'Battery weight' }]])
    const weighed = buildIndex([...IDS, 'BATT_WEIGHT'], metadata, WORDS)

    expect(search(weighed, 'height').map(hit => [hit.id, hit.reason])).toEqual([
      ['MIS_ALT', 'description'],
      ['RTL_ALT', 'everyday'],
      ['BATT_WEIGHT', 'close'],
    ])
  })
})
