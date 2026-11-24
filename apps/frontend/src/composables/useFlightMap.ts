// The map of the Flight data screen, without its markup: the view (a centre and a whole zoom), the tiles of the view asked for
// through the tile loader and drawn on a 2D canvas, and what the pointer and the keys do (drag, wheel, arrows, + and -). Nothing
// runs while the map is idle: it is drawn once for a change (a drag, a zoom, a tile that came, the size), never on a timer.
import { type Ref, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useConfigurator } from '@/composables/useConfigurator'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  type Point,
  clamp,
  type Size,
  TILE,
  type TilePlace,
  type View,
  panView,
  tileKey,
  tilesIn,
  zoomView,
} from '@/lib/map/geo'
import { RETRY_MS, TileLoader } from '@/lib/map/tileLoader'

export { MAX_ZOOM, MIN_ZOOM }

/** Where the map starts when nothing says otherwise: the whole world, in the middle of the latitudes people live at. */
export const WORLD: View = { lat: 20, lon: 0, zoom: 2 }

/** How far an arrow key moves the map (px). */
const KEY_STEP = 80

/** The least time between two zooms of the wheel (ms): one notch of a wheel is one zoom, not three. */
const WHEEL_MS = 150

/** How many levels of zoom up a tile that has not come is drawn from the tile that covers it. */
const PARENTS = 3

/** What a key does to the map: a move in px, or a zoom in steps. */
interface KeyAction {
  /** How far the map moves (px, columns then rows). */
  move?: readonly [number, number]
  /** How many zooms. */
  zoom?: number
}

/** What each key does to the map: the move in px, or the zoom in steps. */
const KEYS: Readonly<Record<string, KeyAction>> = {
  'ArrowLeft': { move: [KEY_STEP, 0] },
  'ArrowRight': { move: [-KEY_STEP, 0] },
  'ArrowUp': { move: [0, KEY_STEP] },
  'ArrowDown': { move: [0, -KEY_STEP] },
  '+': { zoom: 1 },
  '=': { zoom: 1 },
  '-': { zoom: -1 },
}

/** The view of the last map of this session (the screen is shown again where it was left). */
let remembered: View | null = null

/** Forgets where the last map was (for the tests: the view is kept by the whole page). */
export function forgetMapView(): void {
  remembered = null
}

/** What the map is made of, and what a user does to it. */
export interface FlightMap {
  /** The centre and the zoom. */
  readonly view: Ref<View>
  /** The size on screen (px). */
  readonly size: Ref<Size>
  /** Bumped when the tiles changed (what the line about the tiles follows). */
  readonly changes: Ref<number>
  /** Why wanted tiles have no image (codes, each once). */
  problems: () => string[]
  /** Whether some of the tiles of the screen are drawn. */
  someDrawn: () => boolean
  /** Sets the size of the map on screen. */
  resize: (width: number, height: number) => void
  /** The pointer went down at a point of the screen: a drag begins. */
  press: (id: number, at: Point) => void
  /** The pointer moved: the map follows it while it is held down. */
  dragTo: (id: number, at: Point) => void
  /** The pointer went up: the drag ends. Says whether it was the one that dragged. */
  release: (id: number) => boolean
  /** Puts a place in the middle of the map, at a zoom (the one it has when none is given). */
  centerOn: (place: { lat: number, lon: number }, zoom?: number) => void
  /** Zooms by whole steps about a point of the screen (the middle when none). */
  zoom: (steps: number, at?: Point) => void
  /** A zoom by one notch of the wheel at a point (not more often than every WHEEL_MS). */
  wheel: (direction: number, at: Point) => void
  /** What a key does; true when the map used it. */
  key: (key: string, modified: boolean) => boolean
}

/**
 * Makes an image of the bytes of a tile.
 *
 * @param bytes the tile
 * @param type its type
 * @returns the image
 */
function decode(bytes: Uint8Array, type: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes as BlobPart], { type }))
}

/**
 * How many device pixels are a CSS pixel on this screen.
 *
 * @returns the ratio (1 when the window does not say)
 */
function pixelRatio(): number {
  return window.devicePixelRatio || 1
}

/**
 * Makes a canvas the size of the map, in device pixels. It is resized only when the map is: setting the size of a canvas throws
 * its memory away and makes it anew, and a drag draws many times a second.
 *
 * @param canvas the canvas
 * @param size the size of the map on screen
 * @param ratio the device pixels in a pixel of the screen
 * @returns the size of the canvas
 */
function fitted(canvas: HTMLCanvasElement, size: Size, ratio: number): Size {
  const [width, height] = [Math.round(size.width * ratio), Math.round(size.height * ratio)]
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  return { width, height }
}

/** The map's state and actions, over a canvas. */
class FlightMapModel implements FlightMap {
  readonly view: Ref<View>
  readonly size = ref<Size>({ width: 0, height: 0 })
  readonly changes = ref(0)
  private readonly map = useConfigurator().map
  private frame = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastWheel = 0
  /** Whether the screen is shown (a screen that is kept but not shown asks for no tile). */
  private shown = true
  private held: { id: number, at: Point } | null = null
  private readonly loader: TileLoader<ImageBitmap>

  /**
   * Makes the map; it ends with the component that made it.
   *
   * @param canvas the canvas the tiles are drawn on
   * @param start the view to begin with (the one the last map had, else this)
   */
  constructor(private readonly canvas: Ref<HTMLCanvasElement | null>, start: View) {
    this.view = ref<View>(remembered ?? start)
    this.loader = new TileLoader<ImageBitmap>({
      fetch: (z, x, y) => this.map.tile(z, x, y),
      cancel: (z, x, y) => this.map.cancelTile(z, x, y),
      decode,
      dispose: image => image.close(),
      changed: () => {
        this.changes.value += 1
        this.redraw()
      },
    })
    watch([this.view, this.size], () => this.sync(), { deep: true })
    watch([this.map.enabled, this.map.offline, this.map.source, this.map.customUrl], () => {
      this.loader.forgetFailures()
      this.sync()
    })
    onActivated(() => this.show(true))
    onDeactivated(() => this.show(false))
    onBeforeUnmount(() => this.end())
  }

  problems(): string[] {
    return this.loader.problems()
  }

  someDrawn(): boolean {
    return this.loader.someDrawn()
  }

  resize(width: number, height: number): void {
    this.size.value = { width, height }
  }

  press(id: number, at: Point): void {
    this.held = { id, at }
  }

  dragTo(id: number, at: Point): void {
    if (this.held?.id === id) {
      this.view.value = panView(this.view.value, at.x - this.held.at.x, at.y - this.held.at.y)
      this.held = { id, at }
    }
  }

  release(id: number): boolean {
    const was = this.held?.id === id
    if (was) {
      this.held = null
    }

    return was
  }

  centerOn(place: { lat: number, lon: number }, zoom?: number): void {
    this.view.value = { lat: place.lat, lon: place.lon, zoom: clamp(zoom ?? this.view.value.zoom, MIN_ZOOM, MAX_ZOOM) }
  }

  zoom(steps: number, at?: Point): void {
    const where = at ?? { x: this.size.value.width / 2, y: this.size.value.height / 2 }
    this.view.value = zoomView(this.view.value, steps, where, this.size.value)
  }

  wheel(direction: number, at: Point): void {
    const now = Date.now()
    if (now - this.lastWheel >= WHEEL_MS) {
      this.lastWheel = now
      this.zoom(direction, at)
    }
  }

  key(key: string, modified: boolean): boolean {
    const action = modified ? undefined : KEYS[key]
    if (action) {
      this.act(action)
    }

    return action !== undefined
  }

  /**
   * Does what a key means: moves the map, or zooms it.
   *
   * @param action the move in px, or the zoom in steps
   */
  private act(action: KeyAction): void {
    if (action.move) {
      this.view.value = panView(this.view.value, action.move[0], action.move[1])
    } else if (action.zoom) {
      this.zoom(action.zoom)
    }
  }

  /**
   * The screen is shown or hidden (it is kept alive: a hidden map asks for nothing, and the tiles on their way are cancelled).
   *
   * @param shown whether it is shown now
   */
  private show(shown: boolean): void {
    this.shown = shown
    this.sync()
  }

  /** Asks for the tiles of the view (none when the switch is off, or the screen is not shown), and draws. */
  private sync(): void {
    remembered = this.view.value
    this.loader.want(this.shown && this.map.enabled.value ? tilesIn(this.view.value, this.size.value) : [])
    this.redraw()
    this.retryLater()
  }

  /** Asks again, once, a while after tiles failed (a lost network comes back; nothing is asked for in a loop). */
  private retryLater(): void {
    if (this.timer === null && this.loader.problems().length > 0) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.sync()
      }, RETRY_MS + 1)
    }
  }

  /** Draws the map again at the next frame (once, however many changes there were before it). */
  private redraw(): void {
    this.frame ||= requestAnimationFrame(() => this.draw())
  }

  /** Draws the map once. */
  private draw(): void {
    this.frame = 0
    const context = this.surface()
    if (context) {
      tilesIn(this.view.value, this.size.value).forEach(place => this.paint(context, place))
    }
  }

  /**
   * The canvas, cleared and sized to the map (a canvas that cannot be drawn on gives nothing).
   *
   * @returns what to draw on
   */
  private surface(): CanvasRenderingContext2D | null {
    const canvas = this.canvas.value
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return null
    }
    const ratio = pixelRatio()
    const { width, height } = fitted(canvas, this.size.value, ratio)
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)

    return context
  }

  /**
   * Draws a tile: its image, or (until it comes) the part of a tile of a lower zoom that covers it.
   *
   * @param context the canvas
   * @param place the tile
   */
  private paint(context: CanvasRenderingContext2D, place: TilePlace): void {
    const image = this.loader.get(tileKey(place.z, place.x, place.y))
    if (image) {
      context.drawImage(image, place.left, place.top, TILE, TILE)
    } else {
      this.paintParent(context, place)
    }
  }

  /**
   * Draws, in the place of a tile that has not come, the part of the tile of a lower zoom that covers it (blurred).
   *
   * @param context the canvas
   * @param place the tile
   */
  private paintParent(context: CanvasRenderingContext2D, place: TilePlace): void {
    for (let up = 1; up <= Math.min(PARENTS, place.z - MIN_ZOOM); up += 1) {
      const parent = this.loader.get(tileKey(place.z - up, place.x >> up, place.y >> up))
      if (parent) {
        const part = TILE / 2 ** up
        const [column, row] = [place.x % 2 ** up, place.y % 2 ** up]
        context.drawImage(parent, column * part, row * part, part, part, place.left, place.top, TILE, TILE)

        return
      }
    }
  }

  /** The map goes: no frame is waited for, no tile, no retry. */
  private end(): void {
    cancelAnimationFrame(this.frame)

    if (this.timer !== null) {
      clearTimeout(this.timer)
    }
    this.loader.close()
  }
}

/**
 * The map's state and actions, over a canvas.
 *
 * @param canvas the canvas the tiles are drawn on
 * @param start the view to begin with (the one the last map had, else this)
 * @returns the map
 */
export function useFlightMap(canvas: Ref<HTMLCanvasElement | null>, start: View = WORLD): FlightMap {
  return new FlightMapModel(canvas, start)
}
