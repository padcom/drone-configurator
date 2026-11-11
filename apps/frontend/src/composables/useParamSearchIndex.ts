// What is searched of the parameters, made ONCE for the list and the metadata: the Parameters screen's search and the command
// palette's parameters use this one index (not one each, and not one for each key typed). It is rebuilt only when the names or the
// metadata change (paramSearch.indexFor says when).
import { type SearchIndex, indexFor } from '@/lib/params/paramSearch'
import { useConfigurator } from './useConfigurator'

let cached: SearchIndex | null = null

/**
 * The index of the parameters of the vehicle now.
 *
 * @returns a function that gives the index when asked: the last one if nothing it was made for has changed
 */
export function useParamSearchIndex(): () => SearchIndex {
  const { fields } = useConfigurator()

  return () => {
    cached = indexFor(cached, fields.params.value.map(param => param.id), fields.metadata.value)

    return cached
  }
}
