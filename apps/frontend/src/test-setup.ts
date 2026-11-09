// Runs before each test file. jsdom draws nothing and cannot scroll, so it only prints "not implemented" for
// `window.scrollTo`, which the router calls after every navigation (it restores the scroll position of a screen).
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined
}
