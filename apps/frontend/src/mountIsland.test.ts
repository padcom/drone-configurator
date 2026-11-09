import { afterEach, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { mountIsland } from './mountIsland'

afterEach(() => {
  document.body.innerHTML = ''
})

it('mounts a component into the element, with the translations its useI18n() finds', () => {
  document.body.innerHTML = '<div id="island"></div>'
  const Island = defineComponent({
    setup() {
      const { t } = useI18n()

      return () => h('p', t('app.title'))
    },
  })

  mountIsland(Island, '#island')

  expect(document.querySelector('#island')?.textContent).toBe('Drone Configurator')
})

it('shows the key, not a blank, for a message that does not exist', () => {
  document.body.innerHTML = '<div id="island"></div>'
  const Island = defineComponent({
    setup() {
      const { t } = useI18n()

      return () => h('p', t('no.such.message'))
    },
  })

  mountIsland(Island, '#island')

  expect(document.querySelector('#island')?.textContent).toBe('no.such.message')
})
