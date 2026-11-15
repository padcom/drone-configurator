// What the tests of the flight controls read of the mock vehicle and of the question the page asked, as plain calls.
import type { ConfiguratorHandle } from '@/composables/useConfigurator'
import type { SafetyOptions } from '@/lib/app/safety'
import type { MockControl } from '@/mock/mock-backend'

/**
 * What the vehicle was sent by the arming service, in order.
 *
 * @param control the mock's controls
 * @returns `arm`, `disarm`, `stop`, `mode N`, `prearm`
 */
export function sentOf(control: MockControl): string[] {
  return control.arming?.sent?.() ?? []
}

/**
 * Sets the pre-arm texts the mock vehicle prints when asked to arm or to run its checks.
 *
 * @param control the mock's controls
 * @param texts the texts (without "PreArm: ")
 */
export function printsPrearm(control: MockControl, texts: string[]): void {
  control.arming?.prearm?.(texts)
}

/**
 * How the page asked the user, if it is asking.
 *
 * @param handle the Configurator
 * @returns the options of the question, or undefined
 */
export function askedOf(handle: ConfiguratorHandle): SafetyOptions | undefined {
  return handle.confirmation.value?.options
}
