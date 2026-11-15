// The flight mode list of the top bar: the modes of the vehicle's kind (the one the heartbeat names is always there, and
// cannot be chosen again), and what choosing one does. A mode is asked for only by choosing its item in a menu that was opened
// by a click or a key on its button: the arrows only move the focus. The command asks what it must before it sends (and RTL,
// Land, Loiter and Brake never ask); what the vehicle is in is what its heartbeat says, never what was asked.
import { type ComputedRef, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useConfigurator } from '@/composables/useConfigurator'
import { ChangeFlightMode } from '@/lib/commands/arming'
import type { MenuItem } from '@/lib/ui/menuKeys'

/** The mode list and what it does. */
export interface ModeMenu {
  /** The items: one for each mode, none while the vehicle's modes are not known (nothing to choose from). */
  items: ComputedRef<MenuItem[]>
  /** A mode was chosen: the command runs. */
  pick: (name: string) => void
}

/**
 * The modes to list: the vehicle kind's, and the one the heartbeat names even if the kind has no name for it.
 *
 * @param known the kind's modes
 * @param now the mode the heartbeat names ('' when it names none)
 * @returns the names
 */
function withCurrent(known: string[], now: string): string[] {
  return now === '' || known.includes(now) ? known : [now, ...known]
}

/**
 * The mode list.
 *
 * @returns the items and what choosing one does
 */
export function useModeMenu(): ModeMenu {
  const { t } = useI18n()
  const { fields, setup } = useConfigurator()
  const run = useCommandRunner()
  const current = computed(() => fields.telemetry.value?.mode ?? '')
  const known = computed(() => setup.modes.value?.modes.map(mode => mode.name) ?? [])
  const canPick = computed(() => fields.connection.value.state === 'connected' && setup.modes.value !== null)
  const items = computed<MenuItem[]>(() => (known.value.length === 0
    ? []
    : withCurrent(known.value, current.value).map(name => ({
      id: name,
      label: name,
      hint: name === current.value ? t('strip.current') : undefined,
      disabled: !canPick.value || name === current.value,
    }))))

  return {
    items,
    pick: name => void run(new ChangeFlightMode(name)),
  }
}
