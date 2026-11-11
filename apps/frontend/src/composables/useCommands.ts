// The application's commands and the context they run in. The registry is made once, with the commands of the screens in it
// (`goToScreens`); more are registered where they belong (the reboot, with the vehicle). The context is what a command may
// touch, made from the router, the configurator and the toasts: commands get nothing else (lib/commands/command.ts).
import { useRouter } from 'vue-router'
import type { CommandContext, VehicleFacts } from '@/lib/commands/command'
import { CommandRegistry } from '@/lib/commands/registry'
import { goToScreens } from '@/lib/commands/navigation'
import { LoadMetadata } from '@/lib/commands/metadata'
import { RebootFlightController } from '@/lib/commands/vehicle'
import { openFile } from '@/lib/app/files'
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
  registry.register(new RebootFlightController())
  registry.register(new LoadMetadata())

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
  const { fields, staged, vehicle } = useConfigurator()
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
    reboot: () => vehicle.reboot(),
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
  const { confirmWith, metadata } = useConfigurator()

  return {
    navigate: async path => {
      await router.push(path)
    },
    vehicle: vehicleFacts(),
    // The Load metadata button's own flow: the host's dialog in Pico Desktop, a file input in a browser (made for the moment,
    // as the button's input is only there while the Parameters screen is), and the toast of what was found.
    files: { loadMetadata: () => openFile(() => metadata.openFile(), text => metadata.load(text)) },
    // The one route for what is dangerous: the confirmation dialog, with the options the command gives (a hold).
    confirm: options => confirmWith(options),
    toast: input => toasts.push(input),
    say,
    sayEnglish,
  }
}
