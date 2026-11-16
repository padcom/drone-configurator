// A plan for a test that needs a long one: made at once, the way the page's own commands make it (so Undo and the limits work),
// without a click per item.
import { usePlan } from '@/composables/usePlan'

/**
 * Puts waypoints in the page's plan, each at a place a little north of the one before, each selected as it is added.
 *
 * @param count how many waypoints
 */
export function seedPlan(count: number): void {
  const plan = usePlan()
  for (let index = 0; index < count; index += 1) {
    plan.add(16)
    const item = plan.item.value
    if (item) {
      plan.update(item.id, { lat: 52 + index / 10_000, lon: 21 })
    }
  }
}
