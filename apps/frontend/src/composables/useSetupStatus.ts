// The Setup home's steps for the vehicle that is connected, worked out from its parameters when they change (see
// lib/setup/setupStatus.ts: heuristics, each saying what it looked at).
import { type ComputedRef, computed } from 'vue'
import { type Status, setupStatus } from '@/lib/setup/setupStatus'
import type { ConfiguratorHandle } from './useConfigurator'

/**
 * The steps of the connected vehicle.
 *
 * @param handle the parameters
 * @returns the status, which follows the parameters
 */
export function useSetupStatus(handle: ConfiguratorHandle): ComputedRef<Status> {
  return computed(() => setupStatus(new Map(handle.parameters.params.value.map(param => [param.id, param.value]))))
}
