import { describe, expect, it } from 'vitest'
import type { ParamMeta } from './metadata'
import { buildIndex, highlight, indexFor, search, tokensOf, withinOneEdit } from './paramSearch'

const META = new Map<string, ParamMeta>([
  ['RTL_ALT', {
    description: 'RTL Altitude',
    longDescription: 'The minimum alt above home the vehicle will climb to before returning. Also called the return height.',
  }],
  ['RTL_SPEED', { description: 'RTL speed', longDescription: 'Defines the speed in cm/s the aircraft keeps during a RTL.' }],
  ['BATT_CAPACITY', { description: 'Battery capacity', longDescription: 'Capacity of the battery in mAh when full' }],
  ['FENCE_ALT_MAX', { description: 'Fence Maximum Altitude', longDescription: 'Maximum altitude before the fence is breached' }],
  ['LAND_SPEED', { description: 'Land speed', longDescription: 'The descent speed for the final stage of landing in cm/s' }],
  ['SERIAL0_BAUD', {}],
])
const IDS = [...META.keys()]
const index = buildIndex(IDS, META)
const found = (query: string) => search(index, query).map(hit => hit.id)

describe('the words of a query', () => {
  it('are split at spaces and underscores, in lower case, none empty', () => {
    expect(tokensOf('  RTL_Alt  home__')).toEqual(['rtl', 'alt', 'home'])
    expect(tokensOf('   ')).toEqual([])
  })
})

describe('the search by name', () => {
  it('finds a name anywhere in it, as the search always did, and nothing for an empty query', () => {
    expect(found('capacity')).toEqual(['BATT_CAPACITY'])
    expect(found('rtl')).toEqual(['RTL_ALT', 'RTL_SPEED'])
    expect(found('')).toEqual([])
  })

  it('puts the exact name first, then the names that start with the query, then the names that have the words', () => {
    expect(found('rtl_alt')).toEqual(['RTL_ALT'])
    expect(found('alt')).toEqual(['RTL_ALT', 'FENCE_ALT_MAX'])
    expect(search(index, 'speed').map(hit => [hit.id, hit.reason])).toEqual([['RTL_SPEED', 'name'], ['LAND_SPEED', 'name']])
  })
})

describe('the search by what a parameter does', () => {
  it('finds a parameter by a word of its description, with a piece of it around the word', () => {
    const hits = search(index, 'return height')

    expect(hits.map(hit => hit.id)).toEqual(['RTL_ALT'])
    expect(hits[0]).toMatchObject({ reason: 'description' })
    // The piece is cut from the description as it is written (not in lower case).
    expect(hits[0]?.snippet).toContain('return height')
    expect(search(index, 'minimum')[0]?.snippet).toMatch(/^The minimum alt/u)
  })

  it('needs every word, in the name or in the description', () => {
    expect(found('descent landing')).toEqual(['LAND_SPEED'])
    expect(found('descent altitude')).toEqual([])
  })

  it('is by the description when the name has none of the words', () => {
    expect(found('altitude')).toEqual(['RTL_ALT', 'FENCE_ALT_MAX'])
    expect(search(index, 'fence breached').map(hit => hit.reason)).toEqual(['description'])
  })

  it('searches the names only when there are no descriptions, and looks for no typo', () => {
    const bare = buildIndex(['RTL_ALT', 'RTL_SPEED'], new Map())

    expect(bare.described).toBe(false)
    expect(search(bare, 'return height')).toEqual([])
    expect(search(bare, 'rtl_alr')).toEqual([])
    expect(search(bare, 'rtl').map(hit => hit.id)).toEqual(['RTL_ALT', 'RTL_SPEED'])
  })
})

describe('a close match', () => {
  it('is a word one edit from a word of the name or the description, and comes after the exact matches', () => {
    expect(search(index, 'batery')).toEqual([{ id: 'BATT_CAPACITY', reason: 'close' }])
    expect(found('capacty')).toEqual(['BATT_CAPACITY'])
  })

  it('is looked for only when there are fewer than five other results, and not for short words', () => {
    const six = Array.from({ length: 6 }, (_, i) => `SPEED_${i}`)
    const many = buildIndex([...six, 'SPEEED'], new Map([['SPEEED', { description: 'x' }]]))

    expect(found('lnd')).toEqual([])
    expect(search(many, 'speed').map(hit => hit.reason)).toEqual(Array.from<string>({ length: 6 }).fill('name'))
  })

  it('is one edit: a letter added, taken out or changed', () => {
    expect([withinOneEdit('battery', 'batery'), withinOneEdit('battery', 'batteery')]).toEqual([true, true])
    expect([withinOneEdit('battery', 'battary'), withinOneEdit('battery', 'battery')]).toEqual([true, true])
    expect([withinOneEdit('battery', 'bttry'), withinOneEdit('', 'a'), withinOneEdit('abc', 'axy')]).toEqual([false, true, false])
  })
})

describe('the index', () => {
  it('is kept for the same names and the same metadata, whatever the values, and made again for others', () => {
    expect(indexFor(index, [...IDS], META)).toBe(index)
    expect(indexFor(index, IDS.slice(1), META)).not.toBe(index)
    expect(indexFor(index, IDS, new Map(META))).not.toBe(index)
    expect(indexFor(null, IDS, META).entries).toHaveLength(IDS.length)
  })
})

describe('the marks', () => {
  it('cut a text into the words that were searched for and the rest, and are the text when put together', () => {
    const pieces = highlight('RTL_ALT is the Altitude', ['alt', 'rtl'])

    expect(pieces.map(piece => piece.text).join('')).toBe('RTL_ALT is the Altitude')
    expect(pieces.filter(piece => piece.match).map(piece => piece.text)).toEqual(['RTL', 'ALT', 'Alt'])
  })

  it('leave a text with no words, or an empty one, as it is, and do not take a word as a pattern', () => {
    expect(highlight('RTL_ALT', [])).toEqual([{ text: 'RTL_ALT', match: false }])
    expect(highlight('', ['a'])).toEqual([{ text: '', match: false }])
    expect(highlight('a.b', ['.']).map(piece => [piece.text, piece.match])).toEqual([['a', false], ['.', true], ['b', false]])
  })
})

describe('a long list', () => {
  const many = Array.from({ length: 1500 }, (_, i) => `GRP${i % 40}_PARAM_${i}`)
  const long = 'This parameter does something quite specific to the vehicle and its behaviour in flight, '.repeat(4).slice(0, 300)
  const metaOf = (i: number): ParamMeta => ({ description: `Short ${i}`, longDescription: `${long} no ${i}` })
  const metadata = new Map(many.map((id, i): [string, ParamMeta] => [id, metaOf(i)]))

  it('is indexed once, and searched in a few milliseconds by a letter and by ten', () => {
    const before = performance.now()
    const big = buildIndex(many, metadata)
    const built = performance.now() - before
    const time = (query: string) => {
      const start = performance.now()
      const count = search(big, query).length

      return { ms: performance.now() - start, count }
    }
    const [one, ten, miss] = [time('e'), time('specific b'), time('zzzzzzzzzz')]
    const ms = [built, one.ms, ten.ms, miss.ms].map(n => n.toFixed(1))
    console.info(`1500 parameters (ms): index ${ms[0]}; "e" ${ms[1]}; "specific b" ${ms[2]}; no match ${ms[3]}`)

    expect(one.count).toBe(1500)
    expect(Math.max(one.ms, ten.ms, miss.ms)).toBeLessThan(100)
    expect(built).toBeLessThan(100)
  })
})
