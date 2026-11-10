import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockBackend } from './mock-backend'
import { GROUPS_KEY, parseGroups, useGroupsSetting } from './useGroupsSetting'
import { createConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
})

/**
 * A Configurator whose settings hold what is given under the key of the setting.
 *
 * @param stored what the settings hold, if anything
 * @returns the Configurator
 */
async function rig(stored?: string) {
  const ui = stored === undefined ? [] : [{ key: GROUPS_KEY, value: stored }]
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await handle.settings.load()

  return handle
}

describe('the setting in the settings entry', () => {
  it('is on unless the entry says off', () => {
    expect([parseGroups(undefined), parseGroups('on'), parseGroups('off'), parseGroups('x')]).toEqual([true, true, false, true])
  })
})

describe('the setting "Show parameter groups"', () => {
  it('is on by default, and is kept as off in the settings when it is turned off', async () => {
    const handle = await rig()
    const setting = useGroupsSetting()
    expect(setting.shown.value).toBe(true)

    await setting.choose(false)

    expect(setting.shown.value).toBe(false)
    expect(handle.settings.uiValue(GROUPS_KEY)).toBe('off')
    await setting.choose(true)
    expect(setting.shown.value).toBe(true)
    expect(handle.settings.uiValue(GROUPS_KEY)).toBe('on')
  })
})

describe('the setting "Show parameter groups", as the settings hold it and as it is changed', () => {
  it('starts as the settings hold it', async () => {
    await rig('off')

    expect(useGroupsSetting().shown.value).toBe(false)
  })

  it('puts the scope back to All when it is turned off, and leaves it when it is turned on', async () => {
    await rig()
    const setting = useGroupsSetting()
    useParamGroup().choose('BATT')

    await setting.choose(true)
    expect(useParamGroup().chosen.value).toBe('BATT')
    await setting.choose(false)

    expect(useParamGroup().chosen.value).toBe('')
  })
})

describe('the setting "Show parameter groups", when the settings answer late', () => {
  it('shows the choice at once, and goes back to what the settings hold when they could not keep it', async () => {
    const handle = await rig()
    const setting = useGroupsSetting()
    let answer: () => void = () => undefined
    vi.spyOn(handle.settings, 'setUi').mockReturnValue(new Promise<void>(resolve => {
      answer = resolve
    }))

    const choosing = setting.choose(false)
    expect(setting.shown.value).toBe(false)
    answer()
    await choosing
    await flushPromises()

    // Nothing was kept (the mock does not store), so the settings still say on.
    expect(setting.shown.value).toBe(true)
  })
})
