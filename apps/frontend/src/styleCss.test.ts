// @vitest-environment node
// What style.css says about the Parameters layout and the frame's one <main>, read from the stylesheet.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('style.css', import.meta.url)), 'utf8').replaceAll(/\/\*[^]*?\*\//gu, '')

it('lays the Parameters screen out in two columns, and stacks them below 700 px', () => {
  expect(css).toMatch(/\.params-layout\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*2fr 1fr/u)
  expect(css).toMatch(/@media \(width < 700px\)\s*\{\s*\.params-layout\s*\{\s*grid-template-columns:\s*1fr/u)
})

it('has no rule for a bare main element: the one <main> is the frame\'s, and it is not a grid', () => {
  expect(css).not.toMatch(/(?:^|[\s,{}])main\s*[,{]/u)
})
