import { expect, it } from 'vitest'
import { MOTOR_PARAMS, PWM_TYPES, outputRows, parseFraction, spinProblem } from './motors'

it('lists the four parameters of the page, and names each protocol once', () => {
  expect(MOTOR_PARAMS).toEqual(['MOT_PWM_TYPE', 'MOT_SPIN_ARM', 'MOT_SPIN_MIN', 'MOT_SPIN_MAX'])
  expect(new Set(PWM_TYPES.map(type => type.value)).size).toBe(PWM_TYPES.length)
  expect(PWM_TYPES.find(type => type.value === 6)?.label).toBe('DShot600')
})

it('takes a spin threshold as a fraction from 0 to 1, with a comma or a point, and nothing else', () => {
  expect(parseFraction('0.15')).toBe(0.15)
  expect(parseFraction(' 0,95 ')).toBe(0.95)
  expect(parseFraction('0')).toBe(0)
  expect(parseFraction('1')).toBe(1)

  for (const text of ['', ' ', '1.01', '-0.1', 'abc', '15 %', 'NaN', 'Infinity']) {
    expect(parseFraction(text), text).toBeNull()
  }
})

it('says the thresholds are out of order when arm is not below min, or min is not below max', () => {
  expect(spinProblem(0.1, 0.15, 0.95)).toBeNull()
  expect(spinProblem(0.15, 0.15, 0.95)).toBe('order')
  expect(spinProblem(0.2, 0.15, 0.95)).toBe('order')
  expect(spinProblem(0.1, 0.95, 0.95)).toBe('order')
  expect(spinProblem(0.1, 0.99, 0.95)).toBe('order')
  // a threshold the vehicle does not have is not judged
  expect(spinProblem(null, 0.15, 0.95)).toBeNull()
  expect(spinProblem(0.1, null, 0.95)).toBeNull()
  expect(spinProblem(0.1, 0.15, null)).toBeNull()
})

it('makes a row of each output that is used, numbered across the ports, and none of an output that is not', () => {
  expect(outputRows(undefined)).toEqual([])
  const rows = outputRows({
    ports: [{ port: 0, outputs: [1000, 0, 1500, 2000] }, { port: 1, outputs: [1250] }],
    ageMs: 100,
  })
  expect(rows.map(row => row.output)).toEqual([1, 3, 4, 17])
  expect(rows.map(row => row.pulse)).toEqual([1000, 1500, 2000, 1250])
  expect(rows.map(row => row.fraction)).toEqual([0, 0.5, 1, 0.25])
  // a pulse outside 1000 to 2000 is held to the bar
  expect(outputRows({ ports: [{ port: 0, outputs: [900, 2300] }], ageMs: 0 }).map(row => row.fraction)).toEqual([0, 1])
})
