import { describe, expect, it } from 'vitest'
import { fakeContext } from '@/testing/commandContext'
import { ToggleRcControl } from './rcControl'

describe('the command that turns RC control on and off', () => {
  const command = new ToggleRcControl()

  it('is not offered while the setting is off or no simulator is connected, and says why', () => {
    const off = fakeContext({ rcBlock: 'off' })
    const link = fakeContext({ rcBlock: 'link' })

    expect(command.isEnabled(off.ctx)).toEqual({ enabled: false, reasonKey: 'rc.reason.off' })
    expect(command.isEnabled(link.ctx)).toEqual({ enabled: false, reasonKey: 'rc.reason.link' })
  })

  it('can always turn it off, whatever stands in the way of turning it on', () => {
    const on = fakeContext({ rcState: 'on', rcBlock: 'link' })

    expect(command.isEnabled(on.ctx)).toEqual({ enabled: true })
  })

  it('asks the summary and turns it on; a no leaves it off', async () => {
    const yes = fakeContext()
    const no = fakeContext()
    no.answer.confirm = false

    await command.execute(yes.ctx)
    await command.execute(no.ctx)

    expect(yes.calls.sent).toEqual(['rc on'])
    expect(yes.facts.rcState).toBe('on')
    expect(yes.calls.confirm[0]?.level).toBe('plain')
    expect(no.facts.rcState).toBeUndefined()
  })
})

describe('the command that turns RC control off', () => {
  const command = new ToggleRcControl()

  it('turns it off at once, asking nothing', async () => {
    const on = fakeContext({ rcState: 'on' })

    await command.execute(on.ctx)

    expect(on.calls.sent).toEqual(['rc off'])
    expect(on.calls.confirm).toEqual([])
  })

  it('is never the one that recent use puts first, and has no key', () => {
    expect(command.dangerous).toBe(true)
    expect('shortcut' in command).toBe(false)
  })
})
