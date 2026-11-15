// What the Tune panel adds to a Setup panel: whether a value can go back to the initial one is judged on the number the vehicle
// holds (a float is compared as the float it is, not as the double the page typed), and putting back chooses only what differs.
import { effectScope } from 'vue'
import { expect, it, vi } from 'vitest'
import { createConfigurator } from '@/composables/useConfigurator'
import { useTunePanel } from '@/composables/useTunePanel'
import type { Param } from '@/generated/app'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import { feed } from '@/testing/testing'

const ID = 'ATC_RAT_RLL_P'

/**
 * A panel over a vehicle that holds a float for one parameter, the first complete download taken as the initial values.
 *
 * @returns the panel
 */
async function panelOf() {
  const real = { id: ID, kind: 'real', type: 'REAL32', value: Math.fround(0.135), index: 700 } satisfies Param
  const params = [...SETUP_PARAMS.filter(param => param.id !== ID), real]
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params }), () => Promise.resolve(true))
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))

  const tune = effectScope().run(() => useTunePanel([ID], handle))
  if (!tune) {
    throw new Error('the panel was not made')
  }

  return tune
}

it('does not call a value that is the float of the initial one, however it was typed, a value to put back', async () => {
  const tune = await panelOf()

  expect(tune.movable.value).toBe(false)
  tune.panel.set(ID, 0.135)
  expect(tune.movable.value).toBe(false)
})

it('calls a different value a value to put back, and puts back only that', async () => {
  const tune = await panelOf()
  tune.panel.set(ID, 0.2)

  expect(tune.movable.value).toBe(true)
  tune.backToInitial()
  expect(tune.panel.dirty.value).toEqual([])
  expect(tune.movable.value).toBe(false)
})
