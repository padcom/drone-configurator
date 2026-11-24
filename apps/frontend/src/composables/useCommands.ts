// The application's commands and the context they run in. The registry is made once, with the commands of the screens in it
// (`goToScreens`); more are registered where they belong (the reboot, with the vehicle). The context is what a command may
// touch, made from the router, the configurator and the toasts: commands get nothing else (lib/commands/command.ts).
import { inject, nextTick } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'
import type {
  Command,
  CommandContext,
  DialogFacts,
  FileFacts,
  GuidedFacts,
  ParameterFacts,
  ParamsFacts,
  PlanFacts,
  PreferenceFacts,
  VehicleFacts,
} from '@/lib/commands/command'
import {
  AddOnMap, AddWaypoint, DeleteItem, DuplicateItem, MoveItemDown, MoveItemUp, RedoPlan, UndoPlan,
} from '@/lib/commands/plan'
import { MAX_ITEMS } from '@/lib/plan/model'
import { CommandRegistry } from '@/lib/commands/registry'
import { goToScreens, goToSections } from '@/lib/commands/navigation'
import { ConnectAgain, ConnectToVehicle, DisconnectFromVehicle, ShowKeys, ShowPalette } from '@/lib/commands/app'
import { LAST_KEY, lastRequest } from '@/lib/app/connectionForm'
import { OpenLogFile } from '@/lib/commands/logs'
import { LoadMetadata } from '@/lib/commands/metadata'
import { ParameterProvider } from '@/lib/commands/parameters'
import { parameterCommands } from '@/lib/commands/snapshots'
import { FAVOURITES_GROUP, inGroup } from '@/lib/params/paramGroups'
import { RebootFlightController } from '@/lib/commands/vehicle'
import { ArmVehicle, DisarmVehicle, EmergencyStop, ReviewBeforeArming, flightModeCommands } from '@/lib/commands/arming'
import { ChangeAltitude } from '@/lib/commands/changeAltitude'
import { GoHere } from '@/lib/commands/goHere'
import { SetHomeHere } from '@/lib/commands/setHomeHere'
import { TakeOff } from '@/lib/commands/takeoff'
import { PARAMS_ACCEPT, openFile, saveText, snapshotFileName } from '@/lib/app/files'
import { EXTENSIONS } from '@/lib/params/paramFile'
import { HEARTBEAT_FRESH_MS } from '@/lib/app/armed'
import { reasonsOf } from '@/lib/fly/prearm'
import { pageLanguage, say, sayEnglish } from '@/i18n/say'
import { toggleUnlessCovered } from './useCommandPalette'
import { useConfigurator } from './useConfigurator'
import { armMayBeOn, useArmGrace } from './useArmGrace'
import { useArmReview } from './useArmReview'
import { useConnectDialog } from './useConnectDialog'
import { toggleKeyHelpUnlessCovered } from './useKeyHelp'
import { useCommandUsage } from './useCommandUsage'
import { useModeConfirmation } from './useModeConfirmation'
import { useChangeAltitude } from './useChangeAltitude'
import { useGoHere } from './useGoHere'
import { useGuidedPreferences } from './useGuidedPreferences'
import { useTakeoff } from './useTakeoff'
import { useTakeoffCeiling } from './useTakeoffCeiling'
import { useFavourites } from './favourites'
import { useParamGroup } from './useParamGroup'
import { useParamSearchIndex } from './useParamSearchIndex'
import { useParamView } from './useParamView'
import { usePlan } from './usePlan'
import { useToasts } from './toasts'

export { HEARTBEAT_FRESH_MS }

/**
 * The commands that edit the plan on the Plan page.
 *
 * @returns them
 */
function planCommands(): Command[] {
  return [
    new AddWaypoint(),
    new AddOnMap(),
    new DuplicateItem(),
    new DeleteItem(),
    new MoveItemUp(),
    new MoveItemDown(),
    new UndoPlan(),
    new RedoPlan(),
  ]
}

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
  registry.register(new ArmVehicle())
  registry.register(new ReviewBeforeArming())
  registry.register(new DisarmVehicle())
  registry.register(new EmergencyStop())
  registry.register(new TakeOff())
  registry.register(new GoHere())
  registry.register(new ChangeAltitude())
  registry.register(new SetHomeHere())
  planCommands().forEach(command => registry.register(command))
  flightModeCommands().forEach(command => registry.register(command))
  const others = [
    new LoadMetadata(),
    new ShowPalette(),
    new ShowKeys(),
    new ConnectToVehicle(),
    new ConnectAgain(),
    new DisconnectFromVehicle(),
    ...parameterCommands(),
    new OpenLogFile(),
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
 * Asks the backend to arm; an arm the vehicle accepted, or did not answer, may have armed it.
 *
 * @param vehicle the vehicle
 * @returns what the vehicle said
 */
async function armedMaybe(vehicle: ReturnType<typeof useConfigurator>['vehicle']): ReturnType<VehicleFacts['arm']> {
  const result = await vehicle.arm()
  // The vehicle may be armed already, and its heartbeat is a moment late: until it says, the state is not known.
  if (result.result === 'accepted' || result.result === 'no-answer') {
    armMayBeOn()
  }

  return result
}

/**
 * What the commands may know of the vehicle, read from the state when asked.
 *
 * @returns the facts
 */
function vehicleFacts(): VehicleFacts {
  const { fields, messages, settings, setup, staged, vehicle } = useConfigurator()
  const { armed: known } = useArmGrace()
  const armed = () => known.value
  const downloading = () => (fields.list.value === 'loading' ? 'downloading' : null)
  const busy = () => (staged.writing.value ? 'writing' : downloading())

  return {
    connection: () => fields.connection.value,
    armed,
    busy,
    reboot: () => vehicle.reboot(),
    arm: () => armedMaybe(vehicle),
    disarm: () => vehicle.disarm(),
    emergencyStop: () => vehicle.emergencyStop(),
    setMode: mode => vehicle.setMode(mode),
    prearm: () => vehicle.prearm(),
    takeoff: altitude => vehicle.takeoff(altitude),
    reposition: ask => vehicle.reposition(ask),
    setSpeed: ask => vehicle.setSpeed(ask),
    changeAltitude: ask => vehicle.changeAltitude(ask),
    setHomeHere: () => vehicle.setHomeHere(),
    telemetry: () => fields.telemetry.value,
    recentReasons: () => reasonsOf(messages.list.value, Date.now()).map(reason => reason.text),
    modes: () => setup.modes.value,
    mode: () => fields.telemetry.value?.mode,
    disconnect: () => void vehicle.disconnect(),
    lastConnection: () => lastRequest(settings.uiValue(LAST_KEY)),
    connect: request => void vehicle.connect(request),
  }
}

/**
 * What the commands may know of the parameters for the toolbar: how many there are, whether a write holds them, and the one
 * action on them that the toolbar has.
 *
 * @returns the facts
 */
function paramsFacts(): ParamsFacts {
  const { fields, parameters, compare } = useConfigurator()

  return {
    count: () => fields.params.value.length,
    busy: () => parameters.lock.busy.value,
    download: () => void parameters.refresh(),
    value: id => fields.params.value.find(param => param.id === id)?.value,
    listComplete: () => fields.list.value === 'complete',
    compareDefaults: () => void compare.loadDefaults(),
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

/** Waits for something and then does something: the two halves of an import. */
interface ImportSteps {
  /** Resolves when the message browser's questions are answered. */
  settled: () => Promise<void>
  /** Chooses a log file, imports it and opens it. */
  importFile: () => Promise<void>
}

/**
 * Imports a log file once the questions the message browser has asked of the open log are answered.
 *
 * @param steps the browser's wait and the import
 */
async function importAfter(steps: ImportSteps): Promise<void> {
  await steps.settled()
  await steps.importFile()
}

/**
 * The files the commands open and save, with the flows of the toolbar's buttons: the host's dialog in Pico Desktop, a file input
 * (made for the moment) in a browser, and the toast of what was found.
 *
 * @returns the facts
 */
function fileFacts(): FileFacts {
  const { metadata, snapshots, compare, fields, flights, browser } = useConfigurator()

  return {
    loadMetadata: () => openFile(() => metadata.openFile(), text => metadata.load(text)),
    loadSnapshot: () => openFile(() => snapshots.openFile(), text => snapshots.load(text), null, PARAMS_ACCEPT),
    compareFile: () => openFile(() => compare.openFile(), text => compare.loadText(text), null, PARAMS_ACCEPT),
    saveSnapshot: () => saveText(snapshots, snapshots.snapshot(), snapshotFileName('params', fields.connection.value.vehicle)),
    saveParamFile: format => saveText(
      snapshots,
      snapshots.paramFile(format),
      snapshotFileName('params', fields.connection.value.vehicle, new Date(), EXTENSIONS[format]),
    ),
    // The questions the message browser has asked of the open log are answered first (the backend reads one thing at a time).
    openLog: () => void importAfter({ settled: () => browser.settled(), importFile: () => flights.importFile() }),
    logBusy: () => flights.importing.value || flights.phase.value === 'reading' || flights.phase.value === 'loading',
  }
}

/**
 * The dialogs that open on a command.
 *
 * @returns the facts
 */
function dialogFacts(): DialogFacts {
  const connect = useConnectDialog()
  const review = useArmReview()
  const takeoff = useTakeoff()
  const altitude = useChangeAltitude()

  return {
    showConnect: () => connect.show(),
    togglePalette: toggleUnlessCovered,
    showKeys: toggleKeyHelpUnlessCovered,
    showArmReview: () => review.show(),
    showTakeoff: () => takeoff.show(),
    showChangeAltitude: () => altitude.show(),
  }
}

/**
 * What the user chose in Settings, read when asked.
 *
 * @returns the facts
 */
function preferenceFacts(): PreferenceFacts {
  const { level: modeConfirmation } = useModeConfirmation()
  const { ceiling: takeoffCeiling } = useTakeoffCeiling()
  const { prefs: guided } = useGuidedPreferences()

  return {
    modeConfirmation: () => modeConfirmation.value,
    takeoffCeiling: () => takeoffCeiling.value,
    guided: () => guided.value,
  }
}

/**
 * The place picked on the map.
 *
 * @returns the facts
 */
function guidedFacts(): GuidedFacts {
  const goHere = useGoHere()

  return { target: () => goHere.target.value, clearTarget: () => goHere.clear() }
}

/**
 * The plan on the Plan page, as the commands see it.
 *
 * @returns the facts
 */
function planFacts(): PlanFacts {
  const plan = usePlan()
  const canMove = (by: -1 | 1): boolean => {
    const at = plan.plan.value.items.findIndex(item => item.id === plan.selected.value)
    const to = at + by

    return at >= 0 && to >= 0 && to < plan.plan.value.items.length
  }

  return {
    selected: () => plan.selected.value,
    full: () => plan.plan.value.items.length >= MAX_ITEMS,
    canMove,
    canUndo: () => plan.canUndo.value,
    canRedo: () => plan.canRedo.value,
    adding: () => plan.adding.value,
    setAdding: on => plan.setAdding(on),
    add: command => plan.add(command),
    duplicate: () => plan.duplicate(),
    remove: () => plan.remove(),
    move: by => plan.move(by),
    undo: () => plan.undo(),
    redo: () => plan.redo(),
  }
}

/**
 * What the screens hold that a command may touch: the place picked on the map, and the plan.
 *
 * @returns the facts
 */
function screenFacts(): Pick<CommandContext, 'guided' | 'plan'> {
  return { guided: guidedFacts(), plan: planFacts() }
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
    preferences: preferenceFacts(),
    ...screenFacts(),
    files: fileFacts(),
    // The one route for what is dangerous: the confirmation dialog, with the options the command gives (a hold).
    confirm: options => confirmWith(options),
    toast: input => toasts.push(input),
    say,
    language: pageLanguage,
    sayEnglish,
  }
}
