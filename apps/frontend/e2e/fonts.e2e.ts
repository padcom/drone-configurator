// End to end, in the real window: the bundled typefaces load from the app's own files (the host's content security policy
// lets them through), so the interface does not fall back to a system font.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let app: E2eApp

/**
 * How many faces of a font the page loaded for a CSS font shorthand.
 *
 * @param font the shorthand, for example `600 14px "IBM Plex Sans"`
 * @returns the number of faces that are loaded
 */
function loaded(font: string): Promise<number> {
  const count = 'faces => faces.filter(f => f.status === \'loaded\').length'

  return app.evaluate<number>(`document.fonts.load(${JSON.stringify(font)}).then(${count})`)
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
}, 60_000)

afterAll(async () => {
  await app?.close()
})

describe('the fonts in the window', () => {
  it.each(['400', '500', '600', '700'])('loads IBM Plex Sans in weight %s', async weight => {
    expect(await loaded(`${weight} 14px "IBM Plex Sans"`)).toBe(1)
  })

  it.each(['400', '500', '600'])('loads IBM Plex Mono in weight %s', async weight => {
    expect(await loaded(`${weight} 14px "IBM Plex Mono"`)).toBe(1)
  })

  it('draws the page in IBM Plex Sans', async () => {
    expect(await app.evaluate<string>('getComputedStyle(document.body).fontFamily')).toMatch(/^"?IBM Plex Sans/u)
  })
})
