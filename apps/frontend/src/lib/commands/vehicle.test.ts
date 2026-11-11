// The reboot of the flight controller: when it may run, what it asks first, and that it sends nothing but the request.
import { afterEach, describe, expect, it } from 'vitest'
import { CommandRegistry } from './registry'
import { RebootFlightController } from './vehicle'
import { fakeContext } from '@/testing/commandContext'
import { setLanguage } from '@/i18n/i18n'

afterEach(() => {
  setLanguage('en')
})

const reboot = new RebootFlightController()

describe('when the reboot may run', () => {
  it('is enabled for a connected vehicle that is not armed, with no parameter work', () => {
    expect(reboot.isEnabled(fakeContext().ctx)).toEqual({ enabled: true })
  })

  it.each([
    ['disconnected', 'palette.reason.notConnected'],
    ['connecting', 'palette.reason.notConnected'],
    ['lost', 'palette.reason.notConnected'],
    ['reconnecting', 'palette.reason.notConnected'],
  ] as const)('is disabled while the connection is %s', (state, reasonKey) => {
    const { ctx } = fakeContext({ connection: { state } })

    expect(reboot.isEnabled(ctx)).toEqual({ enabled: false, reasonKey })
  })
})

describe('when the reboot may not run: armed, unknown, busy', () => {
  it('is disabled while the vehicle is armed', () => {
    expect(reboot.isEnabled(fakeContext({ armed: true }).ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.armed' })
  })

  it('is disabled when it is not known whether the vehicle is armed (no recent heartbeat): unknown counts as armed', () => {
    expect(reboot.isEnabled(fakeContext({ armed: undefined }).ctx))
      .toEqual({ enabled: false, reasonKey: 'palette.reason.stateUnknown' })
  })

  it.each(['writing', 'downloading'] as const)('is disabled while the parameters are being %s', busy => {
    expect(reboot.isEnabled(fakeContext({ busy }).ctx)).toEqual({ enabled: false, reasonKey: `palette.reason.${busy}` })
  })

  it('says the first reason that applies: not connected before armed before busy', () => {
    const { ctx } = fakeContext({ connection: { state: 'lost' }, armed: true, busy: 'writing' })

    expect(reboot.isEnabled(ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.notConnected' })
  })
})

describe('what the reboot asks before it runs', () => {
  it('is a hold, in the warning tone, that names the vehicle and says what happens', () => {
    const question = reboot.confirmation(fakeContext().ctx)
    const words = { title: 'Reboot flight controller', confirmLabel: 'Hold to reboot' }

    expect(question).toMatchObject({ level: 'hold', tone: 'warn', ...words })
    expect(question.vehicle).toBe('QUADROTOR · ARDUPILOTMEGA · system 1/1')
    expect(question.what).toContain('Parameters are not changed')
  })

  it('is in the language of the page', () => {
    setLanguage('de')

    expect(reboot.confirmation(fakeContext().ctx))
      .toMatchObject({ title: 'Flugcontroller neu starten', confirmLabel: 'Zum Neustart halten' })
  })

  it('names no vehicle when none is known', () => {
    expect(reboot.confirmation(fakeContext({ connection: { state: 'disconnected' } }).ctx).vehicle).toBe('')
  })
})

describe('what the reboot does', () => {
  it('asks the vehicle once, with no arguments at all: the force value of ArduPilot is never passed', async () => {
    const fake = fakeContext()
    const outcome = await reboot.execute(fake.ctx)

    expect(fake.calls.reboot).toEqual([[]])
    expect(outcome).toEqual({ focus: 'restore', reboot: { result: 'accepted' } })
  })

  it('hands back what the vehicle said when it refuses', async () => {
    const fake = fakeContext({ rebootResult: { result: 'refused', detail: 'no' } })

    expect((await reboot.execute(fake.ctx)).reboot).toEqual({ result: 'refused', detail: 'no' })
  })
})

/**
 * A registry with the reboot in it.
 *
 * @returns the registry
 */
function registry(): CommandRegistry {
  const commands = new CommandRegistry()
  commands.register(new RebootFlightController())

  return commands
}

describe('the reboot run by the registry', () => {
  it('reboots once after the hold is given', async () => {
    const fake = fakeContext()
    const result = await registry().invoke('vehicle.reboot', fake.ctx)

    expect(result.status).toBe('done')
    expect(fake.calls.confirm).toHaveLength(1)
    expect(fake.calls.reboot).toEqual([[]])
  })
})

describe('the reboot run by the registry: when it does not go', () => {
  it('does not reboot when the hold is not given', async () => {
    const fake = fakeContext()
    fake.answer.confirm = false

    expect((await registry().invoke('vehicle.reboot', fake.ctx)).status).toBe('cancelled')
    expect(fake.calls.reboot).toEqual([])
  })

  it('does not reboot when the vehicle armed while the question was open', async () => {
    const fake = fakeContext()
    fake.answer.confirm = () => {
      fake.facts.armed = true

      return true
    }
    const result = await registry().invoke('vehicle.reboot', fake.ctx)

    expect(result).toMatchObject({ status: 'disabled', reasonKey: 'palette.reason.armed' })
    expect(fake.calls.reboot).toEqual([])
  })

  it('does not even ask while armed', async () => {
    const fake = fakeContext({ armed: true })

    expect((await registry().invoke('vehicle.reboot', fake.ctx)).status).toBe('disabled')
    expect(fake.calls.confirm).toEqual([])
    expect(fake.calls.reboot).toEqual([])
  })
})
