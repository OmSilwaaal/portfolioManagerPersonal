import { useMemo } from 'react'
import AsciiCanvas from './AsciiCanvas'
import { gradientFill } from './raster'
import { gradientFor } from './palettes'

// Icon outlines (24x24 viewBox) turned into gradient ASCII. Same drawings the app used as SVG, now characters.
const SUN = 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z'
export const ICON_PATHS = {
  logo: ['M12 2L22 12L12 22L2 12Z', 'M12 6.5L17.5 12L12 17.5L6.5 12Z'],
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  briefcase: ['M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z', 'M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2', 'M12 12v4M10 14h4'],
  bolt: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
  gear: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  crown: ['M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z', 'M5 20h14'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  trend: ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  gift: ['M20 12v10H4V12', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
  bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  sun: [SUN, 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
  frame: ['M3 3h18v18H3z', 'M21 15l-5-5L5 21', 'M8.5 7a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z'],
  trophy: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2z'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  chart: ['M3 3v18h18', 'M7 15l4-5 3 3 5-7'],
  coin: ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z', 'M12 6v12', 'M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.5-3 2-3 1-3 2 1.3 1.8 3 1.8 3-.8 3-1.8'],
  dome: ['M4 21h16', 'M6 21v-8', 'M10 21v-8', 'M14 21v-8', 'M18 21v-8', 'M4 13h16', 'M6 13a6 6 0 0 1 12 0', 'M12 7V3'],
  flask: ['M9 3h6', 'M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3'],
  phone: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M11 18h2'],
  mail: ['M3 5h18v14H3z', 'M3 7l9 6 9-6'],
  key: ['M15 3a6 6 0 1 0 0 12a6 6 0 1 0 0-12z', 'M11 13L3 21', 'M6 18l2 2'],
}

const painterCache = new Map()
function iconPainter(name, palette) {
  const key = `${name}|${Array.isArray(palette) ? palette.join() : palette}`
  let p = painterCache.get(key)
  if (!p) {
    const paths = (ICON_PATHS[name] || ICON_PATHS.logo).map((d) => new Path2D(d))
    p = (ctx, { U, V }) => {
      const s = (Math.min(U, V) * 0.94) / 24
      ctx.translate((U - 24 * s) / 2, (V - 24 * s) / 2)
      ctx.scale(s, s)
      ctx.lineWidth = 2.9
      ctx.strokeStyle = gradientFill(ctx, palette, 2, 2, 22, 22)
      paths.forEach((path) => ctx.stroke(path))
    }
    painterCache.set(key, p)
  }
  return p
}

/**
 * An icon drawn in coloured ASCII.
 * `size` is the box in px; the grid is sized to fit it (default font 7px => ~4.2 x 8.3 px cells).
 */
export default function AsciiIcon({ name, palette, size = 48, label, fps = 0, style }) {
  const pal = palette || gradientFor(name)
  const fontPx = size >= 88 ? 7 : size >= 60 ? 6 : 5
  const cols = Math.max(4, Math.round(size / (fontPx * 0.6)))
  const rows = Math.max(3, Math.round(size / Math.round(fontPx * 1.18)))
  const painter = useMemo(() => iconPainter(name, pal), [name, pal])
  return <AsciiCanvas painter={painter} cols={cols} rows={rows} fontPx={fontPx} fps={fps} gamma={0.5} label={label} style={style} />
}
