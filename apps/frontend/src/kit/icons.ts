// The icons of the interface: a small set drawn for this project, as paths on a 24 x 24 grid. They are drawn as
// 2 px strokes (round caps and joins), in the colour of the text around them, so they follow the theme. They are part
// of the bundle (nothing is fetched).

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
} as const

/** The name of an icon. */
export type IconName = keyof typeof ICONS
