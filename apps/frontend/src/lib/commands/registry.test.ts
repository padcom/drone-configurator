// The registry and its protocol: what `invoke` checks, in which order, and that nothing is thrown at the caller.
import { describe, expect, it } from 'vitest'
import type { Command, CommandProvider } from './command'
import type { SafetyOptions } from '@/lib/app/safety'
import { CommandRegistry, PROVIDED_MAX } from './registry'
import { fakeContext } from '@/testing/commandContext'

/** A question to ask. */
const ASK: SafetyOptions = { title: 't', what: 'w', vehicle: '', level: 'hold', confirmLabel: 'c' }

/** The steps a test command went through, in order. */
type Steps = string[]

/**
 * A command that notes what is asked of it.
 *
 * @param id its id
 * @param steps where to note
 * @param own what to change in it
 * @returns the command
 */
function command(id: string, steps: Steps = [], own: Partial<Command> = {}): Command {
  return {
    id,
    labelKey: 'palette.go.flight',
    groupKey: 'palette.group.navigate',
    isEnabled: () => {
      steps.push('enabled?')

      return { enabled: true }
    },
    execute: () => {
      steps.push('execute')

      return { focus: 'main' }
    },
    ...own,
  }
}

describe('registering', () => {
  it('lists the commands in the order they were registered', () => {
    const commands = new CommandRegistry();
    ['b', 'a', 'c'].forEach(id => commands.register(command(id)))

    expect(commands.list().map(c => c.id)).toEqual(['b', 'a', 'c'])
    expect(commands.get('a')?.id).toBe('a')
    expect(commands.get('none')).toBeUndefined()
  })

  it('refuses a second command with an id that is taken, and a provider with one too', () => {
    const commands = new CommandRegistry()
    commands.register(command('a'))

    expect(() => commands.register(command('a'))).toThrow(/already registered/u)
    expect(() => commands.register({ id: 'a', search: () => [] })).toThrow(/already registered/u)
  })

  it('takes a command out again with the function register gave, and then the id is free', () => {
    const commands = new CommandRegistry()
    const remove = commands.register(command('a'))
    remove()
    remove()

    expect(commands.list()).toEqual([])
    expect(() => commands.register(command('a'))).not.toThrow()
  })
})

describe('availability', () => {
  it('says whether a registered command is available, and nothing for one that is not registered', () => {
    const commands = new CommandRegistry()
    commands.register(command('a', [], { isEnabled: () => ({ enabled: false, reasonKey: 'palette.reason.armed' }) }))
    const { ctx } = fakeContext()

    expect(commands.availability('a', ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.armed' })
    expect(commands.availability('none', ctx)).toBeUndefined()
  })
})

describe('invoke', () => {
  it('checks, runs and says it is done, with what the command left for the caller', async () => {
    const steps: Steps = []
    const commands = new CommandRegistry()
    commands.register(command('a', steps))

    expect(await commands.invoke('a', fakeContext().ctx)).toEqual({ status: 'done', outcome: { focus: 'main' } })
    expect(steps).toEqual(['enabled?', 'enabled?', 'execute'])
  })

  it('runs nothing and gives the reason when the command is disabled', async () => {
    const steps: Steps = []
    const commands = new CommandRegistry()
    commands.register(command('a', steps, { isEnabled: () => ({ enabled: false, reasonKey: 'k', reasonParams: { n: 1 } }) }))
    const fake = fakeContext()

    expect(await commands.invoke('a', fake.ctx)).toEqual({ status: 'disabled', reasonKey: 'k', reasonParams: { n: 1 } })
    expect(steps).toEqual([])
    expect(fake.calls.confirm).toEqual([])
  })

  it('says it does not know a command that is not registered', async () => {
    expect(await new CommandRegistry().invoke('none', fakeContext().ctx)).toEqual({ status: 'unknown' })
  })
})

describe('invoke: the confirmation', () => {
  it('asks the confirmation before it runs, and runs nothing when the answer is no', async () => {
    const steps: Steps = []
    const commands = new CommandRegistry()
    commands.register(command('a', steps, { confirmation: () => ASK }))
    const fake = fakeContext()
    fake.answer.confirm = false

    expect(await commands.invoke('a', fake.ctx)).toEqual({ status: 'cancelled' })
    expect(fake.calls.confirm).toHaveLength(1)
    expect(steps).not.toContain('execute')
  })

  it('does not ask when the command asks for nothing (a null confirmation)', async () => {
    const commands = new CommandRegistry()
    commands.register(command('a', [], { confirmation: () => null }))
    const fake = fakeContext()

    expect((await commands.invoke('a', fake.ctx)).status).toBe('done')
    expect(fake.calls.confirm).toEqual([])
  })
})

describe('invoke: the check after the confirmation', () => {
  it('checks again after the confirmation: a command that became disabled while the question was open does not run', async () => {
    const steps: Steps = []
    let enabled = true
    const commands = new CommandRegistry()
    commands.register(command('a', steps, {
      isEnabled: () => (enabled ? { enabled: true } : { enabled: false, reasonKey: 'later' }),
      confirmation: () => ASK,
    }))
    const fake = fakeContext()
    fake.answer.confirm = () => {
      enabled = false

      return true
    }

    expect(await commands.invoke('a', fake.ctx)).toEqual({ status: 'disabled', reasonKey: 'later', reasonParams: undefined })
    expect(steps).toEqual([])
  })
})

describe('invoke: what goes wrong', () => {
  it('turns an exception of the command into a result, and of the confirmation too', async () => {
    const commands = new CommandRegistry()
    const boom = new Error('boom')
    commands.register(command('a', [], { execute: () => { throw boom } }))
    commands.register(command('b', [], { confirmation: () => { throw boom } }))

    expect(await commands.invoke('a', fakeContext().ctx)).toEqual({ status: 'failed', error: boom })
    expect(await commands.invoke('b', fakeContext().ctx)).toEqual({ status: 'failed', error: boom })
  })

  it('turns a rejected promise of the command into a result', async () => {
    const commands = new CommandRegistry()
    const boom = new Error('later')
    commands.register(command('a', [], { execute: () => Promise.reject(boom) }))

    expect(await commands.invoke('a', fakeContext().ctx)).toEqual({ status: 'failed', error: boom })
  })

  it('runs a command that a provider made, given as the command itself', async () => {
    const steps: Steps = []

    expect((await new CommandRegistry().invoke(command('made', steps), fakeContext().ctx)).status).toBe('done')
    expect(steps).toContain('execute')
  })
})

/**
 * A provider that makes `count` commands for any query.
 *
 * @param count how many
 * @returns the provider
 */
function provider(count: number): CommandProvider {
  const made = (query: string) => Array.from({ length: count }, (_, at) => command(`${query}-${at}`))

  return { id: 'p', search: made }
}

describe('providers', () => {
  it('adds its commands to the result of a query, after the commands, at most PROVIDED_MAX of them', () => {
    const commands = new CommandRegistry()
    commands.register(command('a'))
    commands.register(provider(PROVIDED_MAX + 5))
    const ids = commands.search('switch', fakeContext().ctx).map(c => c.id)

    expect(ids).toHaveLength(1 + PROVIDED_MAX)
    expect(ids[0]).toBe('a')
    expect(ids[1]).toBe('switch-0')
  })

  it('adds nothing for an empty query: the list is the registered commands, in order', () => {
    const commands = new CommandRegistry()
    commands.register(command('a'))
    commands.register(provider(3))

    expect(commands.search('  ', fakeContext().ctx).map(c => c.id)).toEqual(['a'])
  })

  it('is taken out with the function register gave', () => {
    const commands = new CommandRegistry()
    commands.register(provider(2))()

    expect(commands.search('x', fakeContext().ctx)).toEqual([])
  })
})
