// The messages of the Signing page (#33), which load with the page and not with the application: every language's messages are in
// the first JavaScript the page loads (initialJs, apps/frontend/budgets.json), and a page that most people open once need not add
// to it. They are in src/i18n/locales/signing/<language>.json, precompiled like the others, and merged into the messages of each
// language the first time the page is loaded (the route's `load`, in src/screens/registry.ts).
import { type Language, i18n } from './i18n'

/** The files, by path; each is loaded when it is asked for. */
const FILES = import.meta.glob<{ default: Record<string, unknown> }>('./locales/signing/*.json')

/** Whether they were merged. */
let merged: Promise<void> | null = null

/**
 * Merges the messages of one language.
 *
 * @param path its file
 * @param load loads it
 */
async function mergeOne(path: string, load: () => Promise<{ default: Record<string, unknown> }>): Promise<void> {
  const language = path.replace(/^.*\/(?<code>[^/]+)\.json$/u, '$<code>') as Language
  const messages = await load()
  i18n.global.mergeLocaleMessage(language, messages.default)
}

/** Merges every language's messages. */
async function mergeAll(): Promise<void> {
  await Promise.all(Object.entries(FILES).map(([path, load]) => mergeOne(path, load)))
}

/**
 * Loads the Signing page's messages into every language, once.
 *
 * @returns when they are there
 */
export function loadSigningMessages(): Promise<void> {
  merged ??= mergeAll()

  return merged
}

