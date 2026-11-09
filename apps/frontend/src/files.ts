// Saving and opening files. In Pico Desktop they go through the backend's native dialogs; in a plain browser (`pnpm ui`)
// a save is a download and an open is a file input.
import type { NativeBridge } from '@pico-desktop/communicator'
import type { Configurator } from './configurator'
import type { VehicleInfo } from './generated/app'

declare global {
  interface Window {
    /** The host's native bridge: only there in Pico Desktop. */
    picoDesktop?: NativeBridge
  }
}

/**
 * Whether the page runs inside Pico Desktop, which has native file dialogs.
 *
 * @returns true in the host, false in a plain browser
 */
export function hasHost(): boolean {
  return window.picoDesktop !== undefined
}

/**
 * Offers `text` as a file download (the browser's save handling).
 *
 * @param text the file's content
 * @param name the file's name
 */
export function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Saves `text` as a file: through the host's save dialog in Pico Desktop, as a download in a browser.
 *
 * @param app the Configurator, which asks the backend for the host's dialog
 * @param text the file's content
 * @param name the file's name
 */
export function saveText(app: Pick<Configurator, 'saveFile'>, text: string, name: string): void {
  if (hasHost()) {
    void app.saveFile(name, text)
  } else {
    download(text, name)
  }
}

/**
 * A file name for something saved from a vehicle: what it is, which vehicle, and when.
 *
 * @param what `params` or `backup`
 * @param vehicle the vehicle the link found, if any
 * @param now the time
 * @returns a name such as `params-quadrotor-1-2026-11-09T123000.json`
 */
export function snapshotFileName(what: string, vehicle: VehicleInfo | undefined, now = new Date()): string {
  const who = vehicle ? `${vehicle.type.toLowerCase()}-${vehicle.sysid}` : 'vehicle'

  return `${what}-${who}-${now.toISOString().slice(0, 19).replaceAll(':', '')}.json`
}

/**
 * The text of the file chosen in a file input. The input is emptied, so choosing the same file again counts.
 *
 * @param input the file input
 * @returns the text, or null if no file was chosen
 */
export function chosenText(input: HTMLInputElement): Promise<string | null> {
  const file = input.files?.[0]
  input.value = ''

  return file ? file.text() : Promise.resolve(null)
}
