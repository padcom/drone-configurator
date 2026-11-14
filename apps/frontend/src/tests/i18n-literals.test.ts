// @vitest-environment node
// The lint of the templates (no-raw-text) cannot see the words that code makes: the question of a write, the reason a file was
// refused, a notice of a failed setting. Those come from `say()` (src/i18n/say.ts) and the locale files, so that every
// language has them. This test finds a string literal in the plain modules (composables, lib, state, backend) that is a sentence
// of English (two or more words), which is what a message that bypassed the locale files looks like. A literal that is not for
// the user (a key, a code, a developer's error) is named in ALLOWED, with the reason.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TUNE_FUNCTIONS } from '@/lib/tune/table'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const FOLDERS = ['composables', 'lib', 'state', 'backend']

/** Literals that are not for the user: the file (under src) and a part of the literal. */
const ALLOWED: [string, string][] = [
  ['composables/useConfigurator.ts', 'has not been called'],
  ['lib/commands/registry.ts', 'is already registered'],
  ['composables/useCommands.ts', 'not wired to the backend'],
  ['lib/app/keymap.ts', 'Ctrl Enter'], // the name of a key, as it is printed on it: not translated
  // The names ArduPilot gives the values of its own parameters (its frames and serial protocols): the vehicle's vocabulary,
  // shown as it says them, like a flight mode's name or a parameter's.
  ...[
    'Scripting Matrix', 'Dynamic Scripting Matrix', 'Custom 4.1 and older',
  ].map((name): [string, string] => ['lib/setup/frame.ts', name]),
  // What the radio knob can tune (ArduPilot's own `@Values` of TUNE).
  ...TUNE_FUNCTIONS.map((one): [string, string] => ['lib/tune/table.ts', one.label]),
  ...[
    'Frsky SPort',
    'Alexmos Gimbal Serial',
    'FrSky SPort Passthrough (OpenTX)',
    'Volz servo out',
    'SBus servo out',
    'ESC Telemetry',
    'Devo Telemetry',
    'NMEA Output',
    'EFI Serial',
    'Crossfire VTX',
    'DJI FPV',
    'MAVLink High Latency',
    'IRC Tramp',
    'DDS XRCE',
    'i-BUS Telemetry',
  ].map((name): [string, string] => ['lib/setup/serial.ts', name]),
]

/**
 * The files of a folder, deep, that are code and not tests.
 *
 * @param directory the folder
 * @returns their paths
 */
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return files(path)
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

/**
 * The code of a module without its comments.
 *
 * @param text the module
 * @returns the text with the comments blanked
 */
const withoutComments = (text: string): string => text.replaceAll(/\/\*[^]*?\*\//gu, '').replaceAll(/^\s*\/\/.*$/gmu, '')

/**
 * The string literals of a module that read like English: two words of letters, one after the other.
 *
 * @param text the module, without comments
 * @returns the literals
 */
function sentences(text: string): string[] {
  const literals = text.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gu) ?? []

  return literals
    .map(literal => literal.slice(1, -1).replaceAll(/\$\{[^}]*\}/gu, ' '))
    .filter(literal => /(?:^|[^\w])[A-Za-z']{3,} [A-Za-z']{2,}(?:[^\w]|$)/u.test(literal))
    // A regular expression or a path is not a sentence.
    .filter(literal => !/[\\^$[\]|]|\.\w+$|^[./@]/u.test(literal))
}

/**
 * The sentences of English in the modules of a folder, that are not allowed.
 *
 * @param folder the folder under src
 * @returns `file: literal` for each
 */
function foundIn(folder: string): string[] {
  const allowed = (name: string, literal: string) => ALLOWED.some(([where, part]) => where === name && literal.includes(part))

  return files(join(SRC, folder)).flatMap(file => {
    // Posix separators and LF line ends, whatever the checkout made of them (Windows has backslashes and CRLF).
    const name = relative(SRC, file).split(sep).join('/')

    const found = sentences(withoutComments(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')))

    return found.filter(literal => !allowed(name, literal)).map(literal => `${name}: ${literal}`)
  })
}

describe.each(FOLDERS)('the plain modules of %s', folder => {
  it('have no sentence of English in a string literal: what a person reads comes from say() and the locale files', () => {
    // The failure message lists each offending file and literal.
    expect(foundIn(folder).join('\n')).toBe('')
  })
})
