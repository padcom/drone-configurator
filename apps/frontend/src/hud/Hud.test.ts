import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Telemetry } from '../generated/app'
import { withI18n } from '../testing'
import Hud from './Hud.vue'
import { hudModel } from './model'

const FLYING: Telemetry = {
  armed: true,
  mode: 'AUTO',
  heartbeatAgeMs: 100,
  attitude: { roll: 5, pitch: 3, yaw: 90, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0, ageMs: 100 },
  speed: { airspeed: 8, groundspeed: 8, climb: 0.5, throttle: 50, heading: 90, ageMs: 100 },
  position: { lat: 47, lon: 8, altitude: 500, relativeAltitude: 60, vx: 0, vy: 0, vz: 0, ageMs: 100 },
}

/**
 * The HUD for some telemetry.
 *
 * @param now the telemetry, or undefined
 * @param reconnecting whether the link is being brought back
 * @returns the mounted HUD
 */
function hud(now: Telemetry | undefined, reconnecting = false) {
  return mount(Hud, { ...withI18n, props: { model: hudModel(now, reconnecting), reconnecting } })
}

it('draws the horizon rolled and pitched as the vehicle is, and the boxes with the numbers', () => {
  const wrapper = hud(FLYING)
  const groups = wrapper.findAll('.horizon g').map(group => group.attributes('transform'))

  expect(groups).toEqual(['rotate(-5 210 145)', 'translate(0 15)'])
  expect(wrapper.findAll('text.number').map(text => text.text())).toEqual(['8.0', '60', '090°'])
  expect(wrapper.findAll('text.unit').map(text => text.text())).toEqual(['m/s', 'm'])
  expect(wrapper.findAll('line.rung')).toHaveLength(4)
})

it('is an image with the numbers in words for a screen reader', () => {
  const svg = hud(FLYING).get('svg')

  expect(svg.attributes('role')).toBe('img')
  expect(svg.attributes('aria-label'))
    .toBe('Attitude: roll 5 degrees, pitch 3 degrees, speed 8.0 metres a second, altitude 60 metres')
})

it('shows dashes, no horizon and the words "not reported" when the vehicle has reported nothing', () => {
  const wrapper = hud(undefined)

  expect(wrapper.findAll('text.number').map(text => text.text())).toEqual(['—', '—', '—'])
  expect(wrapper.find('.horizon').exists()).toBe(false)
  expect(wrapper.get('svg').attributes('aria-label')).toBe(
    'Attitude: roll not reported degrees, pitch not reported degrees, speed not reported metres a second, '
    + 'altitude not reported metres',
  )
  expect(wrapper.find('.tag').exists()).toBe(false)
})

it('does not draw the horizon with only one of the two angles', () => {
  const half = { ...FLYING, attitude: undefined, roll: 5 }

  expect(hud(half).find('.horizon').exists()).toBe(false)
})

it('is hatched, and says "last heard", when the heartbeat has gone quiet', () => {
  const wrapper = hud({ ...FLYING, heartbeatAgeMs: 5000 })

  expect(wrapper.get('svg').classes()).toContain('silent')
  expect(wrapper.find('pattern').exists()).toBe(true)
  expect(wrapper.get('.tag').text()).toBe('last heard')
})

it('says "last heard, reconnecting" while the link is being brought back', () => {
  const wrapper = hud(FLYING, true)

  expect(wrapper.get('.tag').text()).toBe('last heard, reconnecting')
})

it('has no literal colours: the picture takes them from the stylesheet (tokens)', () => {
  const html = hud({ ...FLYING, heartbeatAgeMs: 5000 }).html()

  expect(html).not.toMatch(/#[\da-f]{3,8}\b/iu)
  expect(html).not.toMatch(/\b(?:fill|stroke)="(?!none|url)/u)
})
