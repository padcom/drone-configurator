import { afterEach, expect, it, vi } from 'vitest'
import { mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from './useConfigurator'
import { choiceOf, forgetLogsChoices, useLogsSettings } from './useLogsSettings'

afterEach(() => {
  forgetLogsChoices()
})

it('does not download after landing and removes nothing (never, no limit) until the settings say otherwise', () => {
  createConfigurator(mockBackend())
  const prefs = useLogsSettings()

  expect(prefs.autoDownload.value).toBe(false)
  expect(prefs.retentionDays.value).toBe('0')
  expect(prefs.sizeCapMb.value).toBe('0')
})

it('keeps a choice in the settings, shows it at once, and reads it back at the next start', async () => {
  createConfigurator(mockBackend())
  const prefs = useLogsSettings()
  const choosing = prefs.chooseAutoDownload(true)

  expect(prefs.autoDownload.value).toBe(true)
  await choosing
  await prefs.chooseRetention('30')
  await prefs.chooseSizeCap('500')
  forgetLogsChoices()

  await vi.waitFor(() => expect(useLogsSettings().retentionDays.value).toBe('30'))
  expect(useLogsSettings().autoDownload.value).toBe(true)
  expect(useLogsSettings().sizeCapMb.value).toBe('500')
})

it('takes a value that is not one of the choices for the default', () => {
  expect(choiceOf('7', ['30', '90'], '90')).toBe('90')
  expect(choiceOf(undefined, ['30', '90'], '90')).toBe('90')
  expect(choiceOf('30', ['30', '90'], '90')).toBe('30')
})
