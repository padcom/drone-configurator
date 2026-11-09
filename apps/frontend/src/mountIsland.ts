// How a component is mounted into the page's static markup: every island is its own Vue app, so each one gets the
// i18n instance here, and its `useI18n()` finds it.
import { type Component, createApp } from 'vue'
import { i18n } from './i18n'

/**
 * Mounts a component into an element of index.html, with translations.
 *
 * @param component the component
 * @param selector the element to mount it in
 */
export function mountIsland(component: Component, selector: string): void {
  createApp(component).use(i18n).mount(selector)
}
