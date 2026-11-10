// Searching the parameters by name and by what they do (from the metadata's descriptions), from plain values (no DOM). A query is
// split into words at spaces and underscores, and every word must be in the parameter's name or description. The results are in
// ranks: the exact name, a name that starts with the query, a name that has all the words, name and description together, the
// description alone; and, when there are few of those, a "close match": every word is found or is a typo away (one edit) from a
// word of the name or the description. The text that is searched is made once for a list of parameters and its metadata (the
// index), not for each key typed, and does not depend on the values (a telemetry tick or a write does not rebuild it).
import type { ParamMeta } from './metadata'

/** What is searched of one parameter, in lower case. */
interface Entry {
  /** The parameter's name. */
  id: string
  /** The name, lower case. */
  name: string
  /** The name, the short description and the long one, lower case, one text to look in. */
  all: string
  /** The long description as it is written (where a snippet is taken from), or the short one when there is no long one. */
  text: string
}

/** The text of a list of parameters, ready to be searched. */
export interface SearchIndex {
  /** One entry for each parameter, in the list's order. */
  entries: Entry[]
  /** Whether any parameter has a description (without descriptions a search is by name only). */
  described: boolean
  /** The names the index was made for, to tell whether a new list is the same one. */
  ids: string[]
  /** The metadata the index was made for. */
  metadata: ReadonlyMap<string, ParamMeta>
}

/** Why a parameter is a result. */
export type Reason = 'name' | 'description' | 'close'

/** One result. */
export interface SearchHit {
  /** The parameter's name. */
  id: string
  /** Why it matches: its name, its description (also with the name), or a close match (a typo away). */
  reason: Reason
  /** A piece of the description around the first word found in it, for a result that is there by its description. */
  snippet?: string
}

/** Fewer strict results than this, and the close matches are looked for too. */
export const CLOSE_BELOW = 5

/** Words this short or shorter are never taken as a typo of another (too many words are one edit from them). */
const MIN_TYPO_WORD = 3

/** How much of a description is shown before and after the word found in it. */
const BEFORE = 30
const AFTER = 70

/**
 * The words of a query.
 *
 * @param query what the user typed
 * @returns the words in lower case: at spaces and underscores, none empty
 */
export function tokensOf(query: string): string[] {
  return query.toLowerCase().split(/[\s_]+/u).filter(token => token !== '')
}

/**
 * The short and the long description of a parameter.
 *
 * @param meta what the metadata says about it, if anything
 * @returns the two texts, empty when it has none
 */
function descriptionsOf(meta: ParamMeta = {}): [string, string] {
  const { description = '', longDescription = '' } = meta

  return [description, longDescription]
}

/**
 * What is searched of one parameter.
 *
 * @param id the parameter's name
 * @param descriptions its short and its long description
 * @returns its entry
 */
function entryOf(id: string, descriptions: [string, string]): Entry {
  const [short, long] = descriptions
  const name = id.toLowerCase()

  return { id, name, all: `${name} ${short} ${long}`.toLowerCase(), text: long === '' ? short : long }
}

/**
 * Makes the index of a list of parameters. Nothing here depends on a value, so the same ids and the same metadata give the same
 * index, which `indexFor` reuses.
 *
 * @param ids the parameters' names, in order
 * @param metadata what the metadata says about them
 * @returns the index
 */
export function buildIndex(ids: string[], metadata: ReadonlyMap<string, ParamMeta>): SearchIndex {
  const entries = ids.map(id => entryOf(id, descriptionsOf(metadata.get(id))))

  return { entries, described: entries.some(entry => entry.text !== ''), ids, metadata }
}

/**
 * Whether an index was made for these names and this metadata.
 *
 * @param index the index
 * @param ids the parameters' names
 * @param metadata the metadata
 * @returns true if it was
 */
function isFor(index: SearchIndex, ids: string[], metadata: ReadonlyMap<string, ParamMeta>): boolean {
  return index.metadata === metadata && index.ids.length === ids.length && index.ids.every((id, i) => id === ids[i])
}

/**
 * The index for a list: the one that was made last time when it is for the same names and the same metadata.
 *
 * @param before the index made last time, if any
 * @param ids the parameters' names
 * @param metadata the metadata
 * @returns an index for them
 */
export function indexFor(before: SearchIndex | null, ids: string[], metadata: ReadonlyMap<string, ParamMeta>): SearchIndex {
  return before && isFor(before, ids, metadata) ? before : buildIndex(ids, metadata)
}

/**
 * Whether two words are the same or one edit apart (one letter added, taken out or changed).
 *
 * @param a one word
 * @param b the other
 * @returns true if they are within one edit
 */
export function withinOneEdit(a: string, b: string): boolean {
  const same = [...a].findIndex((letter, i) => letter !== b[i])
  const at = same === -1 ? Math.min(a.length, b.length) : same
  const [rest, other] = [a.slice(at), b.slice(at)]
  const edits = [rest.slice(1) === other.slice(1), rest === other.slice(1), rest.slice(1) === other]

  return Math.abs(a.length - b.length) <= 1 && edits.some(Boolean)
}

/**
 * The rank of a parameter for the words, or -1 when it is not a strict match.
 *
 * @param entry the parameter
 * @param tokens the words
 * @returns 0 the exact name, 1 the name starts with the query, 2 the name has all the words, 3 name and description together,
 * 4 the description alone
 */
function rankOf(entry: Entry, tokens: string[]): number {
  const joined = tokens.join('_')
  const ranks = [
    entry.name === joined,
    entry.name.startsWith(joined),
    tokens.every(token => entry.name.includes(token)),
    tokens.some(token => entry.name.includes(token)),
    true,
  ]

  return tokens.every(token => entry.all.includes(token)) ? ranks.indexOf(true) : -1
}

/**
 * A piece of the text around the first of the words that is in it.
 *
 * @param text the description, as it is written
 * @param tokens the words (lower case)
 * @returns the piece, with an ellipsis where it is cut, or nothing when no word is in the text
 */
function snippetOf(text: string, tokens: string[]): string | undefined {
  const lower = text.toLowerCase()
  const at = Math.min(...tokens.map(token => lower.indexOf(token)).filter(index => index >= 0))
  if (!Number.isFinite(at)) {
    return undefined
  }
  const [start, end] = [Math.max(0, at - BEFORE), Math.min(text.length, at + AFTER)]

  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * Whether a word is in the parameter, or is one edit from a word of its name or its description (a word that is long enough to
 * be a typo of another).
 *
 * @param entry the parameter
 * @param words the words of its name and its description
 * @param token the word searched for
 * @returns true if it is found
 */
function found(entry: Entry, words: string[], token: string): boolean {
  return entry.all.includes(token) || (token.length > MIN_TYPO_WORD && words.some(word => withinOneEdit(word, token)))
}

/**
 * Whether every word is found in the parameter or is a typo of a word in it.
 *
 * @param entry the parameter
 * @param tokens the words
 * @returns true if all the words are found
 */
function isClose(entry: Entry, tokens: string[]): boolean {
  const words = entry.all.split(/[^a-z0-9]+/u)

  return tokens.every(token => found(entry, words, token))
}

/**
 * The strict results: every word is in the name or the description.
 *
 * @param index the index
 * @param tokens the words
 * @returns the results, by rank, and in the list's order within a rank
 */
function strictHits(index: SearchIndex, tokens: string[]): SearchHit[] {
  const ranked = index.entries.map(entry => ({ entry, rank: rankOf(entry, tokens) })).filter(match => match.rank >= 0)
  ranked.sort((a, b) => a.rank - b.rank)

  return ranked.map(({ entry, rank }) => rank <= 2
    ? { id: entry.id, reason: 'name' }
    : { id: entry.id, reason: 'description', snippet: snippetOf(entry.text, tokens) })
}

/**
 * The parameters that match a query, best first.
 *
 * @param index the index of the list
 * @param query what the user typed
 * @returns the matches: by rank, and in the list's order within a rank; the close matches (when there are fewer than five other
 * results, and the list has descriptions) at the end
 */
export function search(index: SearchIndex, query: string): SearchHit[] {
  const tokens = tokensOf(query)
  if (tokens.length === 0) {
    return []
  }
  const hits = strictHits(index, tokens)
  if (hits.length >= CLOSE_BELOW || !index.described) {
    return hits
  }
  const strict = new Set(hits.map(hit => hit.id))
  const close = index.entries.filter(entry => !strict.has(entry.id) && isClose(entry, tokens))

  return [...hits, ...close.map((entry): SearchHit => ({ id: entry.id, reason: 'close' }))]
}

/** A piece of a text, and whether it is what was searched for. */
export interface Piece {
  /** The text. */
  text: string
  /** Whether it is one of the words. */
  match: boolean
}

/**
 * A text cut into the pieces that are the words searched for and those that are not (the rows that are drawn are marked this
 * way, not the whole result).
 *
 * @param text what is shown
 * @param tokens the words (lower case)
 * @returns the pieces, in order, which put together are the text
 */
export function highlight(text: string, tokens: string[]): Piece[] {
  if (tokens.length === 0 || text === '') {
    return [{ text, match: false }]
  }
  const escaped = tokens.map(token => token.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))

  return text.split(new RegExp(`(${escaped.join('|')})`, 'giu'))
    .filter(piece => piece !== '')
    .map(piece => ({ text: piece, match: tokens.includes(piece.toLowerCase()) }))
}
