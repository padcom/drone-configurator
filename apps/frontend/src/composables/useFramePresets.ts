// ArduPilot's frame presets (#41): the list of the parameter files ArduPilot publishes for frames it knows, at the vehicle's
// firmware tag or master (the backend's `presets.list`, kept on this computer), a search, one preset's text (`presets.fetch`),
// and "Review and apply": what the preset would change goes to the review (useSnapshots.show) with every change that can be made
// ticked, and is written from there after the same confirmation, one by one and read back. A preset changes how the vehicle
// flies, so it goes to the review only while the vehicle is known to be disarmed, and the review writes nothing while it may be
// armed. Nothing is written from here.
import { type ShallowRef, shallowRef } from 'vue'
import type { BackendClient } from '@/backend/client'
import { pageLanguage, say } from '@/i18n/say'
import type { Connection, Param, PresetsList } from '@/generated/app'
import type { Metadata } from '@/lib/params/metadata'
import { type Against, presetsError, reviewPreset } from '@/lib/params/framePresets'
import type { SnapshotsModel } from './useSnapshots'
import type { RenameSource } from './renameSource'
import { diffOptions } from '@/lib/params/paramDiff'

/** What the presets need from the rest of the interface. */
export interface FramePresetsDeps {
  /** The link to the backend: it lists and fetches the presets. */
  client: BackendClient
  /** The vehicle's parameters, which a preset is reviewed against. */
  params: ShallowRef<Param[]>
  /** The connection: the vehicle a preset is reviewed against. */
  connection: ShallowRef<Connection>
  /** The parameter metadata, when loaded: its read-only parameters are not written, and its ranges give warnings. */
  metadata: () => Metadata
  /** Whether the vehicle is armed or may be (unknown counts as armed): no preset goes to the review then. */
  mayBeArmed: () => boolean
  /** The review a preset goes to. */
  snapshots: Pick<SnapshotsModel, 'show'>
  /** ArduPilot's renames: a name of a preset the vehicle's firmware renamed is reviewed under its new name (#202). */
  renames?: RenameSource
}

/** A preset's text, once it is fetched. */
export interface PresetText {
  /** Its path under `Tools/Frame_params`. */
  path: string
  /** The git reference it is at. */
  ref: string
  /** Its text, as ArduPilot publishes it. */
  text: string
}

/** The presets, as refs and actions. */
export interface FramePresetsModel {
  /** Whether the presets are shown (in the list's place on the Parameters screen). */
  readonly open: ShallowRef<boolean>
  /** The list, once it is there. */
  readonly list: ShallowRef<PresetsList | null>
  /** Whether the list is being downloaded. */
  readonly loading: ShallowRef<boolean>
  /** Why the list could not be had. */
  readonly error: ShallowRef<string | null>
  /** What the search asks for. */
  readonly search: ShallowRef<string>
  /** The path of the selected preset, or null. */
  readonly selected: ShallowRef<string | null>
  /** The selected preset's text, once it is fetched. */
  readonly preset: ShallowRef<PresetText | null>
  /** Whether a preset is being fetched. */
  readonly fetching: ShallowRef<boolean>
  /** Why the selected preset could not be had, or why it cannot be reviewed. */
  readonly presetError: ShallowRef<string | null>
  /** Shows the presets, and downloads the list (from this computer when it is kept). */
  show: () => Promise<void>
  /** Asks GitHub for the list again. */
  refresh: () => Promise<void>
  /** Selects a preset and fetches its text. */
  select: (path: string | null) => Promise<void>
  /** Whether the selected preset can go to the review now: it is fetched, and the vehicle is connected and known disarmed. */
  canReview: () => boolean
  /** Puts what the selected preset would change under review, every change that can be made ticked, and closes the presets. */
  review: () => void
  /** Closes the presets. */
  close: () => void
}

/** The presets. */
class FramePresets implements FramePresetsModel {
  readonly open = shallowRef(false)
  readonly list = shallowRef<PresetsList | null>(null)
  readonly loading = shallowRef(false)
  readonly error = shallowRef<string | null>(null)
  readonly search = shallowRef('')
  readonly selected = shallowRef<string | null>(null)
  readonly preset = shallowRef<PresetText | null>(null)
  readonly fetching = shallowRef(false)
  readonly presetError = shallowRef<string | null>(null)

  /**
   * Makes the presets.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: FramePresetsDeps) {}

  async show(): Promise<void> {
    this.open.value = true
    await this.load(false)
  }

  async refresh(): Promise<void> {
    await this.load(true)
  }

  /**
   * Downloads the list for the connected vehicle (one at a time).
   *
   * @param refresh whether GitHub is asked even when the list is kept
   */
  private async load(refresh: boolean): Promise<void> {
    if (this.loading.value) {
      return
    }
    this.loading.value = true
    this.error.value = null

    try {
      this.list.value = await this.deps.client.call('presets.list', refresh ? { refresh } : {})
    } catch (error) {
      this.list.value = null
      this.error.value = presetsError(error, say, pageLanguage())
    } finally {
      this.loading.value = false
    }
    this.keepSelection()
  }

  /** Forgets the selected preset when the list has it no more (another reference, or none). */
  private keepSelection(): void {
    const path = this.selected.value
    if (path !== null && !this.stillListed(path)) {
      this.forgetPreset()
    }
  }

  /**
   * Whether the list has a preset, at the reference its text was fetched at.
   *
   * @param path the preset
   * @returns true when it has
   */
  private stillListed(path: string): boolean {
    const list = this.list.value

    return list !== null && this.fetchedAt(list.ref) && list.presets.some(entry => entry.path === path)
  }

  /**
   * Whether the selected preset's text is of a reference (or not fetched yet).
   *
   * @param ref the reference
   * @returns true when it is
   */
  private fetchedAt(ref: string): boolean {
    const fetched = this.preset.value

    return fetched === null || fetched.ref === ref
  }

  /** Forgets the selected preset and its text. */
  private forgetPreset(): void {
    this.selected.value = null
    this.preset.value = null
    this.presetError.value = null
  }

  async select(path: string | null): Promise<void> {
    if (path === null) {
      this.forgetPreset()

      return
    }
    const list = this.list.value
    if (path !== this.selected.value && list !== null) {
      this.selected.value = path
      await this.fetch(list.ref, path)
    }
  }

  /**
   * Fetches a preset's text: shown only when it is still the selected one when it comes.
   *
   * @param ref the git reference of the list
   * @param path the preset
   */
  private async fetch(ref: string, path: string): Promise<void> {
    this.preset.value = null
    this.presetError.value = null
    this.fetching.value = true

    try {
      const file = await this.deps.client.call('presets.fetch', { ref, path })
      // The renames are there by the time the preset is reviewed (they never fail).
      await this.deps.renames?.ready()
      if (this.selected.value === path) {
        this.preset.value = { path, ref, text: file.text }
      }
    } catch (error) {
      if (this.selected.value === path) {
        this.presetError.value = presetsError(error, say, pageLanguage())
      }
    } finally {
      this.fetching.value = false
    }
  }

  canReview(): boolean {
    return this.preset.value !== null && this.deps.connection.value.state === 'connected' && !this.deps.mayBeArmed()
  }

  /**
   * What the selected preset is reviewed against: the vehicle's parameters, the vehicle and the metadata.
   *
   * @returns them
   */
  private against(): Against {
    const metadata = this.deps.metadata()

    return {
      params: this.deps.params.value,
      vehicle: this.deps.connection.value.vehicle,
      options: diffOptions(metadata.size > 0 ? metadata : undefined, this.deps.renames?.now()),
    }
  }

  review(): void {
    const preset = this.preset.value
    if (!preset || !this.canReview()) {
      return
    }
    const reviewed = reviewPreset(preset.text, { kind: 'preset', ref: preset.ref, path: preset.path }, this.against())
    if (!reviewed) {
      this.presetError.value = say('reason.noParamLines')

      return
    }
    this.deps.snapshots.show(reviewed, reviewed.changes.map(change => change.id))
    this.close()
  }

  close(): void {
    this.open.value = false
    this.search.value = ''
  }
}

/**
 * Makes the presets.
 *
 * @param deps the client and the rest of the interface
 * @returns the refs and the actions
 */
export function useFramePresets(deps: FramePresetsDeps): FramePresetsModel {
  return new FramePresets(deps)
}
