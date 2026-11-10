// The icons of the interface: a small set drawn for this project, as paths on a 24 x 24 grid. They are drawn as
// 2 px strokes (round caps and joins), in the colour of the text around them, so they follow the theme. They are part
// of the bundle (nothing is fetched).

/* eslint-disable @stylistic/max-len -- a path's data is one string, as long as the drawing needs */

/** The icons by name: the `d` of one path each. */
export const ICONS = {
  'check': 'M5 12.5l4.5 4.5L19 7',
  'close': 'M6 6l12 12M18 6L6 18',
  'plus': 'M12 5v14M5 12h14',
  'minus': 'M5 12h14',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'refresh': 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  'download': 'M12 4v11M7 11l5 5 5-5M5 20h14',
  'upload': 'M12 16V5M7 9l5-5 5 5M5 20h14',
  'search': 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM14.5 14.5L20 20',
  'warning': 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  'info': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  'connect': 'M9 4v5M15 4v5M7 9h10v3a5 5 0 0 1-10 0zM12 17v3',
  'disconnect': 'M9 4v5M15 4v5M7 9h10v3a5 5 0 0 1-10 0zM12 17v3M4 4l16 16',
  'save': 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  'folder': 'M3 6h6l2 2h10v11H3z',
  'trash': 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  // The rail's icons, as the design draws them.
  'grid': 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  'route': 'M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8',
  'navigation': 'M12 2l8 19-8-4-8 4z',
  'wrench': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  'sliders': 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  'activity': 'M22 12h-4l-3 9L9 3l-3 9H2',
  'file': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  'gear': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
} as const

/** The name of an icon. */
export type IconName = keyof typeof ICONS
