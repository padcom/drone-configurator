import { expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { mockBackend } from './mock-backend'
import type { Scheduler } from './state/frame'
import { feed } from './testing'
import { createConfigurator } from './useConfigurator'
import { useTelemetry } from './useTelemetry'
import { telemetryAt } from './fixtures'

/**
 * A scheduler the test drives: `frame()` runs what was asked for, as the browser does before drawing.
 *
 * @returns the scheduler and `frame`
 */
function manualFrames() {
  let queue: (() => void)[] = []
  const schedule: Scheduler = task => {
    queue.push(task)

    return () => {
      queue = queue.filter(queued => queued !== task)
    }
  }
  const frame = () => {
    const due = queue
    queue = []
    due.forEach(task => task())
  }

  return { schedule, frame }
}

it('starts with the telemetry the Configurator holds, or null', () => {
  createConfigurator(mockBackend())
  const scope = effectScope()

  expect(scope.run(() => useTelemetry())?.value).toBeNull()
  scope.stop()
})

it('publishes a burst of 100 telemetry events once per frame, with the last one', () => {
  const handle = createConfigurator(mockBackend())
  const { schedule, frame } = manualFrames()
  const scope = effectScope()
  const telemetry = scope.run(() => useTelemetry(schedule))
  const seen: (number | undefined)[] = []
  scope.run(() => watch(telemetry!, value => seen.push(value?.batteryRemaining), { flush: 'sync' }))

  for (let n = 1; n <= 100; n += 1) {
    feed(handle, { telemetry: telemetryAt(n) })
  }
  expect(seen).toEqual([])
  frame()

  expect(seen).toEqual([0])
  expect(telemetry?.value).toEqual(telemetryAt(100))
  scope.stop()
})

it('follows each new frame, and clears when the vehicle goes away', () => {
  const handle = createConfigurator(mockBackend())
  const { schedule, frame } = manualFrames()
  const scope = effectScope()
  const telemetry = scope.run(() => useTelemetry(schedule))

  feed(handle, { telemetry: telemetryAt(3) })
  frame()
  expect(telemetry?.value).toEqual(telemetryAt(3))

  feed(handle, { telemetry: null })
  frame()
  expect(telemetry?.value).toBeNull()
  scope.stop()
})

it('stops with the scope: later telemetry is not published', () => {
  const handle = createConfigurator(mockBackend())
  const { schedule, frame } = manualFrames()
  const scope = effectScope()
  const telemetry = scope.run(() => useTelemetry(schedule))

  scope.stop()
  feed(handle, { telemetry: telemetryAt(5) })
  frame()

  expect(telemetry?.value).toBeNull()
})
