// The view of the parameter list, kept in the settings (one choice for every vehicle), and what it lists. Without metadata that
// tells standard from advanced there is nothing to choose, and the view is Full whatever the settings hold.
import { type ComputedRef, computed, shallowRef } from 'vue'
import type { Param } from '@/generated/app'
import { type View, VIEW_KEY, hasUsers, inViewOf, parseView } from '@/lib/params/paramView'
import { useConfigurator } from './useConfigurator'

/** What was chosen and the settings have not answered for yet: the view shows it at once (shared by the screen's parts). */
const local = shallowRef<View | null>(null)

/** The view that something other than the user's choice asked for, for this session only: it is never saved. */
const override = shallowRef<View | null>(null)

/** The view, as refs and an action. */
export interface ParamView {
  /** Whether the choice is offered: the metadata has a `User` for some parameter. */
  available: ComputedRef<boolean>
  /** The view that is in force: the choice, or Full when it is not offered. */
  view: ComputedRef<View>
  /** The parameters that are listed in the view (of the whole list). */
  listed: ComputedRef<Param[]>
  /** Chooses a view: it shows at once, and goes back to what the settings hold if they could not keep it (they say why). */
  choose: (view: View) => Promise<void>
  /** Shows the Full view until the user chooses a view themselves: not saved (a parameter that is asked for is not a choice). */
  showFullForNow: () => void
}

/** Forgets the override (for the tests: it is shared by the whole page). */
export function resetViewOverride(): void {
  override.value = null
}

/**
 * The view of the list.
 *
 * @returns what is in force, what it lists, and how to change it
 */
export function useParamView(): ParamView {
  const { settings, fields } = useConfigurator()
  const available = computed(() => hasUsers(fields.metadata.value))
  const chosen = () => local.value ?? parseView(settings.uiValue(VIEW_KEY))
  const view = computed<View>(() => available.value ? (override.value ?? chosen()) : 'full')
  const listed = computed(() => inViewOf(fields.params.value, fields.metadata.value, view.value))

  /**
   * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold (a choice they could
   * not keep goes back; they swallow the error and their own notice speaks).
   *
   * @param next the view
   */
  async function choose(next: View): Promise<void> {
    override.value = null
    local.value = next
    await settings.setUi(VIEW_KEY, next)

    // A newer choice, made before the answer, is left to its own answer.
    if (local.value === next) {
      local.value = null
    }
  }

  return { available, view, listed, choose, showFullForNow: () => void (override.value = 'full') }
}
