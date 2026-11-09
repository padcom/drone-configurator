import { expect, it } from 'vitest'
import { type RouteLocationNormalized, createMemoryHistory } from 'vue-router'
import { createAppRouter } from './router'

/**
 * Where the router would scroll to for `path`.
 *
 * @param router the router
 * @param path the screen
 * @returns the scroll position it asks for
 */
function scrollTo(router: ReturnType<typeof createAppRouter>, path: string) {
  const target = router.resolve(path) as RouteLocationNormalized

  return router.options.scrollBehavior?.(target, target, null)
}

it('starts a screen at the top the first time it is shown', async () => {
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/flight')

  expect(scrollTo(router, '/parameters')).toEqual({ top: 0 })
})

it('gives a screen back the scroll position it was left at', async () => {
  let position = 0
  const router = createAppRouter(createMemoryHistory(), () => position)
  await router.push('/parameters')
  position = 420
  await router.push('/flight')
  position = 35
  await router.push('/parameters')

  expect(scrollTo(router, '/parameters')).toEqual({ top: 420 })
  // And the one it came from is remembered as well.
  await router.push('/flight')
  expect(scrollTo(router, '/flight')).toEqual({ top: 35 })
})

it('remembers each screen on its own', async () => {
  let position = 0
  const router = createAppRouter(createMemoryHistory(), () => position)
  await router.push('/parameters')
  position = 300
  await router.push('/logs')
  position = 90
  await router.push('/flight')

  expect(scrollTo(router, '/parameters')).toEqual({ top: 300 })
  expect(scrollTo(router, '/logs')).toEqual({ top: 90 })
  expect(scrollTo(router, '/setup')).toEqual({ top: 0 })
})
