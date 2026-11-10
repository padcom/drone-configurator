// End to end, in the real window: the Description block of the parameter detail. ArduPilot's own definition file
// (apm.pdef.json) is loaded through the Load metadata button, and the block shows the long text and the facts of the selected
// parameter in a box that scrolls; without metadata it says where descriptions come from.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'

const LONG = 'The minimum alt above home the vehicle will climb to before returning. '.repeat(40)
const PDEF = {
  json: { version: 0 },
  ArduCopter: {
    RTL_ALT: {
      Increment: '1',
      Range: { high: '300000', low: '30' },
      Units: 'cm',
      description: LONG.trim(),
      displayName: 'RTL Altitude',
      RebootRequired: 'True',
    },
  },
}

let app: E2eApp
let files = ''

beforeAll(async () => {
  // Instead of the native file dialog, which a test cannot click (the backend's FileChooser).
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
})

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

describe('the description of the selected parameter', () => {
  it('says where descriptions come from while no metadata is loaded', async () => {
    await app.click('tr[data-id="RTL_ALT"]')

    // The heading is drawn in capitals by the stylesheet.
    expect(await app.waitForText('#param-description', /Load the parameter metadata/u)).toMatch(/Description/iu)
  })

  it('shows the long text and the facts of an apm.pdef.json, in a box that scrolls on its own', async () => {
    writeFileSync(join(files, 'open.json'), JSON.stringify(PDEF))
    await app.click('#metadata-button')
    const text = await app.waitForText('#param-description .text', /The minimum alt above home/u)
    const rows = await app.text('#param-description .rows')

    expect(text.length).toBeGreaterThan(2000)
    expect(rows).toMatch(/Range\s*30 to 300000 cm/u)
    expect(rows).toMatch(/Restart\s*The vehicle must be restarted/u)
    const box = await app.evaluate<boolean>(`(() => {
      const body = document.querySelector('#param-description .body')

      return body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY === 'auto'
    })()`)
    expect(box).toBe(true)
  })
})

describe('the column of the detail', () => {
  it.each([[1440, 900], [1440, 768]])('keeps Write in view at %i x %i, only the description scrolling', async (w, h) => {
    await app.devtools('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    const measured = await app.evaluate<{ buttonBottom: number, columnScrolls: boolean, bodyScrolls: boolean }>(`(() => {
      const column = document.querySelector('.detail')
      const body = document.querySelector('#param-description .body')

      return {
        buttonBottom: document.querySelector('#write-staged').getBoundingClientRect().bottom,
        columnScrolls: column.scrollHeight > column.clientHeight,
        bodyScrolls: body.scrollHeight > body.clientHeight,
      }
    })()`)

    expect(measured.buttonBottom).toBeLessThanOrEqual(h)
    expect(measured.columnScrolls).toBe(false)
    expect(measured.bodyScrolls).toBe(true)
  })
})

describe('a value the metadata finds unusual', () => {
  it('is warned about, beside the field, and can still be written', async () => {
    await app.fill('#draft', '10')

    expect(await app.waitForText('#draft-warning', /Outside the usual range 30–300000 cm/u)).toContain('cm')
    expect(await app.evaluate<boolean>(`document.querySelector('#write').disabled`)).toBe(false)
    expect(await app.evaluate<string>(`document.querySelector('#draft').getAttribute('aria-describedby')`)).toBe('draft-warning')
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
