// The view of the parameter list, kept in the settings (one choice for every vehicle), and what it lists. Without metadata that
// tells standard from advanced there is nothing to choose, and the view is Full whatever the settings hold.
import { type ComputedRef, computed } from 'vue'
import type { Param } from './generated/app'
import { type View, VIEW_KEY, hasUsers, inViewOf, parseView } from './paramView'
import { useConfigurator } from './useConfigurator'

/** The view, as refs and an action. */
export interface ParamView {
  /** Whether the choice is offered: the metadata has a `User` for some parameter. */
  available: ComputedRef<boolean>
  /** The view that is in force: the choice, or Full when it is not offered. */
  view: ComputedRef<View>
  /** The parameters that are listed in the view (of the whole list). */
  listed: ComputedRef<Param[]>
  /** Chooses a view (kept in the settings; their own notice says when they could not). */
  choose: (view: View) => Promise<void>
}

/**
 * The view of the list.
 *
 * @returns what is in force, what it lists, and how to change it
 */
export function useParamView(): ParamView {
  const { settings, fields } = useConfigurator()
  const available = computed(() => hasUsers(fields.metadata.value))
  const view = computed<View>(() => available.value ? parseView(settings.uiValue(VIEW_KEY)) : 'full')
  const listed = computed(() => inViewOf(fields.params.value, fields.metadata.value, view.value))

  return { available, view, listed, choose: next => settings.setUi(VIEW_KEY, next) }
}
