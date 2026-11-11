// Finding a command by what the user types. Few commands (a dozen), so no typo tolerance and no index: every command is
// checked on every key. What is matched is the label and the group and the extra words, in the language of the page AND in
// English, so that a person who reads Polish can type "reboot". Letters are folded (diacritics removed, case ignored), so
// "ubersicht" finds "Übersicht" and "polet" finds "Полёт".
import { type Command, type CommandContext } from './command'
import { tokensOf } from '@/lib/params/paramSearch'

/**
 * The text without its case and its accents, for comparing.
 *
 * @param text any text
 * @returns it in lower case, with the combining marks of its decomposed form removed
 */
export function fold(text: string): string {
  return text.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase()
}

/** The words of a command that are searched, folded: its label, and the rest. */
interface Texts {
  /** The label, in the language of the page and in English. */
  labels: string[]
  /** The group and the extra words, in the language of the page and in English. */
  others: string[]
}

/**
 * What a command can be found by.
 *
 * @param command the command
 * @param ctx where the messages come from
 * @returns its texts, folded
 */
function textsOf(command: Command, ctx: CommandContext): Texts {
  const keys = [command.groupKey, ...command.keywordKeys ?? []]
  const both = (key: string) => [ctx.say(key), ctx.sayEnglish(key)]

  return {
    labels: both(command.labelKey).map(fold),
    others: keys.flatMap(both).map(fold),
  }
}

/** How well a command matches: lower is better. */
const RANK = { starts: 0, word: 1, contains: 2, other: 3 } as const

/**
 * Whether a word of the text starts with the token.
 *
 * @param text a folded text
 * @param token a folded word of the query
 * @returns true if some word of the text begins with it
 */
function startsAWord(text: string, token: string): boolean {
  return text.split(/[\s_]+/u).some(word => word.startsWith(token))
}

/**
 * The rank of the label alone: how well all of the tokens are in it.
 *
 * @param labels the folded labels
 * @param query the folded query as typed, with its spaces made one
 * @param tokens the words of the query
 * @returns the rank, or null when a token is not in the label
 */
function rankInLabels(labels: string[], query: string, tokens: string[]): number | null {
  if (labels.some(label => label.startsWith(query))) {
    return RANK.starts
  }
  if (labels.some(label => tokens.every(token => startsAWord(label, token)))) {
    return RANK.word
  }

  return labels.some(label => tokens.every(token => label.includes(token))) ? RANK.contains : null
}

/**
 * How well one command matches a query.
 *
 * @param texts what the command can be found by
 * @param query the folded query, with its spaces made one
 * @param tokens the words of the query
 * @returns the rank, or null when the command does not match
 */
function rankOf(texts: Texts, query: string, tokens: string[]): number | null {
  const inLabel = rankInLabels(texts.labels, query, tokens)
  if (inLabel !== null) {
    return inLabel
  }
  const everywhere = [...texts.labels, ...texts.others]
  const found = tokens.every(token => everywhere.some(text => text.includes(token)))

  return found ? RANK.other : null
}

/**
 * The commands in the order the palette prefers: the ones run last first, then the rest by their label, in the language of the
 * page.
 *
 * @param commands the commands
 * @param ctx where the messages and the usage come from
 * @returns a new list
 */
export function preferred(commands: readonly Command[], ctx: CommandContext): Command[] {
  const recent = ctx.usage.recent()
  // A dangerous command (the reboot) never gets the boost of having been run lately: it would become the row that Enter runs
  // in an empty palette.
  const used = (command: Command) => {
    const at = command.dangerous === true ? -1 : recent.indexOf(command.id)

    return at < 0 ? Number.MAX_SAFE_INTEGER : at
  }
  const label = (command: Command) => command.label ?? ctx.say(command.labelKey)
  // In the language of the page, not the browser's: Polish and Ukrainian sort their letters differently from the default.
  const collator = new Intl.Collator(ctx.language(), { sensitivity: 'base' })

  return commands.toSorted((a, b) => used(a) - used(b) || collator.compare(label(a), label(b)))
}

/**
 * The commands that match a query, best first; those that match equally well keep the order of `preferred` (the ones run last,
 * then by label). An empty query gives every command in that order.
 *
 * @param commands the commands
 * @param query what the user typed
 * @param ctx where the messages and the usage come from
 * @returns the matching commands
 */
export function rankCommands(commands: readonly Command[], query: string, ctx: CommandContext): Command[] {
  const ordered = preferred(commands, ctx)
  const tokens = tokensOf(fold(query))
  if (tokens.length === 0) {
    return ordered
  }
  const typed = tokens.join(' ')

  return ordered
    .map((command, order) => ({ command, order, rank: rankOf(textsOf(command, ctx), typed, tokens) }))
    .filter((hit): hit is typeof hit & { rank: number } => hit.rank !== null)
    .toSorted((a, b) => a.rank - b.rank || a.order - b.order)
    .map(hit => hit.command)
}
