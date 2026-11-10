import { describe, expect, it, vi } from 'vitest'
import { FAVOURITES_KEY, MAX_FAVOURITES_CHARS, fits, parseFavourites, toggled, useFavourites } from './favourites'
import { mockBackend } from './mock-backend'
import { createConfigurator } from './useConfigurator'

describe('the favourites in the settings entry', () => {
  it('are the names of a JSON list, and none for an entry that is missing, damaged or of another kind', () => {
    expect(parseFavourites('["RTL_ALT","BATT_CAPACITY"]')).toEqual(['RTL_ALT', 'BATT_CAPACITY'])
    expect(parseFavourites(undefined)).toEqual([])
    expect(parseFavourites('{')).toEqual([])
    expect(parseFavourites('{"a":1}')).toEqual([])
    expect(parseFavourites('["A",1,null,"B"]')).toEqual(['A', 'B'])
  })

  it('take a name in, in the order they were starred, and out again', () => {
    expect(toggled(['A'], 'B')).toEqual(['A', 'B'])
    expect(toggled(['A', 'B'], 'A')).toEqual(['B'])
    expect(toggled([], 'A')).toEqual(['A'])
  })

  it('fit the entry up to what the settings take, and no more', () => {
    expect(fits(['RTL_ALT'])).toBe(true)
    const many = Array.from({ length: 4000 }, (_, i) => `PARAM_NAME_${i}`)

    expect(JSON.stringify(many).length).toBeGreaterThan(MAX_FAVOURITES_CHARS)
    expect(fits(many)).toBe(false)
  })
})

/**
 * Favourites on a Configurator whose settings are the mock's.
 *
 * @returns the favourites and the Configurator
 */
async function rig() {
  const handle = createConfigurator(mockBackend())
  await handle.settings.load()

  return { favourites: useFavourites(), handle }
}

describe('the favourites of the interface', () => {
  it('start empty, keep a star in the settings under one key, and take it away', async () => {
    const { favourites, handle } = await rig()
    expect(favourites.names.value).toEqual([])

    expect(await favourites.toggle('RTL_ALT')).toBe('kept')
    expect(await favourites.toggle('BATT_CAPACITY')).toBe('kept')

    expect(favourites.names.value).toEqual(['RTL_ALT', 'BATT_CAPACITY'])
    expect(favourites.set.value.has('RTL_ALT')).toBe(true)
    expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["RTL_ALT","BATT_CAPACITY"]')
    await favourites.toggle('RTL_ALT')
    expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["BATT_CAPACITY"]')
  })

  it('build a second toggle that comes before the settings answer on the first', async () => {
    const { favourites, handle } = await rig()

    await Promise.all([favourites.toggle('A_ONE'), favourites.toggle('B_TWO')])

    expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["A_ONE","B_TWO"]')
    expect(favourites.names.value).toEqual(['A_ONE', 'B_TWO'])
  })
})

describe('the favourites, when the settings could not keep them', () => {
  it('say so, and the star goes back to what the settings hold (the settings\' own notice says why)', async () => {
    const { favourites, handle } = await rig()
    // setUi swallows an error: nothing is kept, and nothing is thrown.
    vi.spyOn(handle.settings, 'setUi').mockResolvedValue()

    expect(await favourites.toggle('RTL_ALT')).toBe('failed')

    expect(favourites.names.value).toEqual([])
  })
})

describe('the favourites, when there is no room or there already are some', () => {
  it('refuse a star that the settings have no room for, and change nothing', async () => {
    const { favourites, handle } = await rig()
    const many = Array.from({ length: 4000 }, (_, i) => `PARAM_NAME_${i}`)
    await handle.settings.setUi(FAVOURITES_KEY, JSON.stringify(many))

    expect(await favourites.toggle('ONE_MORE')).toBe('full')

    expect(favourites.names.value).toHaveLength(4000)
    expect(favourites.set.value.has('ONE_MORE')).toBe(false)
  })

  it('keep what the settings already had, as another window or an earlier run left it', async () => {
    const settings = { version: 1, ui: [{ key: FAVOURITES_KEY, value: '["FENCE_RADIUS"]' }] }
    const handle = createConfigurator(mockBackend({ settings }))
    await handle.settings.load()

    expect(useFavourites().names.value).toEqual(['FENCE_RADIUS'])
  })
})
