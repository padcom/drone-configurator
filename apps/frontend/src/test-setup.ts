// Runs before each test file. jsdom draws nothing and cannot scroll, so it only prints "not implemented" for
// `window.scrollTo`, which the router calls after every navigation (it restores the scroll position of a screen).
// It has no modal `<dialog>` either: these stand-ins open and close it, and close() fires the `close` event. It has no canvas to
// draw on (it prints "not implemented" for `getContext` at every call, and gives nothing): the stand-in gives nothing, quietly.
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
    this.open = false
    this.returnValue = value ?? this.returnValue
    this.dispatchEvent(new Event('close'))
  }
}

// Every language is loaded before the tests: the app loads one when it is chosen (i18n.ts), and the tests switch languages
// without waiting for it.
await (await import('@/i18n/i18n')).loadAllLanguages()

export {}
