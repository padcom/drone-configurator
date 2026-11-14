// What a part of the Tune screen needs beyond a Setup page's panel: the panel is for tuning (its changes may be written while the
// vehicle is armed, after a hold), a value beyond the hard limit of ArduPilot's table stops the write, and the initial values of
// the session can be put back (they are queued as choices: nothing is sent until the user writes, through the one question or the
// hold).
import { type ComputedRef, computed } from 'vue'
import { refusalOf } from '@/lib/tune/table'
import type { ConfiguratorHandle } from './useConfigurator'
import { type ParamPanel, useParamPanel } from './useParamPanel'

/** A part of the Tune screen's parameters. */
export interface TunePanel {
  /** The parameters, as a panel that writes them. */
  readonly panel: ParamPanel
  /** Whether a chosen value is beyond the hard limit (negative, above the table's most): nothing is written until fixed. */
  readonly refused: ComputedRef<boolean>
  /** Whether any of the parameters has an initial value to put back that the vehicle is not at. */
  readonly movable: ComputedRef<boolean>
  /** Chooses the initial value of each parameter that is not at it (what it had at the first complete download). */
  backToInitial: () => void
  /** The parameters of the part that the vehicle does not have. */
  readonly missing: ComputedRef<string[]>
}

/**
 * The tuning panel of some parameters.
 *
 * @param ids the parameters, in the order of the page
 * @param handle the parameters, the queue, the connection and the telemetry
 * @returns the panel and what the page adds to it
 */
export function useTunePanel(ids: readonly string[], handle: ConfiguratorHandle): TunePanel {
  const panel = useParamPanel(ids, handle, { tuning: true })
  const initialOf = (id: string) => handle.parameters.initial.value?.values.get(id)
  const refused = computed(() => panel.dirty.value.some(id => refusalOf(id, panel.value(id) ?? 0) !== null))
  const movable = computed(() => ids.some(id => {
    const was = initialOf(id)

    return was !== undefined && panel.vehicleValue(id) !== null && panel.value(id) !== was
  }))
  const backToInitial = () => {
    ids.forEach(id => {
      const was = initialOf(id)
      if (was !== undefined && panel.vehicleValue(id) !== null) {
        panel.set(id, was)
      }
    })
  }

  return { panel, refused, movable, backToInitial, missing: panel.missing }
}
