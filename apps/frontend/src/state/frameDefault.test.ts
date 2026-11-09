// useFrameRef with the browser's own scheduler (requestAnimationFrame), not a test's.
import { expect, it } from 'vitest'
import { nextFrame } from '../testing'
import { useFrameRef } from './frame'

it('publishes the latest of several pushes on the next animation frame', async () => {
  const ref = useFrameRef(0)

  ref.push(1)
  ref.push(2)
  ref.push(3)
  expect(ref.value.value).toBe(0)
  await nextFrame()

  expect(ref.value.value).toBe(3)
})

it('publishes nothing for a push that was stopped before the frame', async () => {
  const ref = useFrameRef(0)

  ref.push(7)
  ref.stop()
  await nextFrame()

  expect(ref.value.value).toBe(0)
})
