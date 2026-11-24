// Saving and opening files. In Pico Desktop they go through the backend's native dialogs; in a plain browser (`pnpm ui`)
// a save is a download and an open is a file input.
import type { NativeBridge } from '@pico-desktop/communicator'
import type { VehicleInfo } from '@/generated/app'
import type { SnapshotsModel } from '@/composables/useSnapshots'

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

/** What a file input takes for a parameter snapshot or file: a snapshot, and ArduPilot's plain-text parameter files. */
export const PARAMS_ACCEPT = '.json,.param,.parm,.params,.txt,application/json,text/plain'

/** What a file input takes for JSON. */
const JSON_ACCEPT = '.json,application/json'

/**
 * Offers `text` as a file download (the browser's save handling).
 *
 * @param text the file's content
 * @param name the file's name: a `.json` one is JSON, anything else plain text
 */
export function download(text: string, name: string): void {
  const type = name.endsWith('.json') ? 'application/json' : 'text/plain'
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Saves `text` as a file: through the host's save dialog in Pico Desktop, as a download in a browser.
 *
 * @param snapshots the snapshots, which ask the backend for the host's dialog
 * @param text the file's content
 * @param name the file's name
 */
export function saveText(snapshots: Pick<SnapshotsModel, 'saveFile'>, text: string, name: string): void {
  if (hasHost()) {
    void snapshots.saveFile(name, text)
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
 * @param extension the file's extension, with its point
 * @returns a name such as `params-quadrotor-1-2026-11-09T123000.json`
 */
export function snapshotFileName(what: string, vehicle: VehicleInfo | undefined, now = new Date(), extension = '.json'): string {
  const who = vehicle ? `${vehicle.type.toLowerCase()}-${vehicle.sysid}` : 'vehicle'

  return `${what}-${who}-${now.toISOString().slice(0, 19).replaceAll(':', '')}${extension}`
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

/**
 * Opens a file the way the interface does everywhere: with the host's dialog in Pico Desktop (the backend reads the file and the
 * model takes it from there), with a file input in a browser. The button of a screen has an input of its own to press; a
 * command that runs from anywhere (the palette) has none, so a browser gets one made for the moment.
 *
 * @param open asks the backend to open a file with the host's dialog
 * @param onText takes the text of the file chosen in the browser
 * @param input the screen's file input, if it has one
 * @param accept what the input made for the moment takes (JSON unless said)
 */
export function openFile(
  open: () => Promise<void>,
  onText: (text: string) => void,
  input?: HTMLInputElement | null,
  accept = JSON_ACCEPT,
): void {
  if (hasHost()) {
    void open()
  } else if (input) {
    input.click()
  } else {
    // Hidden, in the document (a detached input may not open its dialog in every browser), and taken out again when a file is
    // chosen or the dialog is cancelled.
    const made = document.createElement('input')
    made.type = 'file'
    made.accept = accept
    made.hidden = true
    made.addEventListener('cancel', () => made.remove())
    made.addEventListener('change', async () => {
      const text = await chosenText(made)
      made.remove()

      if (text !== null) {
        onText(text)
      }
    })
    document.body.append(made)
    made.click()
  }
}
