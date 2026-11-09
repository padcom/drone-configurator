import { expect, it } from 'vitest'
import { canDownload, listStatusText, visibleParams } from './paramList'
import { translate } from './testing'
import { PARAMS } from './fixtures'

it('says how complete the list is', () => {
  const total = PARAMS.length
  const counts = { list: 'complete' as const, total, missing: [], shown: total }

  expect(listStatusText(counts, translate)).toBe('12 parameters')
  expect(listStatusText({ ...counts, shown: 2 }, translate)).toBe('2 of 12 parameters')
  expect(listStatusText({ ...counts, list: 'incomplete', missing: [3, 7] }, translate))
    .toBe('12 parameters, but 2 never arrived (indexes 3, 7). Download again to retry.')
})

it('says what to do while there is no list', () => {
  const none = { list: 'none' as const, total: 0, missing: [], shown: 0 }

  expect(listStatusText(none, translate)).toBe('Connect to download the parameters.')
  expect(listStatusText({ ...none, list: 'loading' }, translate)).toBe('Downloading the parameters…')
  expect(listStatusText({ ...none, list: 'failed' }, translate)).toBe('The download failed.')
})

it('filters by name, case-insensitively and anywhere in the name', () => {
  expect(visibleParams(PARAMS, 'batt').map(p => p.id)).toEqual(['BATT_CAPACITY', 'BATT_LOW_VOLT'])
  expect(visibleParams(PARAMS, ' Batt_Low ').map(p => p.id)).toEqual(['BATT_LOW_VOLT'])
  expect(visibleParams(PARAMS, '')).toBe(PARAMS)
  expect(visibleParams(PARAMS, '   ')).toBe(PARAMS)
  expect(visibleParams(PARAMS, 'NOPE')).toEqual([])
})

it('offers Download only while connected and not already downloading', () => {
  expect(canDownload('connected', 'complete')).toBe(true)
  expect(canDownload('connected', 'loading')).toBe(false)
  expect(canDownload('disconnected', 'none')).toBe(false)
  expect(canDownload('lost', 'complete')).toBe(false)
})
