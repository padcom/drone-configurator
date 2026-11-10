// @vitest-environment node
// What the stylesheets say about the Parameters layout and the frame's one <main>, read from the files.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

/**
 * A stylesheet of the application, without its comments.
 *
 * @param name the file's name
 * @returns its text
 */
function sheet(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8').replaceAll(/\/\*[^]*?\*\//gu, '')
}

const style = sheet('style.css')
const params = sheet('params.css')
const frame = sheet('frame.css')
const fly = sheet('fly.css')

it('lays the Parameters screen out in three columns that wrap, each scrolling on its own from 1000 px', () => {
  expect(params).toMatch(/\.params-layout\s*\{\s*display:\s*flex;\s*flex-wrap:\s*wrap;/u)
  expect(params).toMatch(/@media \(width >= 1000px\)\s*\{\s*\.params-layout\s*\{\s*flex-wrap:\s*nowrap;\s*height:\s*100%;/u)
  expect(params).toMatch(/\.param-groups,\s*\.params,\s*\.detail\s*\{[^}]*overflow-y:\s*auto/u)
})

it('keeps the header of the table in view while the rows scroll', () => {
  expect(params).toMatch(/\.param-scroll thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/u)
})

it('lets the Parameters screen fill the area of the frame, like Fly', () => {
  expect(frame).toMatch(/\.app-main > :not\(\.fly, \.params-layout\)\s*\{\s*margin:/u)
})

it('keeps the display and the cards of the Fly aside in place and scrolls only the messages list, from 1000 px', () => {
  const wide = fly.slice(fly.indexOf('@media (width >= 1000px)'))

  expect(wide).toMatch(/\.fly-aside\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/u)
  expect(wide).toMatch(/\.fly-aside > \.hud,\s*\.fly-aside > \.fly-cards\s*\{\s*flex:\s*none;/u)
  expect(wide).toMatch(/\.fly-aside > \.messages\s*\{[^}]*flex:\s*1 1 0;/u)
  expect(wide).toMatch(/\.messages \.message-list\s*\{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*0;[^}]*max-height:\s*none;/u)
})

it('gives the messages list a height of its own in the stacked layout, below 1000 px', () => {
  const stacked = fly.slice(0, fly.indexOf('@media (width >= 1000px)'))

  expect(stacked).toMatch(/\.message-list\s*\{[^}]*max-height:\s*20rem;[^}]*overflow-y:\s*auto/u)
})

it('has no rule for a bare main element: the one <main> is the frame\'s, and it is not a grid', () => {
  expect(style).not.toMatch(/(?:^|[\s,{}])main\s*[,{]/u)
  expect(style).not.toContain('.params-layout')
})
