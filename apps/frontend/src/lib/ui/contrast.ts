// WCAG 2 contrast between two colours, for the test of the design tokens (and for whoever adds a token).

/**
 * The relative luminance of an `#rrggbb` colour (WCAG 2: 0 is black, 1 is white).
 *
 * @param hex the colour
 * @returns its relative luminance
 */
export function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map(start => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255

    return channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

/**
 * The contrast ratio of two colours, from 1 (the same) to 21 (black on white).
 *
 * @param first one colour, `#rrggbb`
 * @param second the other
 * @returns the ratio
 */
export function contrast(first: string, second: string): number {
  const [light = 0, dark = 0] = [luminance(first), luminance(second)].sort((a, b) => b - a)

  return (light + 0.05) / (dark + 0.05)
}
