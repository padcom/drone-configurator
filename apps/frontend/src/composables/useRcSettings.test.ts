import { afterEach, describe, expect, it } from 'vitest'
import { mockBackend } from '@/mock/mock-backend'
import { RC_ALLOW_KEY, profileKey, serialiseProfile } from '@/lib/rc/store'
import { suggestedProfile } from '@/lib/rc/suggest'
import { createConfigurator } from './useConfigurator'
import { forgetRcAllowChoice, useRcSettings } from './useRcSettings'

afterEach(() => {
  forgetRcAllowChoice()
})

/**
 * A Configurator whose settings hold what is given.
 *
 * @param ui the settings entries
 * @returns the Configurator
 */
async function rig(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await handle.settings.load()

  return handle
}

describe('whether RC control is allowed', () => {
  it('is off by default, on only when the settings say on, and kept when it is changed', async () => {
    const handle = await rig()
    const setting = useRcSettings()

    expect(setting.allowed.value).toBe(false)
    await setting.allow(true)
    expect(setting.allowed.value).toBe(true)
    expect(handle.settings.uiValue(RC_ALLOW_KEY)).toBe('on')
    await setting.allow(false)
    expect(setting.allowed.value).toBe(false)
    expect(handle.settings.uiValue(RC_ALLOW_KEY)).toBe('off')
  })

  it('is what the settings hold at the start', async () => {
    await rig([{ key: RC_ALLOW_KEY, value: 'on' }])

    expect(useRcSettings().allowed.value).toBe(true)
  })
})

describe('the mapping of a device', () => {
  it('is kept in the settings by device, and read back as it was kept', async () => {
    const handle = await rig()
    const setting = useRcSettings()
    const mine = { ...suggestedProfile('pad one', null), calibrated: true }

    expect(setting.profileOf('pad one')).toBeNull()
    await setting.save(mine)

    expect(setting.profileOf('pad one')).toEqual(mine)
    expect(setting.profileOf('pad two')).toBeNull()
    expect(handle.settings.uiValue(profileKey('pad one'))).toBe(serialiseProfile(mine))
  })

  it('is nothing when what the settings hold is not a whole mapping of that device', async () => {
    const half = '{"version":1,"device":"pad one","calibrated":true,"rows":[{"kind":"stick"}]}'

    await rig([{ key: profileKey('pad one'), value: half }])

    expect(useRcSettings().profileOf('pad one')).toBeNull()
  })
})
