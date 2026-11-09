// A ref for values that arrive faster than the screen draws: any number of pushes in a frame publish once, the latest
// (docs/frontend-state.md). Telemetry can come at 50 Hz; the interface follows at the display's rate, and no more.
import { type Ref, getCurrentScope, onScopeDispose, readonly, shallowRef } from 'vue'

/** Asks for `task` to run before the next frame is drawn; the function returned cancels the request. */
export type Scheduler = (task: () => void) => () => void

/**
 * The browser's frame scheduler.
 *
 * @param task what to run before the next frame
 * @returns a function that cancels it
 */
export const animationFrame: Scheduler = task => {
  const id = requestAnimationFrame(() => task())

  return () => cancelAnimationFrame(id)
}

/** A value that is published at most once per frame. */
export interface FrameRef<T> {
  /** The published value: what a component reads. It changes at most once per frame. */
  readonly value: Readonly<Ref<T>>
  /** Offers a newer value. Of the values pushed in one frame, only the last is published. */
  push: (value: T) => void
  /** Publishes the pending value now, without waiting for the frame. */
  flush: () => void
  /** Drops the pending value and the pending frame. Also done when the effect scope ends. */
  stop: () => void
}

/**
 * Makes a ref that publishes the latest pushed value once per frame.
 *
 * @param initial the value until one is published
 * @param schedule asks for the next frame (`requestAnimationFrame` by default; tests give their own)
 * @returns the frame ref
 */
export function useFrameRef<T>(initial: T, schedule: Scheduler = animationFrame): FrameRef<T> {
  const published = shallowRef(initial) as Ref<T>
  let pending: { value: T } | undefined
  let cancel: (() => void) | undefined

  const flush = () => {
    cancel = undefined

    if (pending) {
      published.value = pending.value
      pending = undefined
    }
  }
  const push = (value: T) => {
    pending = { value }
    cancel ??= schedule(flush)
  }
  const stop = () => {
    cancel?.()
    cancel = undefined
    pending = undefined
  }

  if (getCurrentScope()) {
    onScopeDispose(stop)
  }

  return { value: readonly(published) as Readonly<Ref<T>>, push, flush, stop }
}
