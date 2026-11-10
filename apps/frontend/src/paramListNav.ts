// How the search box moves the selected row of the parameter list without taking the focus to it: the list says how a key moves
// its selection (it knows its rows and its window), and the search asks it. One list is on the screen at a time.

/** Moves the selection of the list for a key; says whether it did (false: the list has no rows, or the key moves nothing). */
type Mover = (key: string) => boolean

let mover: Mover | null = null

/**
 * The list says how it moves its selection.
 *
 * @param move the function that does it
 * @returns what to call when the list goes away
 */
export function registerListNav(move: Mover): () => void {
  mover = move

  return () => {
    if (mover === move) {
      mover = null
    }
  }
}

/**
 * Moves the selected row of the list, if there is a list with rows.
 *
 * @param key `ArrowUp`, `ArrowDown`, `PageUp` or `PageDown`
 * @returns true if the selection moved (the key is then taken)
 */
export function moveListSelection(key: string): boolean {
  return mover ? mover(key) : false
}
