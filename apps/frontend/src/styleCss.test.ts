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

it('lays the table with metadata out with a fixed layout, the first two columns in `ch`, the description on one line', () => {
  const cut = String.raw`overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;`
  const meaning = new RegExp(String.raw`\.param-scroll table\.described \.meaning\s*\{[^}]*${cut}`, 'u')

  // Fixed, so that a switch back to the screen does not measure the text of every row again (120 ms on x64, 270 ms on arm64).
  expect(params).toMatch(/\.param-scroll table\.described\s*\{[^}]*--cell-padding:\s*28px;[^}]*table-layout:\s*fixed;/u)
  // The column widths are in `ch`, which is the width of a mono character only in the mono face: the <col> is set in it.
  expect(params).toMatch(/table\.described col\.col-text\s*\{[^}]*font-family:\s*var\(--font-mono\);/u)
  expect(params).toMatch(meaning)
  // The rows keep one height, and the table without metadata has no rule of its own (an auto layout, as it was).
  expect(params).toMatch(/\.param-scroll tbody tr\s*\{[^}]*height:\s*44px;/u)
  expect(params.replace(/\.param-scroll table\.described\s*\{[^}]*\}/u, '')).not.toMatch(/table-layout/u)
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

it('gives the settings notice, which is always in the page, no box until it has text (no dark bar under the top bar)', () => {
  expect(style).toMatch(/#settings-notice\s*\{\s*margin:\s*0;\s*\}/u)
  expect(style).toMatch(/#settings-notice\.has-text\s*\{[^}]*margin:/u)
  expect(style).not.toMatch(/#settings-notice\s*\{[^}]*(?:padding|height|background|border)/u)
})

it('makes the detail a column from 1000 px: the description fills the rest, the changes are pinned at the bottom', () => {
  const wide = params.slice(params.indexOf('@media (width >= 1000px)'))

  expect(wide).toMatch(/\.detail\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*\}/u)
  expect(wide).toMatch(/\.detail > \*\s*\{\s*flex:\s*none;/u)
  expect(wide).toMatch(/\.detail > \.param-description\s*\{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*10rem;/u)
  const body = /\.detail > \.param-description \.body\s*\{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*0;[^}]*max-height:\s*none;/u
  expect(wide).toMatch(body)
  expect(wide).toMatch(/\.detail > \.staged\s*\{\s*margin-top:\s*auto;/u)
})

it('keeps a height for the description below 1000 px, and the list of changes scrolls so that Write stays in view', () => {
  const detail = sheet('paramDetail.css')
  const stacked = params.slice(0, params.indexOf('@media (width >= 1000px)'))

  expect(stacked).not.toMatch(/\.param-description/u)
  expect(detail).toMatch(/\.param-description \.body\s*\{[^}]*max-height:\s*16rem;[^}]*overflow-y:\s*auto/u)
  expect(detail).toMatch(/\.staged-list\s*\{[^}]*max-height:\s*10rem;[^}]*overflow:\s*hidden auto/u)
})

it('lists the queued changes densely with no dividing lines, the trash can a 44 px target without a tall row', () => {
  const detail = sheet('paramDetail.css')
  const row = /\.staged-row\s*\{(?<body>[^}]*)\}/u.exec(detail)?.groups?.body ?? ''

  expect(row).toMatch(/display:\s*grid;/u)
  expect(row).not.toMatch(/border|padding/u)
  expect(detail).not.toMatch(/\.staged-row[^{]*\{[^}]*border-bottom/u)
  expect(detail).toMatch(/\.staged-row \.discard\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*margin:\s*-12px/u)
})

it('lays the related parameters out a line each in two columns, the text cut short with an ellipsis', () => {
  const detail = sheet('paramDetail.css')
  const columns = /grid-template-columns:\s*max-content minmax\(0, 1fr\);[^}]*line-height:\s*1\.25/u

  expect(detail).toMatch(new RegExp(`\\.related-line\\s*\\{[^}]*${columns.source}`, 'u'))
  expect(detail).toMatch(/\.related-text\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/u)
})

it('caps a long question of the confirmation, which scrolls inside the dialog', () => {
  const dialog = sheet('kit/dialog.css')

  expect(dialog).toMatch(/\.safety-what\s*\{[^}]*max-height:\s*40vh;[^}]*overflow-y:\s*auto;[^}]*white-space:\s*pre-line/u)
})

it('has no rule for a bare main element: the one <main> is the frame\'s, and it is not a grid', () => {
  expect(style).not.toMatch(/(?:^|[\s,{}])main\s*[,{]/u)
  expect(style).not.toContain('.params-layout')
})
