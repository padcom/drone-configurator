// The application's commands and the context they run in. The registry is made once, with the commands of the screens in it
// (`goToScreens`); more are registered where they belong (the reboot, with the vehicle). The context is what a command may
// touch, made from the router, the configurator and the toasts: commands get nothing else (lib/commands/command.ts).
import { inject, nextTick } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'
import type {
  CommandContext, DialogFacts, FileFacts, ParameterFacts, ParamsFacts, VehicleFacts,
} from '@/lib/commands/command'
import { CommandRegistry } from '@/lib/commands/registry'
import { goToScreens, goToSections } from '@/lib/commands/navigation'
import { ConnectToVehicle, DisconnectFromVehicle, ShowPalette } from '@/lib/commands/app'
import { LoadMetadata } from '@/lib/commands/metadata'
import { ParameterProvider } from '@/lib/commands/parameters'
import { DownloadParameters, LoadSnapshot, SaveSnapshot } from '@/lib/commands/snapshots'
import { FAVOURITES_GROUP, inGroup } from '@/lib/params/paramGroups'
import { RebootFlightController } from '@/lib/commands/vehicle'
import { openFile, saveText, snapshotFileName } from '@/lib/app/files'
import { HEARTBEAT_FRESH_MS, armedOf } from '@/lib/app/armed'
import { pageLanguage, say, sayEnglish } from '@/i18n/say'
import { toggleUnlessCovered } from './useCommandPalette'
import { useConfigurator } from './useConfigurator'
import { useConnectDialog } from './useConnectDialog'
import { useCommandUsage } from './useCommandUsage'
import { useFavourites } from './favourites'
import { useParamGroup } from './useParamGroup'
import { useParamSearchIndex } from './useParamSearchIndex'
import { useParamView } from './useParamView'
import { useToasts } from './toasts'

export { HEARTBEAT_FRESH_MS }

/**
 * The registry, with the commands every session has.
 *
 * @returns the registry
 */
function makeRegistry(): CommandRegistry {
  const registry = new CommandRegistry()
  goToScreens().forEach(command => registry.register(command))
  goToSections().forEach(command => registry.register(command))
  registry.register(new RebootFlightController())
  const others = [
    new LoadMetadata(),
    new ShowPalette(),
    new ConnectToVehicle(),
    new DisconnectFromVehicle(),
    new DownloadParameters(),
    new SaveSnapshot(),
    new LoadSnapshot(),
    new ParameterProvider(),
  ]
  others.forEach(command => registry.register(command))

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
  const armed = () => armedOf(fields.telemetry.value)
  const downloading = () => (fields.list.value === 'loading' ? 'downloading' : null)
  const busy = () => (staged.writing.value ? 'writing' : downloading())

  return {
    connection: () => fields.connection.value,
    armed,
    busy,
    reboot: () => vehicle.reboot(),
    disconnect: () => void vehicle.disconnect(),
  }
}

/**
 * What the commands may know of the parameters for the toolbar: how many there are, whether a write holds them, and the one
 * action on them that the toolbar has.
 *
 * @returns the facts
 */
function paramsFacts(): ParamsFacts {
  const { fields, parameters } = useConfigurator()

  return {
    count: () => fields.params.value.length,
    busy: () => parameters.lock.busy.value,
    download: () => void parameters.refresh(),
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
        view.showFullForNow()
      }

      void selectAfterTable(() => parameters.select(id))
    },
  }
}

/**
 * The files the commands open and save, with the flows of the toolbar's buttons: the host's dialog in Pico Desktop, a file input
 * (made for the moment) in a browser, and the toast of what was found.
 *
 * @returns the facts
 */
function fileFacts(): FileFacts {
  const { metadata, snapshots, fields } = useConfigurator()

  return {
    loadMetadata: () => openFile(() => metadata.openFile(), text => metadata.load(text)),
    loadSnapshot: () => openFile(() => snapshots.openFile(), text => snapshots.load(text)),
    saveSnapshot: () => saveText(snapshots, snapshots.snapshot(), snapshotFileName('params', fields.connection.value.vehicle)),
  }
}

/**
 * The dialogs that open on a command.
 *
 * @returns the facts
 */
function dialogFacts(): DialogFacts {
  const connect = useConnectDialog()

  return { showConnect: () => connect.show(), togglePalette: toggleUnlessCovered }
}

/**
 * The context commands run in. Made in a component's `setup`, where the router and the configurator are.
 *
 * @returns the context
 */
export function useCommandContext(): CommandContext {
  // The buttons of the toolbars are in components that may be mounted without a router (their own tests): the router is
  // only needed by the commands that go to a screen.
  const router = inject(routerKey, null)
  const route = inject(routeLocationKey, null)
  const toasts = useToasts()
  const { confirmWith } = useConfigurator()
  const { recent } = useCommandUsage()

  return {
    navigate: async path => {
      await router?.push(path)
    },
    // Read from the route when asked, so that what depends on it (the rail's current screen) follows a change.
    currentPath: () => route?.path ?? '',
    parameters: parameterFacts(),
    vehicle: vehicleFacts(),
    params: paramsFacts(),
    dialogs: dialogFacts(),
    usage: { recent: () => recent.value },
    files: fileFacts(),
    // The one route for what is dangerous: the confirmation dialog, with the options the command gives (a hold).
    confirm: options => confirmWith(options),
    toast: input => toasts.push(input),
    say,
    language: pageLanguage,
    sayEnglish,
  }
}
