import { expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { i18n } from './i18n'
import { createAppRouter } from './router'
import { HOME, PRODUCT_SCREENS, SCREENS } from './screens'

it('has the seven screens of the product, Flight data first', () => {
  expect(PRODUCT_SCREENS.map(screen => screen.id))
    .toEqual(['flight', 'plan', 'setup', 'tune', 'parameters', 'logs', 'simulation'])
  expect(HOME).toBe('/flight')
})

it('adds the gallery, last, in development (which the tests are), and the build leaves it out (build.test.ts)', () => {
  expect(import.meta.env.DEV).toBe(true)
  expect(SCREENS.map(screen => screen.id)).toEqual([...PRODUCT_SCREENS.map(screen => screen.id), 'gallery'])
})

it('names every screen once, with a path and a title that exist', () => {
  expect(new Set(SCREENS.map(screen => screen.id)).size).toBe(SCREENS.length)
  expect(new Set(SCREENS.map(screen => screen.path)).size).toBe(SCREENS.length)

  for (const screen of SCREENS) {
    expect(screen.path).toBe(`/${screen.id}`)
    expect(i18n.global.te(screen.titleKey), screen.titleKey).toBe(true)
  }
})

it('loads each screen only when it is asked for, and every one loads', async () => {
  const loaded = await Promise.all(SCREENS.map(screen => screen.load()))

  expect(loaded.every(module => Boolean(module.default))).toBe(true)
})

it('has a route for each screen, and sends anything else to the first', async () => {
  const router = createAppRouter(createMemoryHistory())

  expect(router.getRoutes().map(route => route.name).filter(Boolean)).toEqual(SCREENS.map(screen => screen.id))
  await router.push('/nowhere/at/all')
  expect(router.currentRoute.value.fullPath).toBe('/flight')
  await router.push('/')
  expect(router.currentRoute.value.fullPath).toBe('/flight')
})
