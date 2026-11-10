// Moving the focus from pane to pane with F6 and Shift+F6, as the panes of a desktop application do (until the global
// shortcuts, #20, have a place to say it): the next pane in the order they are in the page, and round to the first after
// the last; Shift goes the other way. A pane is a place to start from: Tab from it goes into it.
import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'

/**
 * Whether a key press is the one that moves between panes: F6, with Shift or without it, and nothing else with it (Alt,
 * Ctrl and Meta with a function key belong to the system and the browser).
 *
 * @param event the key press
 * @returns true for F6 and Shift+F6
 */
export function isPaneKey(event: KeyboardEvent): boolean {
  return event.key === 'F6' && !event.altKey && !event.ctrlKey && !event.metaKey
}

/**
 * The pane to put the focus on.
 *
 * @param panes the panes, in the order they are in the page
 * @param active what has the focus now (null: nothing in particular)
 * @param backwards whether it is Shift+F6
 * @returns the pane after the one the focus is in (before it, going backwards), the first (the last) if the focus is in
 * none of them, or nothing when there are no panes
 */
export function nextPane(panes: HTMLElement[], active: Element | null, backwards: boolean): HTMLElement | undefined {
  // The innermost region that holds the focus (a region inside another, as the Fly aside is in the screen, is the one meant).
  const at = panes.findLastIndex(pane => pane.contains(active))
  if (at < 0) {
    return backwards ? panes.at(-1) : panes[0]
  }

  return panes[(at + (backwards ? panes.length - 1 : 1)) % panes.length]
}

/**
 * Makes F6 and Shift+F6 move the focus between the regions that match `selector`, from wherever the focus is in the
 * window, for as long as the component that asks is mounted (and, when it is kept alive, shown).
 *
 * @param selector the regions, as a selector: each must be able to take the focus (`tabindex="-1"`)
 */
export function usePaneKeys(selector: string): void {
  const move = (event: KeyboardEvent) => {
    const panes = [...document.querySelectorAll<HTMLElement>(selector)]
    const next = isPaneKey(event) ? nextPane(panes, document.activeElement, event.shiftKey) : undefined
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }
  const listen = () => window.addEventListener('keydown', move)
  const forget = () => window.removeEventListener('keydown', move)

  onMounted(listen)
  onActivated(listen)
  onDeactivated(forget)
  onBeforeUnmount(forget)
}
