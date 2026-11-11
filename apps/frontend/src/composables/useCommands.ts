// The application's commands and the context they run in. The registry is made once, with the commands of the screens in it
// (`goToScreens`); more are registered where they belong (the reboot, with the vehicle). The context is what a command may
// touch, made from the router, the configurator and the toasts: commands get nothing else (lib/commands/command.ts).
import { nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { CommandContext, ParameterFacts, VehicleFacts } from '@/lib/commands/command'
import { CommandRegistry } from '@/lib/commands/registry'
import { goToScreens } from '@/lib/commands/navigation'
import { ParameterProvider } from '@/lib/commands/parameters'
import { FAVOURITES_GROUP, inGroup } from '@/lib/params/paramGroups'
import { RebootFlightController } from '@/lib/commands/vehicle'
import { say, sayEnglish } from '@/i18n/say'
import { useConfigurator } from './useConfigurator'
import { useFavourites } from './favourites'
import { useParamGroup } from './useParamGroup'
import { useParamSearchIndex } from './useParamSearchIndex'
import { useParamView } from './useParamView'
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
  registry.register(new ParameterProvider())

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
 * Selects after the table has seen the search or the group change: it selects the first row of the new list when that flush
 * runs, and the parameter asked for is the one that must stay selected.
 *
 * @param select what selects the parameter
 */
async function selectAfterTable(select: () => void): Promise<void> {
  await nextTick()
  select()
}

/**
 * What the commands may know of the parameters, and how they show one. Showing one clears the search, goes to All when the
 * chosen group or view would hide it, and selects it: the table scrolls to the selected row by itself.
 *
 * @returns the facts
 */
function parameterFacts(): ParameterFacts {
  const { fields, parameters } = useConfigurator()
  const searchIndex = useParamSearchIndex()
  const favourites = useFavourites()
  const group = useParamGroup()
  const view = useParamView()

  return {
    searchIndex,
    favourites: () => favourites.set.value,
    describe: id => fields.metadata.value.get(id)?.description ?? '',
    reveal: id => {
      const starred = favourites.set.value.has(id)
      const inChosenGroup = group.chosen.value === FAVOURITES_GROUP ? starred : inGroup(id, group.chosen.value)

      parameters.setFilter('')

      if (!inChosenGroup) {
        group.choose('')
      }

      if (!view.listed.value.some(param => param.id === id)) {
        void view.choose('full')
      }

      void selectAfterTable(() => parameters.select(id))
    },
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
  const { confirmWith } = useConfigurator()

  return {
    navigate: async path => {
      await router.push(path)
    },
    parameters: parameterFacts(),
    vehicle: vehicleFacts(),
    // The one route for what is dangerous: the confirmation dialog, with the options the command gives (a hold).
    confirm: options => confirmWith(options),
    toast: input => toasts.push(input),
    say,
    sayEnglish,
  }
}
