// The review of a file from an older firmware (#202): a renamed parameter's row says the old and the new name with the release,
// and both values when the firmware converts it; it can be ticked like any other, and nothing is ticked at first.
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SnapshotImport from './SnapshotImport.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { VEHICLE, telemetryAt } from '@/mock/fixtures'
import type { Review } from '@/lib/params/snapshot'

const review: Review = {
  source: { kind: 'file', format: 'param' },
  changes: [
    {
      id: 'RTL_ALT_M', from: 15, to: 30, problem: null, warning: null,
      renamed: { from: 'RTL_ALT', since: '4.7', value: 3000, units: { from: 'cm', to: 'm' } },
    },
    { id: 'GPS1_TYPE', from: 0, to: 1, problem: null, warning: null, renamed: { from: 'GPS_TYPE', since: '4.6', value: 1 } },
  ],
  unchanged: 0,
  vehicleWarning: null,
  notes: [],
}

afterEach(() => {
  delete window.picoDesktop
})

it('names a renamed parameter by its old and new name, shows both values when converted, ticks like any other', async () => {
  const handle = createConfigurator(mockBackend())
  const toggle = vi.spyOn(handle.snapshots, 'toggle').mockImplementation(() => undefined)
  const wrapper = mount(SnapshotImport, withI18n)
  await flushPromises()
  feed(handle, {
    importReview: review,
    connection: { state: 'connected', vehicle: { ...VEHICLE } },
    telemetry: { ...telemetryAt(0), armed: false },
  })
  await wrapper.vm.$nextTick()

  const rows = wrapper.findAll('tbody tr')
  expect(rows.map(row => row.get('th').text()))
    .toEqual(['RTL_ALT → RTL_ALT_M (renamed in 4.7)', 'GPS_TYPE → GPS1_TYPE (renamed in 4.6)'])
  expect(rows[0]?.get('td.new').text()).toBe('→ 30 Converted: 3000 cm → 30 m')
  expect(rows[1]?.get('td.new').text()).toBe('→ 1')
  const pick = wrapper.get('input[data-pick="RTL_ALT_M"]')
  expect((pick.element as HTMLInputElement).checked).toBe(false)
  expect(pick.attributes('disabled')).toBeUndefined()

  await pick.trigger('change')
  expect(toggle).toHaveBeenCalledWith('RTL_ALT_M')
})
