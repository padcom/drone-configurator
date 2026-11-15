// The review before arming: whether it is open, and what asking the vehicle to run its pre-arm checks came to. Opening it
// runs the checks (`vehicle.prearm`: the vehicle prints what fails, in its words, and the messages list has them); the answer
// itself says little (ArduPilot answers ACCEPTED whatever the checks found), so the reasons shown are the vehicle's recent
// messages. One flag the commands (which open it) and the dialog (which closes itself) share.
import { type ShallowRef, shallowRef } from 'vue'
import { describeError } from '@/backend/client'
import { useConfigurator } from './useConfigurator'

/** The review's state. */
export interface ArmReview {
  /** True while the review is shown. */
  open: ShallowRef<boolean>
  /** True while the vehicle is being asked to run its checks. */
  running: ShallowRef<boolean>
  /** Why the checks could not be run (the backend would not send the command), in words, or null. */
  error: ShallowRef<string | null>
  /** Shows it, and runs the checks. */
  show: () => void
  /** Closes it. */
  hide: () => void
  /** Asks the vehicle to run its checks again. */
  run: () => Promise<void>
}

const open = shallowRef(false)
const running = shallowRef(false)
const error = shallowRef<string | null>(null)

/** The checks are over. */
function finish(): void {
  running.value = false
}

/** Asks the vehicle to run its checks: once for each call, never in two at once. */
async function run(): Promise<void> {
  if (running.value) {
    return
  }
  running.value = true
  error.value = null

  try {
    await useConfigurator().vehicle.prearm()
  } catch (failure) {
    error.value = describeError(failure)
  } finally {
    finish()
  }
}

const shared: ArmReview = {
  open,
  running,
  error,
  show: () => {
    open.value = true
    void run()
  },
  hide: () => {
    open.value = false
  },
  run,
}

/**
 * The review before arming, shared by the whole application.
 *
 * @returns the state and how to change it
 */
export function useArmReview(): ArmReview {
  return shared
}
