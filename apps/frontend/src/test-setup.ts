// Runs before each test file. jsdom draws nothing and cannot scroll, so it only prints "not implemented" for
// `window.scrollTo`, which the router calls after every navigation (it restores the scroll position of a screen).
// It has no modal `<dialog>` either: these stand-ins open and close it, and close() fires the `close` event.
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
    this.open = false
    this.returnValue = value ?? this.returnValue
    this.dispatchEvent(new Event('close'))
  }
}
