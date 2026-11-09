import { expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { type Scheduler, useFrameRef } from './frame'

/**
 * A scheduler the test drives: `frame()` runs what was asked for, as the browser does before drawing.
 *
 * @returns the scheduler, `frame` to run the frame, and `pending` for how many frames are asked for
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

  return { schedule, frame, pending: () => queue.length }
}

it('starts with the initial value', () => {
  const { schedule } = manualFrames()

  expect(useFrameRef(7, schedule).value.value).toBe(7)
})

it('publishes 100 pushes in one frame once, with the latest value', () => {
  const { schedule, frame } = manualFrames()
  const ref = useFrameRef(0, schedule)
  const seen: number[] = []
  watch(ref.value, value => seen.push(value), { flush: 'sync' })

  for (let n = 1; n <= 100; n += 1) {
    ref.push(n)
  }
  expect(seen).toEqual([])
  frame()

  expect(seen).toEqual([100])
  expect(ref.value.value).toBe(100)
})

it('asks for one frame for any number of pushes, and for another after it has run', () => {
  const { schedule, frame, pending } = manualFrames()
  const ref = useFrameRef(0, schedule)

  ref.push(1)
  ref.push(2)
  expect(pending()).toBe(1)
  frame()
  expect(pending()).toBe(0)
  ref.push(3)
  expect(pending()).toBe(1)
})

it('publishes once per frame when values keep coming', () => {
  const { schedule, frame } = manualFrames()
  const ref = useFrameRef(0, schedule)
  const seen: number[] = []
  watch(ref.value, value => seen.push(value), { flush: 'sync' })

  ref.push(1)
  ref.push(2)
  frame()
  ref.push(3)
  ref.push(4)
  frame()
  frame()

  expect(seen).toEqual([2, 4])
})

it('publishes at once on flush, and not again for the same push', () => {
  const { schedule, frame } = manualFrames()
  const ref = useFrameRef(0, schedule)
  const seen: number[] = []
  watch(ref.value, value => seen.push(value), { flush: 'sync' })

  ref.push(5)
  ref.flush()
  frame()

  expect(seen).toEqual([5])
})

it('drops the pending value when the effect scope ends', () => {
  const { schedule, frame, pending } = manualFrames()
  const scope = effectScope()
  const ref = scope.run(() => useFrameRef(0, schedule))
  ref?.push(9)

  scope.stop()
  frame()

  expect(pending()).toBe(0)
  expect(ref?.value.value).toBe(0)
})

it('does not publish a value that equals the one already published', () => {
  const { schedule, frame } = manualFrames()
  const ref = useFrameRef(1, schedule)
  const seen: number[] = []
  watch(ref.value, value => seen.push(value), { flush: 'sync' })

  ref.push(1)
  frame()

  expect(seen).toEqual([])
})
