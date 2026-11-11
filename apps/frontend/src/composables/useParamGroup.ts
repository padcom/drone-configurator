// Which group of the parameter list is chosen ('' is all of them): one choice that the group list (which sets it) and the
// table (which follows it) share.
import { type Ref, ref } from 'vue'

/** The chosen group. */
export interface ParamGroup {
  /** The chosen group's name, or an empty string for all. */
  chosen: Ref<string>
  /** Chooses a group (an empty string for all). */
  choose: (group: string) => void
}

const chosen = ref('')

const shared: ParamGroup = {
  chosen,
  choose: group => {
    chosen.value = group
  },
}

/**
 * The chosen group, shared by the whole application.
 *
 * @returns the choice and how to change it
 */
export function useParamGroup(): ParamGroup {
  return shared
}
