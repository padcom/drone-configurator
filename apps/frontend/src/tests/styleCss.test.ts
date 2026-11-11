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
  const file = fileURLToPath(new URL(`../assets/styles/${name}`, import.meta.url))

  return readFileSync(file, 'utf8').replaceAll(/\/\*[^]*?\*\//gu, '')
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

it('has a list and a detail that fill the width without the groups column (the setting "Show parameter groups" off)', () => {
  // Nothing in the layout counts on the groups: the list grows (999) and shrinks to nothing, the detail has its own basis, and
  // the star column's width belongs to its <col>, which is not there without the stars.
  expect(params).toMatch(/\.params\s*\{[^}]*flex:\s*999 1 460px;[^}]*min-width:\s*0;/u)
  expect(params).toMatch(/\.detail\s*\{[^}]*flex:\s*1 1 330px;[^}]*min-width:\s*0;/u)
  expect(params).toMatch(/\.param-scroll col\.col-star\s*\{\s*width:\s*44px;/u)
})

it('lays the table out with a fixed layout, the first columns in `ch`, the description on one line', () => {
  const cut = String.raw`overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;`
  const meaning = new RegExp(String.raw`\.param-scroll table\.described \.meaning\s*\{[^}]*${cut}`, 'u')

  // Fixed: only the rows in view are drawn, so the widths cannot come from the cells (and the browser measures no text).
  expect(params).toMatch(/\.param-scroll table\s*\{[^}]*--cell-padding:\s*28px;[^}]*table-layout:\s*fixed;/u)
  // The column widths are in `ch`, which is the width of a mono character only in the mono face: the <col> is set in it.
  // The name cells are set in the value-sm size and the value cells in none (the table's own): each <col> has its cells' size.
  expect(params).toMatch(/\.param-scroll col\s*\{[^}]*font-family:\s*var\(--font-mono\);/u)
  expect(params).toMatch(/\.param-scroll col\.col-name\s*\{[^}]*font-size:\s*var\(--font-size-value-sm\);/u)
  expect(params).not.toMatch(/col\.col-value\s*\{[^}]*font-size/u)
  expect(params).toMatch(/\.param-scroll \.name\s*\{[^}]*font-size:\s*var\(--font-size-value-sm\);/u)
  expect(params).not.toMatch(/\.param-scroll td\.num\s*\{[^}]*font-size/u)
  expect(params).toMatch(meaning)
  // The rows keep the one height that the windowing counts on (ROW_PX in ParamTable.vue), and a spacer has none of its own.
  expect(params).toMatch(/\.param-scroll tbody tr\s*\{[^}]*height:\s*44px;/u)
  expect(params).toMatch(/\.param-scroll tbody tr\.spacer\s*\{[^}]*pointer-events:\s*none;[^}]*border-top:\s*0;/u)
})

it('has one thin scrollbar for every scrollable box, and one colour of line under every cell of a row', () => {
  // The global rule is the one of the groups' list, which had it alone: the others (the parameter list, the detail, the
  // dialogs, the messages) take it, and a class that says otherwise (the rail hides its own scrollbar) is more specific.
  expect(style).toMatch(/\*\s*\{\s*scrollbar-width:\s*thin;\s*\}/u)
  expect(frame).toMatch(/scrollbar-width:\s*none;/u)
  // The cells' own line is the table's, not the page's mix of the text colour (which differs with the cell's text and over the
  // tint of the selected row).
  expect(params).toMatch(/\.param-scroll th,\s*\.param-scroll td\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border\);/u)
})

it('has no ring round the list and no outline on a row; the left bar of the selected row is the focus alone', () => {
  // The leader wants no ring round the whole list (it was clipped at the top, too), and no outline on the row: the focus
  // indicator is the full 4 px accent bar at the left edge of the selected row, with a stronger tint, while the list has the
  // focus. Without the focus the selected row has only its soft tint: no bar, no shadow, no border at its left edge.
  const declarations = (selector: string) => {
    const block = new RegExp(String.raw`${selector.replaceAll(/[.*]/gu, String.raw`\$&`)}\s*\{(?<body>[^}]*)\}`, 'u').exec(params)

    return block?.groups?.body ?? ''
  }

  expect(params).not.toMatch(/\.param-scroll[^{]*\{[^}]*outline:\s*2px/u)
  expect(declarations('.param-scroll table:focus')).toMatch(/outline:\s*none/u)
  const unfocused = declarations('.param-scroll tbody tr.selected')
  const focused = declarations('.param-scroll table:focus tbody tr.selected')
  expect(unfocused).toMatch(/background:/u)
  expect(focused).toMatch(/background:/u)
  expect(focused).not.toBe(unfocused)
  // The bar is under the focus selector, full and 4 px; nothing else of the selected row has a bar, an outline or a shadow.
  expect(declarations('.param-scroll table:focus tbody tr.selected > :first-child'))
    .toMatch(/box-shadow:\s*inset 4px 0 0 var\(--color-accent\);/u)
  expect(declarations('.param-scroll tbody tr.selected')).not.toMatch(/outline|box-shadow|border/u)
  expect(declarations('.param-scroll tbody tr.selected > :first-child')).toBe('')
  expect(params.match(/box-shadow/gu)).toHaveLength(1)
  expect(params).not.toMatch(/tr\.selected[^{]*\{[^}]*outline/u)
})

it('sets the name of the selected row heavier, focused or not: a mark that is not a colour', () => {
  expect(params).toMatch(/\.param-scroll tbody tr\.selected \.name\s*\{\s*font-weight:\s*600;\s*\}/u)
})

it('has a question that scrolls inside the dialog, so that the hundreds of lines of a bulk reset fit the window', () => {
  const dialog = sheet('dialog.css')

  expect(dialog).toMatch(/\.safety-what\s*\{[^}]*max-height:\s*40vh;[^}]*overflow-y:\s*auto;[^}]*white-space:\s*pre-line;/u)
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
  const dialog = sheet('dialog.css')

  expect(dialog).toMatch(/\.safety-what\s*\{[^}]*max-height:\s*40vh;[^}]*overflow-y:\s*auto;[^}]*white-space:\s*pre-line/u)
})

it('has no rule for a bare main element: the one <main> is the frame\'s, and it is not a grid', () => {
  expect(style).not.toMatch(/(?:^|[\s,{}])main\s*[,{]/u)
  expect(style).not.toContain('.params-layout')
})
