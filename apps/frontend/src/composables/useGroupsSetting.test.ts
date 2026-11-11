import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockBackend } from '@/mock/mock-backend'
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
  it('is off unless the entry says on', () => {
    expect([parseGroups(undefined), parseGroups('on'), parseGroups('off'), parseGroups('x')]).toEqual([false, true, false, false])
  })
})

describe('the setting "Show parameter groups"', () => {
  it('is off by default, and is kept as on in the settings when it is turned on', async () => {
    const handle = await rig()
    const setting = useGroupsSetting()
    expect(setting.shown.value).toBe(false)

    await setting.choose(true)

    expect(setting.shown.value).toBe(true)
    expect(handle.settings.uiValue(GROUPS_KEY)).toBe('on')
    await setting.choose(false)
    expect(setting.shown.value).toBe(false)
    expect(handle.settings.uiValue(GROUPS_KEY)).toBe('off')
  })

  it('stays on for a user who had switched it on (an explicit on in the settings)', async () => {
    await rig('on')

    expect(useGroupsSetting().shown.value).toBe(true)
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

    const choosing = setting.choose(true)
    expect(setting.shown.value).toBe(true)
    answer()
    await choosing
    await flushPromises()

    // Nothing was kept (the mock does not store), so the settings still say what they said: off.
    expect(setting.shown.value).toBe(false)
  })
})
