import { afterEach, beforeEach, expect, it, vi } from 'vitest'

/** A stand-in for the system's `prefers-color-scheme: dark` query, which a test can flip. */
class FakeQuery {
  matches: boolean
  readonly listeners: ((event: { matches: boolean }) => void)[] = []

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: string, listener: (event: { matches: boolean }) => void): void {
    this.listeners.push(listener)
  }

  flip(matches: boolean): void {
    this.matches = matches

    for (const listener of this.listeners) {
      listener({ matches })
    }
  }
}

let query: FakeQuery

/**
 * A fresh copy of the module (the theme is shared state), on a system that prefers `dark`.
 *
 * @param dark whether the system prefers dark
 * @returns `useTheme`
 */
async function freshTheme(dark: boolean) {
  query = new FakeQuery(dark)
  vi.stubGlobal('matchMedia', () => query)
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia
  vi.resetModules()

  return (await import('./useTheme')).useTheme()
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('follows the system until the user chooses', async () => {
  const theme = await freshTheme(true)

  expect(theme.choice.value).toBe('system')
  expect(theme.effective.value).toBe('dark')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
})

it('follows the system when it changes its mind', async () => {
  const theme = await freshTheme(false)
  expect(theme.effective.value).toBe('light')

  query.flip(true)
  expect(theme.effective.value).toBe('dark')
})

it('puts a chosen theme on the root element, and takes it off for the system', async () => {
  const theme = await freshTheme(false)

  theme.set('dark')
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(theme.effective.value).toBe('dark')

  theme.set('light')
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  expect(theme.effective.value).toBe('light')

  theme.set('system')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
})

it('keeps the choice over the system', async () => {
  const theme = await freshTheme(true)

  theme.set('light')
  query.flip(false)
  query.flip(true)

  expect(theme.effective.value).toBe('light')
})

it('is one theme for the whole application', async () => {
  const first = await freshTheme(false)
  const second = (await import('./useTheme')).useTheme()

  first.set('dark')

  expect(second.choice.value).toBe('dark')
})

it('does not fail where the page cannot say what the system prefers: it is light', async () => {
  vi.resetModules()
  vi.stubGlobal('matchMedia', undefined)
  window.matchMedia = undefined as unknown as typeof window.matchMedia

  const theme = (await import('./useTheme')).useTheme()

  expect(theme.effective.value).toBe('light')
})
