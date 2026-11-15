// Arm, disarm and the flight modes as commands: when each may run, what each asks first, and that each is sent once and TOLD
// (what the vehicle answered, its own words when it refused, and why when the backend would not send it), never assumed.
import { afterEach, describe, expect, it } from 'vitest'
import { BackendError } from '@/backend/client'
import { setLanguage } from '@/i18n/i18n'
import { fakeContext } from '@/testing/commandContext'
import { CommandRegistry } from './registry'
import {
  ArmVehicle, ChangeFlightMode, DisarmVehicle, EmergencyStop, PALETTE_MODES, QUICK_MODES, ReviewBeforeArming, flightModeCommands,
} from './arming'

afterEach(() => {
  setLanguage('en')
})

const arm = new ArmVehicle()
const disarm = new DisarmVehicle()
const mode = (name: string) => new ChangeFlightMode(name)
const NOT_CONNECTED = { enabled: false, reasonKey: 'palette.reason.notConnected' }
const UNKNOWN = { enabled: false, reasonKey: 'palette.reason.stateUnknown' }

describe('when an arm may run', () => {
  it('is enabled for a connected vehicle that is known to be disarmed', () => {
    expect(arm.isEnabled(fakeContext({ armed: false }).ctx)).toEqual({ enabled: true })
  })

  it.each([
    [{ armed: true }, 'palette.reason.alreadyArmed'],
    [{ armed: undefined }, 'palette.reason.stateUnknown'],
    [{ connection: { state: 'lost' } }, 'palette.reason.notConnected'],
    [{ busy: 'writing' }, 'palette.reason.writing'],
    [{ busy: 'downloading' }, 'palette.reason.downloading'],
  ] as const)('is disabled for %j: %s', (facts, reasonKey) => {
    expect(arm.isEnabled(fakeContext(facts).ctx)).toEqual({ enabled: false, reasonKey })
  })

  it('is a command the palette never ranks by use: it is dangerous', () => {
    expect([arm.dangerous, disarm.dangerous]).toEqual([true, true])
  })
})

describe('what an arm asks first', () => {
  it('is a hold, in the warning tone, that names the vehicle and says what the vehicle does', () => {
    const question = arm.confirmation(fakeContext().ctx)

    expect(question).toMatchObject({ level: 'hold', tone: 'warn', title: 'Arm the vehicle', confirmLabel: 'Hold to arm' })
    expect(question.vehicle).toBe('QUADROTOR · ARDUPILOTMEGA · system 1/1')
    expect(question.what).toContain('pre-arm checks')
  })

  it('is never skipped and never a single press, whatever Settings say about modes', () => {
    const { ctx } = fakeContext({ modeConfirmation: 'none' })

    expect(arm.confirmation(ctx).level).toBe('hold')
    expect(disarm.confirmation(ctx).level).toBe('hold')
  })

  it('sends nothing when the hold is not held', async () => {
    const fake = fakeContext()
    fake.answer.confirm = false
    const registry = new CommandRegistry()
    registry.register(arm)

    expect(await registry.invoke('vehicle.arm', fake.ctx)).toEqual({ status: 'cancelled' })
    expect(fake.calls.sent).toEqual([])
  })
})

describe('what an arm tells', () => {
  it('sends the arm once, and tells that the vehicle accepted, not that it is armed', async () => {
    const fake = fakeContext()
    await arm.execute(fake.ctx)

    expect(fake.calls.sent).toEqual(['arm'])
    expect(fake.calls.toast).toHaveLength(1)
    expect(fake.calls.toast[0]).toMatchObject({ severity: 'info' })
    expect(fake.calls.toast[0]?.text).toBe('QUADROTOR accepted the arm. It shows armed when it reports it.')
  })

  it('tells that the vehicle refused, with its own words, the pre-arm reasons first', async () => {
    const fake = fakeContext()
    const messages = ['EKF3 IMU0 is using GPS', 'PreArm: Compasses inconsistent', 'PreArm: GPS 1: Bad fix', 'x', 'y']
    fake.facts.armingResult = { result: 'refused', code: 4, messages }
    await arm.execute(fake.ctx)

    expect(fake.calls.toast[0]).toMatchObject({ severity: 'error', long: true })
    expect(fake.calls.toast[0]?.text).toBe(
      'QUADROTOR refused to arm. PreArm: Compasses inconsistent PreArm: GPS 1: Bad fix EKF3 IMU0 is using GPS',
    )
  })
})

describe('what an arm tells when nothing answers or the backend refuses', () => {
  it('tells that nothing answered, that it may have armed, and that it is not sent again', async () => {
    const fake = fakeContext()
    fake.facts.armingResult = { result: 'no-answer', messages: [] }
    await arm.execute(fake.ctx)

    expect(fake.calls.sent).toEqual(['arm'])
    expect(fake.calls.toast[0]).toMatchObject({ severity: 'warning', long: true })
    expect(fake.calls.toast[0]?.text).toContain('It may have armed')
    expect(fake.calls.toast[0]?.text).toContain('not sent again')
  })

  it('tells why the backend would not send it (the page\'s view was late)', async () => {
    const fake = fakeContext()
    fake.facts.armingError = new BackendError('ARMED', 'the vehicle is armed')
    await arm.execute(fake.ctx)

    expect(fake.calls.toast[0]).toMatchObject({ severity: 'error', text: 'The vehicle is already armed.' })
  })

  it('does not hide a failure that is not a refusal of the backend', async () => {
    const fake = fakeContext()
    fake.facts.armingError = new Error('the link broke')

    await expect(arm.execute(fake.ctx)).rejects.toThrow('the link broke')
  })
})

describe('a disarm', () => {
  it('may run only for a connected vehicle that is known to be armed, parameter work or not', () => {
    expect(disarm.isEnabled(fakeContext({ armed: true, busy: 'writing' }).ctx)).toEqual({ enabled: true })
    expect(disarm.isEnabled(fakeContext({ armed: false }).ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.notArmed' })
    expect(disarm.isEnabled(fakeContext({ armed: undefined }).ctx)).toEqual(UNKNOWN)
    expect(disarm.isEnabled(fakeContext({ connection: { state: 'lost' } }).ctx)).toEqual(NOT_CONNECTED)
  })

  it('asks for a hold, sends the disarm once, and tells what the vehicle said', async () => {
    const fake = fakeContext({ armed: true })
    fake.facts.armingResult = { result: 'refused', code: 4, messages: ['Disarm: vehicle is flying'] }

    expect(disarm.confirmation(fake.ctx)).toMatchObject({ level: 'hold', confirmLabel: 'Hold to disarm' })
    await disarm.execute(fake.ctx)

    expect(fake.calls.sent).toEqual(['disarm'])
    expect(fake.calls.toast[0]?.text).toBe('QUADROTOR refused to disarm. Disarm: vehicle is flying')
  })
})

describe('when a change of the flight mode may run', () => {
  it('has a command for each mode of the palette, named by its id', () => {
    const ids = flightModeCommands().map(command => command.id)

    expect(ids).toEqual(PALETTE_MODES.map(name => `vehicle.mode.${name.toLowerCase()}`))
    expect(PALETTE_MODES).toHaveLength(9)
  })

  it('may run for a vehicle whose kind has the mode and is not in it', () => {
    expect(mode('AUTO').isEnabled(fakeContext({ armed: true, mode: 'LOITER' }).ctx)).toEqual({ enabled: true })
  })

  it.each([
    [{ connection: { state: 'lost' } }, 'palette.reason.notConnected'],
    [{ modes: null }, 'palette.reason.noModes'],
    [{ armed: undefined }, 'palette.reason.stateUnknown'],
  ] as const)('may not run for %j: %s', (facts, reasonKey) => {
    expect(mode('AUTO').isEnabled(fakeContext(facts).ctx)).toEqual({ enabled: false, reasonKey })
  })
})

describe('when a change of the flight mode may not run', () => {
  it('may not run for a mode the kind does not have, or the one the vehicle is in, and says which', () => {
    const { ctx } = fakeContext({ modes: { kind: 'copter', modes: [{ number: 5, name: 'LOITER' }] }, mode: 'LOITER' })
    const reasonParams = (name: string) => ({ mode: name })

    expect(mode('AUTO').isEnabled(ctx))
      .toEqual({ enabled: false, reasonKey: 'palette.reason.noSuchMode', reasonParams: reasonParams('AUTO') })
    expect(mode('LOITER').isEnabled(ctx))
      .toEqual({ enabled: false, reasonKey: 'palette.reason.alreadyInMode', reasonParams: reasonParams('LOITER') })
  })

  it('may run for RTL, Land, Loiter and Brake when the state is not known: what a person does when things go wrong', () => {
    for (const name of QUICK_MODES) {
      expect(mode(name).isEnabled(fakeContext({ armed: undefined, mode: 'AUTO' }).ctx)).toEqual({ enabled: true })
    }
  })
})

describe('what a change of the mode asks first', () => {
  it.each([
    ['a disarmed vehicle', { armed: false }],
    ['an armed vehicle, when Settings say none', { armed: true, modeConfirmation: 'none' }],
  ] as const)('is nothing for %s', (_name, facts) => {
    expect(mode('AUTO').confirmation(fakeContext(facts).ctx)).toBeNull()
  })

  it.each(['RTL', 'LAND', 'LOITER', 'BRAKE'])('is nothing for %s, whatever the vehicle is: one deliberate press', name => {
    expect(mode(name).confirmation(fakeContext({ armed: true }).ctx)).toBeNull()
    expect(mode(name).confirmation(fakeContext({ armed: undefined }).ctx)).toBeNull()
  })

  it('is a plain confirmation naming the mode, for an armed vehicle and one whose state is not known', () => {
    for (const armed of [true, undefined]) {
      const question = mode('GUIDED').confirmation(fakeContext({ armed }).ctx)
      const words = { title: 'Change the flight mode to GUIDED', confirmLabel: 'Change to GUIDED' }

      expect(question).toMatchObject({ level: 'plain', ...words })
      expect(question?.what).toContain('GUIDED')
    }
  })

  it('says that AUTO starts the mission', () => {
    expect(mode('AUTO').confirmation(fakeContext({ armed: true }).ctx)?.what).toContain('starts the mission')
  })
})

describe('what a change of the mode does', () => {
  it('sends the number the kind gives the mode, once, and tells that the vehicle accepted', async () => {
    const fake = fakeContext({ armed: true })
    await mode('RTL').execute(fake.ctx)

    expect(fake.calls.sent).toEqual(['mode 6'])
    expect(fake.calls.toast[0]?.text).toBe('QUADROTOR accepted the change. It shows the mode it reports.')
  })

  it('tells that the vehicle refused, with its words, and that nothing answered', async () => {
    const fake = fakeContext({ armed: true })
    fake.facts.armingResult = { result: 'refused', code: 4, messages: ['Mode change failed'] }
    await mode('LOITER').execute(fake.ctx)

    expect(fake.calls.toast[0]?.text).toBe('QUADROTOR refused the change of mode. Mode change failed')
    fake.facts.armingResult = { result: 'no-answer', messages: [] }
    await mode('LOITER').execute(fake.ctx)

    expect(fake.calls.toast[1]?.text).toContain('not sent again')
    expect(fake.calls.sent).toEqual(['mode 5', 'mode 5'])
  })
})

describe('what a change of the mode sends, and does not', () => {
  it('sends nothing when the kind has no such mode', async () => {
    const fake = fakeContext({ modes: { kind: 'copter', modes: [] } })
    await mode('AUTO').execute(fake.ctx)

    expect(fake.calls.sent).toEqual([])
    expect(fake.calls.toast[0]?.text).toBe('The vehicle does not have that mode.')
  })

  it('goes through the registry: the question is asked first, and a "no" sends nothing', async () => {
    const fake = fakeContext({ armed: true })
    fake.answer.confirm = false
    const registry = new CommandRegistry()
    flightModeCommands().forEach(command => registry.register(command))

    expect(await registry.invoke('vehicle.mode.auto', fake.ctx)).toEqual({ status: 'cancelled' })
    expect(fake.calls.sent).toEqual([])
    expect(fake.calls.confirm).toHaveLength(1)
    // RTL asks nothing and goes at once
    expect(await registry.invoke('vehicle.mode.rtl', fake.ctx)).toMatchObject({ status: 'done' })
    expect(fake.calls.confirm).toHaveLength(1)
    expect(fake.calls.sent).toEqual(['mode 6'])
  })
})

describe('the emergency stop', () => {
  const stop = new EmergencyStop()

  it('is never in the palette and never ranked by use: it is not listed, and it is dangerous', () => {
    expect([stop.listed, stop.dangerous]).toEqual([false, true])
    const fake = fakeContext({ armed: true })
    const registry = new CommandRegistry()
    registry.register(stop)

    expect(registry.search('', fake.ctx)).toEqual([])
    expect(registry.search('emergency stop', fake.ctx)).toEqual([])
  })

  it('may run for a connected vehicle that is armed or may be (unknown counts as armed), parameter work or not', () => {
    expect(stop.isEnabled(fakeContext({ armed: true, busy: 'writing' }).ctx)).toEqual({ enabled: true })
    expect(stop.isEnabled(fakeContext({ armed: undefined }).ctx)).toEqual({ enabled: true })
    expect(stop.isEnabled(fakeContext({ armed: false }).ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.notArmed' })
    expect(stop.isEnabled(fakeContext({ connection: { state: 'lost' } }).ctx)).toEqual(NOT_CONNECTED)
  })

  it('asks for a hold in the error tone, and says the vehicle will fall', () => {
    const question = stop.confirmation(fakeContext({ armed: true }).ctx)

    expect(question).toMatchObject({ level: 'hold', tone: 'error', title: 'Emergency stop' })
    expect(question.confirmLabel).toBe('Hold to stop the motors')
    expect(question.what).toContain('will crash')
  })
})

describe('what the emergency stop tells', () => {
  const stop = new EmergencyStop()

  it('sends the stop once, and tells that the vehicle accepted, not that it stopped', async () => {
    const fake = fakeContext({ armed: true })
    await stop.execute(fake.ctx)

    expect(fake.calls.sent).toEqual(['stop'])
    expect(fake.calls.toast[0]?.text).toBe('QUADROTOR accepted the stop. It shows disarmed when it reports it.')
  })

  it('tells that nothing answered (it was sent more than once), and that the state is what it reports', async () => {
    const fake = fakeContext({ armed: true })
    fake.facts.armingResult = { result: 'no-answer', messages: [] }
    await stop.execute(fake.ctx)

    expect(fake.calls.toast[0]).toMatchObject({ severity: 'warning', long: true })
    expect(fake.calls.toast[0]?.text).toContain('up to 3 times')
  })

  it('goes through the registry: a "no" to the hold sends nothing', async () => {
    const fake = fakeContext({ armed: true })
    fake.answer.confirm = false
    const registry = new CommandRegistry()
    registry.register(stop)

    expect(await registry.invoke('vehicle.emergencyStop', fake.ctx)).toEqual({ status: 'cancelled' })
    expect(fake.calls.sent).toEqual([])
  })
})

describe('the review before arming', () => {
  const review = new ReviewBeforeArming()

  it('may run for a connected vehicle that is known to be disarmed, and opens the review without sending anything', async () => {
    const fake = fakeContext({ armed: false })

    expect(review.isEnabled(fake.ctx)).toEqual({ enabled: true })
    await review.execute(fake.ctx)

    expect(fake.calls.dialogs).toEqual(['review'])
    expect(fake.calls.sent).toEqual([])
  })

  it.each([
    [{ armed: true }, 'palette.reason.alreadyArmed'],
    [{ armed: undefined }, 'palette.reason.stateUnknown'],
    [{ connection: { state: 'lost' } }, 'palette.reason.notConnected'],
  ] as const)('may not run for %j: %s', (facts, reasonKey) => {
    expect(review.isEnabled(fakeContext(facts).ctx)).toEqual({ enabled: false, reasonKey })
  })
})
