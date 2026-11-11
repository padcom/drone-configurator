// Shared by the kit's controls that handle keys themselves (Tabs, SplitPane).

/**
 * Whether a key press has no Alt, Ctrl or Meta with it. A control takes the plain arrow keys; the ones with a modifier
 * belong to the browser or the system (Alt+Left and Alt+Right are Back and Forward), so the control leaves them alone.
 *
 * @param event the key press
 * @returns true when no modifier is held (Shift does not count: no control here gives it a meaning)
 */
export function isPlainKey(event: KeyboardEvent): boolean {
  return !(event.altKey || event.ctrlKey || event.metaKey)
}
