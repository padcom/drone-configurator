// "Modified from default": the filter that lists only the parameters whose value is not the firmware's default. It is the one
// filter that narrows a search too (a group and the view do not). One choice that the toolbar (which sets it) and the table
// (which follows it) share, for this session. Offered when the firmware's defaults are known (defaults.ts).
import { type ComputedRef, type Ref, computed, ref } from 'vue'
import { useConfigurator } from './useConfigurator'

/** The filter, as refs and an action. */
export interface ModifiedFilter {
  /** Whether the defaults are known, so that the filter can be used. */
  available: ComputedRef<boolean>
  /** Whether the filter is on (and can be: off while the defaults are not known). */
  on: ComputedRef<boolean>
  /** What the user chose (kept while the defaults are not known, for when they are). */
  chosen: Ref<boolean>
  /** The parameters whose value is not the default now. */
  modified: ComputedRef<ReadonlySet<string>>
  /** Turns the filter on or off. */
  set: (on: boolean) => void
}

const chosen = ref(false)

/**
 * The filter, shared by the whole application.
 *
 * @returns the filter and how to change it
 */
export function useModifiedFilter(): ModifiedFilter {
  const { parameters } = useConfigurator()
  const available = computed(() => parameters.defaults.value !== null)

  return {
    available,
    on: computed(() => available.value && chosen.value),
    chosen,
    modified: parameters.modified,
    set: next => {
      chosen.value = next
    },
  }
}
