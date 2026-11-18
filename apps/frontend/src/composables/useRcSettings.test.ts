import { afterEach, describe, expect, it } from 'vitest'
import { mockBackend } from '@/mock/mock-backend'
import { RC_ALLOW_KEY, RC_RUDDER_ARM_KEY, profileKey, serialiseProfile } from '@/lib/rc/store'
import { confirmed } from '@/lib/rc/confirm'
import { suggestedProfile } from '@/lib/rc/suggest'
import { TX16S_LAYOUT } from '@/testing/rcProfiles'
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

describe('whether the sticks may arm and disarm: what the settings say', () => {
  it('is off by default, on only when the settings say exactly on, and kept when it is changed', async () => {
    const handle = await rig([{ key: RC_ALLOW_KEY, value: 'on' }])
    const setting = useRcSettings()

    expect(setting.rudderArm.value).toBe(false)
    await setting.setRudderArm(true)
    expect(setting.rudderArm.value).toBe(true)
    expect(handle.settings.uiValue(RC_RUDDER_ARM_KEY)).toBe('on')
    await setting.setRudderArm(false)
    expect(setting.rudderArm.value).toBe(false)
    expect(handle.settings.uiValue(RC_RUDDER_ARM_KEY)).toBe('off')
  })

  it.each(['ON', 'true', '1', 'yes', ' on', 'off', ''])('does not take %j for on (not trusted)', async text => {
    await rig([{ key: RC_ALLOW_KEY, value: 'on' }, { key: RC_RUDDER_ARM_KEY, value: text }])

    expect(useRcSettings().rudderArm.value).toBe(false)
  })
})

describe('whether the sticks may arm and disarm: Allow, and a file edited by hand', () => {
  it('is what the settings hold when RC control is allowed, and off, and left as it is, when it is not', async () => {
    const allowed = await rig([{ key: RC_ALLOW_KEY, value: 'on' }, { key: RC_RUDDER_ARM_KEY, value: 'on' }])

    expect(useRcSettings().rudderArm.value).toBe(true)
    const edited = await rig([{ key: RC_RUDDER_ARM_KEY, value: 'on' }])

    expect(useRcSettings().allowed.value).toBe(false)
    expect(useRcSettings().rudderArm.value).toBe(false)
    expect(edited.settings.uiValue(RC_RUDDER_ARM_KEY)).toBe('on')
    expect(allowed.settings.uiValue(RC_ALLOW_KEY)).toBe('on')
  })

  it('does not outlive Allow: turning Allow off turns it off, and Allow on again starts with the hold in place', async () => {
    const handle = await rig()
    const setting = useRcSettings()

    await setting.allow(true)
    await setting.setRudderArm(true)
    expect(setting.rudderArm.value).toBe(true)
    await setting.allow(false)
    expect([setting.allowed.value, setting.rudderArm.value]).toEqual([false, false])
    expect(handle.settings.uiValue(RC_RUDDER_ARM_KEY)).toBe('off')
    await setting.allow(true)
    expect(setting.rudderArm.value).toBe(false)
  })
})

describe('whether the sticks may arm and disarm: Allow turned off without it', () => {
  it('leaves the entry alone when Allow is turned off and it was not on', async () => {
    const handle = await rig()
    const setting = useRcSettings()

    await setting.allow(true)
    await setting.allow(false)
    expect(handle.settings.uiValue(RC_RUDDER_ARM_KEY)).toBeUndefined()
  })
})

describe('the mapping of a device', () => {
  it('is kept in the settings by device, and read back as it was kept', async () => {
    const handle = await rig()
    const setting = useRcSettings()
    const mine = confirmed(suggestedProfile('pad one', null), TX16S_LAYOUT)

    expect(setting.profileOf('pad one', null)).toBeNull()
    await setting.save(mine)

    expect(setting.profileOf('pad one', null)).toEqual({ profile: mine, converted: false, lossy: false })
    expect(setting.profileOf('pad two', null)).toBeNull()
    expect(handle.settings.uiValue(profileKey('pad one'))).toBe(serialiseProfile(mine))
  })

  it('is nothing when what the settings hold is not a whole mapping of that device', async () => {
    const half = '{"version":2,"device":"pad one","throttleStyle":"low","confirmedKey":null,"rows":[{"channel":1}]}'

    await rig([{ key: profileKey('pad one'), value: half }])

    expect(useRcSettings().profileOf('pad one', null)).toBeNull()
  })
})

describe('the mapping of a device of the first version', () => {
  it('is converted when the pad is read when the pad is read, and needs the pad to do it', async () => {
    const calibration = { min: -1, center: 0, max: 1 }
    const row = { kind: 'stick', channel: 1, axis: 0, invert: false, calibration, deadZone: 0.08, expo: 0 }
    const old = JSON.stringify({ version: 1, device: 'pad one', calibrated: true, rows: [row] })

    await rig([{ key: profileKey('pad one'), value: old }])

    expect(useRcSettings().profileOf('pad one', null)).toBeNull()
    expect(useRcSettings().profileOf('pad one', TX16S_LAYOUT)?.converted).toBe(true)
  })
})
