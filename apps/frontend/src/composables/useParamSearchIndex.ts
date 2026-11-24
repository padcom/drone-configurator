// What is searched of the parameters, made ONCE for the list and the metadata: the Parameters screen's search and the command
// palette's parameters use this one index (not one each, and not one for each key typed). It is rebuilt only when the names, the
// metadata or the everyday words change (paramSearch.indexFor says when). The everyday words (everydayWords.ts) are loaded when
// the index is first asked for, apart from the code the page starts with: the index is remade with them when they arrive.
import { shallowRef } from 'vue'
import { NO_WORDS, type SearchIndex, indexFor } from '@/lib/params/paramSearch'
import { useConfigurator } from './useConfigurator'

let cached: SearchIndex | null = null

/** The everyday words, once loaded (none until then: the search is by the names and the descriptions). */
const words = shallowRef<Readonly<Record<string, string>>>(NO_WORDS)

let loading: Promise<void> | null = null

/** Loads the everyday words and puts them in use. */
async function load(): Promise<void> {
  const { EVERYDAY_WORDS } = await import('@/lib/params/everydayWords')
  words.value = EVERYDAY_WORDS
}

/**
 * Loads the everyday words, once.
 *
 * @returns when they are in use
 */
export function loadEverydayWords(): Promise<void> {
  loading ??= load()

  return loading
}

/**
 * The index of the parameters of the vehicle now.
 *
 * @returns a function that gives the index when asked: the last one if nothing it was made for has changed
 */
export function useParamSearchIndex(): () => SearchIndex {
  const { fields } = useConfigurator()
  void loadEverydayWords()

  return () => {
    cached = indexFor(cached, fields.params.value.map(param => param.id), fields.metadata.value, words.value)

    return cached
  }
}
