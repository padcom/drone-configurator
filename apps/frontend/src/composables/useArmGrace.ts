// The armed state as the page treats it: what the heartbeat says, EXCEPT for a few seconds after an arm that the vehicle
// accepted (or that nothing answered): the vehicle may be armed already, its heartbeat is a moment late, and the backend holds
// the state as not known for the same reason. In that time the state is not known, which counts as armed: the page offers
// Disarm and the emergency stop, and not a second arm. It ends by itself, whatever the heartbeat says (a vehicle that was asked
// and refused to be armed is disarmed after it).
import { type ComputedRef, computed, shallowRef } from 'vue'
import { armedOf } from '@/lib/app/armed'
import { useConfigurator } from './useConfigurator'

/** How long after an accepted arm the state is not known (ms): the backend's hold (1.5 s) and a heartbeat. */
export const ARM_GRACE_MS = 3000

const until = shallowRef(0)
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * An arm was accepted or not answered: the state is not known for a moment.
 *
 * @param ms for how long (ms)
 */
export function armMayBeOn(ms: number = ARM_GRACE_MS): void {
  clearTimeout(timer)
  until.value = Date.now() + ms
  timer = setTimeout(() => {
    until.value = 0
  }, ms)
}

/** Forgets the grace (for the tests: it is shared by the whole page). */
export function forgetArmGrace(): void {
  clearTimeout(timer)
  until.value = 0
}

/** The state. */
export interface ArmGrace {
  /** Whether it is armed: true or false, or undefined when that is not known (no recent heartbeat, or an arm just sent). */
  armed: ComputedRef<boolean | undefined>
}

/**
 * The armed state the controls and the commands go by.
 *
 * @returns it, as a ref
 */
export function useArmGrace(): ArmGrace {
  const { fields } = useConfigurator()
  const armed = computed(() => {
    const heartbeat = armedOf(fields.telemetry.value)

    return heartbeat === false && until.value > 0 ? undefined : heartbeat
  })

  return { armed }
}
