import AsciiArt from './AsciiArt'

// Small hand-set ASCII marks (3 rows x 5 columns) for navigation, plus the Travauxus diamond.
export const GLYPHS = {
  feed:      ['.---.', '|=-=|', "'---'"],
  portfolio: [' .-. ', '[###]', "'---'"],
  terminal:  ['.---.', '|>_ |', "'---'"],
  groups:    ['(o o)', '/|_|\\', ' d b '],
  settings:  [' \\|/ ', '-(o)-', ' /|\\ '],
  signout:   ['.--. ', '|  =>', "'--' "],
  crown:     [' ___ ', '\\^v^/', '|___|'],
  stocks:    ['   _ ', ' _| |', '| | |'],
  crypto:    [' .-. ', '( B )', " '-' "],
  gov:       [' ,-. ', '/___\\', '|||||'],
  commodity: [' ___ ', '/___\\', '|___|'],
  alerts:    ['  _  ', ' /_\\ ', '/___\\'],
  copy:      ['.-.  ', '|.+-.', "'-'.'"],
  paper:     ['.---.', '|$ $|', "'---'"],
  research:  ['  _  ', ' | | ', '/_o_\\'],
  dm:        ['.---.', '|...|', "'-.-'"],
  trophy:    ['\\_.._/', ' (  ) ', '  ||  '],
  elo:       ['  /\\  ', ' /\\/\\ ', '/____\\'],
  profile:   [' (o) ', '/|_|\\', ' / \\ '],
}

export const LOGO_LINES = ['   /\\   ', '  /  \\  ', ' < /\\ > ', '  \\  /  ', '   \\/   ']

export const NAV_PALETTE = {
  feed: 'blue', portfolio: 'teal', terminal: 'lime', groups: 'violet', settings: 'amber', signout: 'rose', crown: 'gold',
  dm: 'ice', elo: 'violet', trophy: 'gold', profile: 'pink', stocks: 'blue', crypto: 'amber', gov: 'ice', commodity: 'gold', alerts: 'rose', copy: 'violet', paper: 'mint', research: 'teal',
}

export function Glyph({ name, size = 7, palette, shimmer = false, style }) {
  return <AsciiArt lines={GLYPHS[name] || GLYPHS.feed} palette={palette || NAV_PALETTE[name] || 'blue'} size={size} shimmer={shimmer} style={style} />
}

export function LogoMark({ size = 7, palette = 'blue', shimmer = true, style }) {
  return <AsciiArt lines={LOGO_LINES} palette={palette} size={size} shimmer={shimmer} label="Travauxus" style={style} />
}
