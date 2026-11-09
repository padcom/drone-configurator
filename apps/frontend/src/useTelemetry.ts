// The vehicle's telemetry for the interface, at the rate the screen draws it: the backend can send it at 50 Hz, a
// component that reads this ref is rendered at most once per frame (docs/frontend-state.md, "The frame rule").
import { type Ref, watch } from 'vue'
import type { Telemetry } from './generated/app'
import { type Scheduler, useFrameRef } from './state/frame'
import { useConfigurator } from './useConfigurator'

/**
 * The latest telemetry, or null without a vehicle, changing at most once per frame. Made in a component's `setup` (or
 * any effect scope), it stops with it.
 *
 * @param schedule asks for the next frame (`requestAnimationFrame` by default; tests give their own)
 * @returns a read-only ref of the telemetry
 */
export function useTelemetry(schedule?: Scheduler): Readonly<Ref<Telemetry | null>> {
  const { fields } = useConfigurator()
  const frames = useFrameRef<Telemetry | null>(fields.telemetry.value, schedule)
  // Every new value is pushed as it comes; the frame ref publishes the last of them once per frame.
  watch(fields.telemetry, telemetry => frames.push(telemetry), { flush: 'sync' })

  return frames.value
}
