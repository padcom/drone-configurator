// How the parameter list is grouped: by the name (what comes before the first underscore) or by the metadata (the library or the
// vehicle ArduPilot's definitions have each parameter in), kept in the settings (one choice for every vehicle). Without metadata
// that places parameters in groups there is nothing to choose, and the grouping is by the name whatever the settings hold.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { type Grouping, groupOf, hasMetadataGroups, metadataGrouping } from '@/lib/params/paramGroups'
import { useConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

/** The key of the settings entry that holds the choice. */
export const GROUP_BY_KEY = 'params.groupBy'

/** How the list is grouped. */
export type GroupBy = 'name' | 'metadata'

/**
 * The grouping in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns the grouping; by the name for an entry that is missing or is anything else
 */
export function parseGroupBy(text: string | undefined): GroupBy {
  return text === 'metadata' ? 'metadata' : 'name'
}

/** What was chosen and the settings have not answered for yet (shared by the screen's parts). */
const local = shallowRef<GroupBy | null>(null)

/** The grouping, as refs and an action. */
export interface ParamGrouping {
  /** Whether the choice is offered: the metadata places some parameter in a group. */
  available: ComputedRef<boolean>
  /** The grouping in force: the choice, or by the name when it is not offered. */
  by: ComputedRef<GroupBy>
  /** The group of a parameter, in the grouping in force. */
  grouping: ComputedRef<Grouping>
  /** Chooses a grouping: it shows at once (the chosen group goes back to All), and the settings keep it. */
  choose: (by: GroupBy) => Promise<void>
}

/**
 * The grouping of the list.
 *
 * @returns what is in force, and how to change it
 */
export function useParamGrouping(): ParamGrouping {
  const { settings, fields } = useConfigurator()
  const group = useParamGroup()
  const available = computed(() => hasMetadataGroups(fields.metadata.value))
  const by = computed<GroupBy>(() => available.value ? local.value ?? parseGroupBy(settings.uiValue(GROUP_BY_KEY)) : 'name')
  const grouping = computed<Grouping>(() => by.value === 'metadata' ? metadataGrouping(fields.metadata.value) : groupOf)

  /**
   * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold.
   *
   * @param next the grouping
   */
  async function choose(next: GroupBy): Promise<void> {
    if (next !== by.value) {
      group.choose('')
    }
    local.value = next
    await settings.setUi(GROUP_BY_KEY, next)

    // A newer choice, made before the answer, is left to its own answer.
    if (local.value === next) {
      local.value = null
    }
  }

  return { available, by, grouping, choose }
}
