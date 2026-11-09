import { expect, it } from 'vitest'
import { canDownload, listStatusText, visibleParams } from './paramList'
import { PARAMS } from './fixtures'

it('says how complete the list is', () => {
  expect(listStatusText('complete', PARAMS.length, [], PARAMS.length)).toBe('12 parameters')
  expect(listStatusText('complete', PARAMS.length, [], 2)).toBe('2 of 12 parameters')
  expect(listStatusText('incomplete', PARAMS.length, [3, 7], 12)).toContain('2 never arrived (indexes 3, 7)')
  expect(listStatusText('none', 0, [], 0)).toBe('Connect to download the parameters.')
  expect(listStatusText('loading', 0, [], 0)).toBe('Downloading the parameters…')
  expect(listStatusText('failed', 0, [], 0)).toBe('The download failed.')
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
