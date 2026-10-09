import { useMemo } from 'react'
import { qrGeometry, DEFAULT_LOGO_SIDE_RATIO } from './qr'

// A QR symbol as inline SVG, with the Travauxus mark in the middle, pump.fun style.
//
// Two decisions that are not cosmetic:
//
// 1. The symbol is ALWAYS dark-on-light, in both themes. Inverting it for dark mode looks
//    better and scans worse: plenty of readers assume a light background and simply fail on
//    an inverted symbol. A QR nobody can scan is not a QR, so the light tile stays and the
//    surrounding card does the theming.
//
// 2. The logo sits on an OPAQUE tile. A translucent mark over the modules would leave a
//    half-dark region a binariser has to guess at; an opaque tile makes the covered modules
//    cleanly erased, which is the failure mode the error correction is built for. The covered
//    area is clamped to the error-correction budget inside qrGeometry.
//
// The geometry lives in qr.js so the test suite can rasterise and scan exactly what ships.

/** The Travauxus monogram, drawn rather than imported so the QR pulls in no external asset. */
function Mark({ x, y, side }) {
  const inset = side * 0.2
  return (
    <g>
      <rect x={x} y={y} width={side} height={side} rx={side * 0.22} fill="#ffffff" />
      <rect x={x} y={y} width={side} height={side} rx={side * 0.22} fill="none" stroke="#13120c" strokeWidth={side * 0.05} />
      {/* A slab "T": the crossbar and stem of the wordmark's first letter. */}
      <rect x={x + inset} y={y + inset * 1.3} width={side - inset * 2} height={side * 0.17} fill="#566838" />
      <rect x={x + side / 2 - side * 0.085} y={y + inset * 1.3} width={side * 0.17} height={side - inset * 2.1} fill="#566838" />
    </g>
  )
}

/**
 * @param {string} value      what the code encodes
 * @param {number} size       rendered pixel size of the whole tile, quiet zone included
 * @param {boolean} logo      draw the Travauxus mark in the middle
 * @param {number} logoRatio  logo side as a fraction of the symbol side; clamped to the budget
 */
export default function QrCode({ value, size = 232, logo = true, logoRatio = DEFAULT_LOGO_SIDE_RATIO, className, title }) {
  // Encoding is pure and a little expensive (eight masks, each scored), so it is memoised on
  // the payload rather than redone on every parent render.
  const g = useMemo(() => {
    if (!value) return null
    try {
      return qrGeometry(value, { logo, logoRatio })
    } catch (err) {
      // A payload too long for version 10 is a programming error, not a user error. Render
      // nothing rather than a symbol that cannot be read.
      console.error('[qr]', err.message)
      return null
    }
  }, [value, logo, logoRatio])

  if (!g) return null

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${g.total} ${g.total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title || 'QR code'}
      style={{ display: 'block', borderRadius: 8 }}
    >
      <title>{title || 'QR code'}</title>
      <rect width={g.total} height={g.total} fill="#ffffff" />
      <path d={g.path} fill="#13120c" />
      {g.logoSide > 0 ? <Mark x={g.logoXY} y={g.logoXY} side={g.logoSide} /> : null}
    </svg>
  )
}
