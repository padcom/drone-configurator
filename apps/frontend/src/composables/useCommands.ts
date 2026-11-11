// The application's commands and the context they run in. The registry is made once, with the commands of the screens in it
// (`goToScreens`); more are registered where they belong (the reboot, with the vehicle). The context is what a command may
// touch, made from the router, the configurator and the toasts: commands get nothing else (lib/commands/command.ts).
import { useRouter } from 'vue-router'
import type { CommandContext, VehicleFacts } from '@/lib/commands/command'
import { CommandRegistry } from '@/lib/commands/registry'
import { goToScreens } from '@/lib/commands/navigation'
import { say, sayEnglish } from '@/i18n/say'
import { useConfigurator } from './useConfigurator'
import { useToasts } from './toasts'

/** Telemetry older than this (ms) does not say whether the vehicle is armed: it is not known. */
export const HEARTBEAT_FRESH_MS = 3000

/**
 * The registry, with the commands every session has.
 *
 * @returns the registry
 */
function makeRegistry(): CommandRegistry {
  const registry = new CommandRegistry()
  goToScreens().forEach(command => registry.register(command))

  return registry
}

const registry = makeRegistry()

/**
 * The application's commands.
 *
 * @returns the registry: the palette lists, searches and invokes through it
 */
export function useCommands(): CommandRegistry {
  return registry
}

/**
 * What the commands may know of the vehicle, read from the state when asked.
 *
 * @returns the facts
 */
function vehicleFacts(): VehicleFacts {
  const { fields, staged } = useConfigurator()
  const armed = () => {
    const telemetry = fields.telemetry.value

    return telemetry !== null && telemetry.heartbeatAgeMs <= HEARTBEAT_FRESH_MS ? telemetry.armed : undefined
  }
  const downloading = () => (fields.list.value === 'loading' ? 'downloading' : null)
  const busy = () => (staged.writing.value ? 'writing' : downloading())

  return {
    connection: () => fields.connection.value,
    armed,
    busy,
    // The reboot is asked of the backend where it is wired in (the Reboot command): the screens' commands do not use it.
    reboot: () => Promise.reject(new Error('the vehicle reboot is not wired to the backend yet')),
  }
}

/**
 * The context commands run in. Made in a component's `setup`, where the router and the configurator are.
 *
 * @returns the context
 */
export function useCommandContext(): CommandContext {
  const router = useRouter()
  const toasts = useToasts()

  return {
    navigate: async path => {
      await router.push(path)
    },
    vehicle: vehicleFacts(),
    // No command of the screens asks for a confirmation: the commands that do get theirs where they are wired in.
    confirm: () => Promise.resolve(false),
    toast: input => toasts.push(input),
    say,
    sayEnglish,
  }
}
