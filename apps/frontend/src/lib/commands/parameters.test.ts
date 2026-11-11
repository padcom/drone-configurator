import { describe, expect, it } from 'vitest'
import { fakeContext } from '@/testing/commandContext'
import { CommandRegistry, PROVIDED_MAX } from './registry'
import { GoToParameter, ParameterProvider, favouritesFirst } from './parameters'

const NAMES = ['ARMING_CHECK', 'ATC_RAT_RLL_P', 'ATC_RAT_PIT_P', 'BATT_CAPACITY', 'BATT_MONITOR', 'FRAME_CLASS']

/**
 * A context with parameters, and the registry that has the provider.
 *
 * @param ids the parameters' names
 * @returns the fake and the registry
 */
function withParameters(ids: string[] = NAMES) {
  const fake = fakeContext()
  fake.parameters.ids = ids
  const registry = new CommandRegistry()
  registry.register(new ParameterProvider())

  return { fake, registry }
}

describe('parameters in the palette', () => {
  it('finds a parameter by its name, from two letters', () => {
    const { fake, registry } = withParameters()

    expect(registry.search('BATT', fake.ctx).map(command => command.label)).toEqual(['BATT_CAPACITY', 'BATT_MONITOR'])
  })

  it('offers nothing for a query of one letter: that is every parameter', () => {
    const { fake, registry } = withParameters()

    expect(registry.search('b', fake.ctx)).toEqual([])
  })

  it('offers nothing, and no stub, when no parameters have been downloaded', () => {
    const { fake, registry } = withParameters([])

    expect(registry.search('BATT', fake.ctx)).toEqual([])
  })

  it('finds a parameter by what the metadata says it is, and shows that as the detail', () => {
    const { fake, registry } = withParameters()
    fake.parameters.metadata = new Map([['BATT_CAPACITY', { description: 'Battery capacity in milliamp hours' }]])

    const found = registry.search('milliamp', fake.ctx)

    expect(found.map(command => command.label)).toEqual(['BATT_CAPACITY'])
    expect(found[0]?.detail).toBe('Battery capacity in milliamp hours')
  })
})

describe('how many parameters the palette offers, and in which order', () => {
  it('offers at most the registry cap', () => {
    const many = Array.from({ length: 30 }, (_, i) => `TUNE_P${String(i).padStart(2, '0')}`)
    const { fake, registry } = withParameters(many)

    expect(registry.search('TUNE', fake.ctx)).toHaveLength(PROVIDED_MAX)
  })

  it('makes commands (and asks for descriptions) only for the rows it offers, not for every match', () => {
    const many = Array.from({ length: 30 }, (_, i) => `TUNE_P${String(i).padStart(2, '0')}`)
    const { fake } = withParameters(many)
    const described: string[] = []
    const { describe: describeOne } = fake.ctx.parameters
    fake.ctx.parameters.describe = id => {
      described.push(id)

      return describeOne(id)
    }

    const made = new ParameterProvider().search('TUNE', fake.ctx)

    expect(made).toHaveLength(PROVIDED_MAX)
    expect(described).toHaveLength(PROVIDED_MAX)
  })
})

describe('the order of the parameters the palette offers', () => {
  it('says which of the parameters it offers are starred', () => {
    const { fake } = withParameters()
    fake.parameters.favourites = new Set(['BATT_MONITOR'])

    expect(new ParameterProvider().search('BATT', fake.ctx).map(command => command.starred)).toEqual([true, false])
  })

  it('puts a starred parameter first among the ones that match the same way', () => {
    const { fake, registry } = withParameters()
    fake.parameters.favourites = new Set(['BATT_MONITOR'])

    expect(registry.search('BATT', fake.ctx).map(command => command.label)).toEqual(['BATT_MONITOR', 'BATT_CAPACITY'])
  })

  it('does not let a star lift a match by description above one by name', () => {
    const hits = [
      { id: 'A_NAME', reason: 'name' as const },
      { id: 'B_DESC', reason: 'description' as const },
    ]

    expect(favouritesFirst(hits, new Set(['B_DESC'])).map(hit => hit.id)).toEqual(['A_NAME', 'B_DESC'])
  })
})

describe('going to a parameter', () => {
  it('is always enabled, and writes nothing', () => {
    expect(new GoToParameter('FRAME_CLASS', '').isEnabled()).toEqual({ enabled: true })
  })

  it('shows the Parameters screen, with the parameter revealed, and puts the focus in the screen', async () => {
    const { fake } = withParameters()

    const outcome = await new GoToParameter('FRAME_CLASS', '').execute(fake.ctx)

    expect(fake.calls.navigate).toEqual(['/parameters'])
    expect(fake.calls.reveal).toEqual(['FRAME_CLASS'])
    expect(outcome).toEqual({ focus: 'main' })
  })
})
