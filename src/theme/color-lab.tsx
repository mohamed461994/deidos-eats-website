/**
 * ⚠️ TEMPORARY DEV TOOL — DELETE ME LATER ⚠️
 *
 * Color Lab: a floating panel to test candidate values for the main brand green
 * (`--color-basil`, the dark green used everywhere) and pick the best one.
 *
 * It has a full 2D color field (saturation × brightness) plus a hue slider — move
 * the cursor anywhere to reach any color. Whatever you pick overrides
 * `--color-basil` and its derived variants (`-hover`, `-deep`, `-tint`) plus
 * `--color-success` (which reuses the green) on :root at runtime, so the whole
 * site re-tints live. The chosen value is remembered in localStorage across
 * reloads while you evaluate.
 *
 * The picked color is shown as copyable TEXT (hex + oklch + the full token block).
 * Once a winner is chosen, paste the token block into `src/theme/tokens.css`,
 * then remove this file + its single import in `App.tsx`.
 *
 * To delete: remove this file and the `<ColorLab />` line in `src/App.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'deidos:color-lab:hsv'
const FIELD_W = 264
const FIELD_H = 170

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const round = (n: number, p: number) => {
  const f = 10 ** p
  return Math.round(n * f) / f
}

type Hsv = { h: number; s: number; v: number }
type Lch = { l: number; c: number; h: number }

// ---- Color math (sRGB ↔ HSV ↔ OKLCH) --------------------------------------

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [r + m, g + m, b + m]
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function rgbToOklch(r: number, g: number, b: number): Lch {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  let H = (Math.atan2(bb, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { l: L, c: Math.sqrt(a * a + bb * bb), h: H }
}

function oklchToRgb({ l, c, h }: Lch): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const L = l_ ** 3
  const M = m_ ** 3
  const S = s_ ** 3
  const R = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S
  const G = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S
  const B = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S
  return [clamp(linearToSrgb(R), 0, 1), clamp(linearToSrgb(G), 0, 1), clamp(linearToSrgb(B), 0, 1)]
}

const ok = ({ l, c, h }: Lch) => `oklch(${round(l, 3)} ${round(c, 3)} ${round(h, 1)})`

/** Derive the full basil scale from the base, preserving the original relationships. */
function derive(base: Lch) {
  return {
    basil: ok(base),
    basilHover: ok({ l: clamp(base.l - 0.05, 0, 1), c: clamp(base.c - 0.01, 0, 0.4), h: base.h }),
    basilDeep: ok({ l: clamp(base.l - 0.1, 0, 1), c: clamp(base.c - 0.03, 0, 0.4), h: base.h }),
    basilTint: ok({ l: 0.96, c: 0.02, h: base.h }),
  }
}

// ---- CSS variable application ---------------------------------------------

function apply(base: Lch) {
  const d = derive(base)
  const root = document.documentElement.style
  root.setProperty('--color-basil', d.basil)
  root.setProperty('--color-basil-hover', d.basilHover)
  root.setProperty('--color-basil-deep', d.basilDeep)
  root.setProperty('--color-basil-tint', d.basilTint)
  // --color-success is defined equal to basil in tokens.css; keep them in step.
  root.setProperty('--color-success', d.basil)
}

// ---- Defaults / persistence -----------------------------------------------

// The current shipped default (see tokens.css --color-basil).
const DEFAULT_OKLCH: Lch = { l: 0.4, c: 0.13, h: 143 }
const DEFAULT_HSV: Hsv = (() => {
  const [r, g, b] = oklchToRgb(DEFAULT_OKLCH)
  return rgbToHsv(r, g, b)
})()

function load(): Hsv {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Hsv
      if (typeof p.h === 'number' && typeof p.s === 'number' && typeof p.v === 'number') return p
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_HSV
}

// ---- Component -------------------------------------------------------------

export function ColorLab() {
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState<Hsv>(load)
  const [copied, setCopied] = useState('')

  const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v)
  const base = useMemo(() => rgbToOklch(r, g, b), [r, g, b])
  const hex = rgbToHex(r, g, b)
  const d = derive(base)

  // Re-apply on every change and persist. Runs on mount too.
  useEffect(() => {
    apply(base)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hsv))
    } catch {
      /* ignore */
    }
  }, [base, hsv])

  const tokensSnippet = `--color-basil: ${d.basil};
--color-basil-hover: ${d.basilHover};
--color-basil-deep: ${d.basilDeep};
--color-basil-tint: ${d.basilTint};
--color-success: ${d.basil};`

  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      window.setTimeout(() => setCopied(''), 1500)
    })
  }

  const isDefault =
    hsv.h === DEFAULT_HSV.h && hsv.s === DEFAULT_HSV.s && hsv.v === DEFAULT_HSV.v
  const reset = () => {
    setHsv(DEFAULT_HSV)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {/* Toggle button — always reachable, never depends on brand tokens. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle Color Lab"
        title="Color Lab (temporary tool)"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 2147483647,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '2px solid #fff',
          background: hex,
          boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
          cursor: 'pointer',
          fontSize: 20,
        }}
      >
        🎨
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Color Lab"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 76,
            zIndex: 2147483647,
            width: FIELD_W + 32,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 96px)',
            overflowY: 'auto',
            background: '#ffffff',
            color: '#1a1a1a',
            border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
            padding: 16,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Color Lab</strong>
            <span style={{ fontSize: 11, color: '#888' }}>temp · brand green</span>
          </div>

          {/* 2D color field */}
          <ColorField hsv={hsv} onChange={(s, v) => setHsv((p) => ({ ...p, s, v }))} />

          {/* Hue slider */}
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={hsv.h}
            onChange={(e) => setHsv((p) => ({ ...p, h: Number(e.target.value) }))}
            aria-label="Hue"
            style={{
              width: '100%',
              height: 14,
              margin: '10px 0 12px',
              appearance: 'none',
              WebkitAppearance: 'none',
              borderRadius: 7,
              background:
                'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
              cursor: 'pointer',
            }}
          />

          {/* Derived preview swatches */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[d.basil, d.basilHover, d.basilDeep, d.basilTint].map((col, i) => (
              <div
                key={i}
                title={['basil', 'hover', 'deep', 'tint'][i]}
                style={{ flex: 1, height: 34, borderRadius: 8, background: col, border: '1px solid rgba(0,0,0,0.08)' }}
              />
            ))}
          </div>

          {/* Copyable text output */}
          <ReadoutRow label="hex" value={hex} onCopy={() => copy('hex', hex)} copied={copied === 'hex'} />
          <ReadoutRow label="oklch" value={d.basil} onCopy={() => copy('oklch', d.basil)} copied={copied === 'oklch'} />

          <div style={{ fontSize: 11, color: '#888', margin: '10px 0 4px' }}>tokens.css block</div>
          <textarea
            readOnly
            value={tokensSnippet}
            onFocus={(e) => e.currentTarget.select()}
            rows={5}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              lineHeight: 1.5,
              color: '#333',
              background: '#f7f7f7',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8,
              padding: 8,
              resize: 'vertical',
            }}
          />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => copy('block', tokensSnippet)} style={btnStyle('#1a1a1a', '#fff')}>
              {copied === 'block' ? 'Copied ✓' : 'Copy block'}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isDefault}
              style={{ ...btnStyle('#f0f0f0', '#333'), opacity: isDefault ? 0.5 : 1 }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ColorField({ hsv, onChange }: { hsv: Hsv; onChange: (s: number, v: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)

  // Repaint the saturation×value field whenever hue changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = `hsl(${hsv.h} 100% 50%)`
    ctx.fillRect(0, 0, FIELD_W, FIELD_H)
    const white = ctx.createLinearGradient(0, 0, FIELD_W, 0)
    white.addColorStop(0, 'rgba(255,255,255,1)')
    white.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = white
    ctx.fillRect(0, 0, FIELD_W, FIELD_H)
    const black = ctx.createLinearGradient(0, 0, 0, FIELD_H)
    black.addColorStop(0, 'rgba(0,0,0,0)')
    black.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = black
    ctx.fillRect(0, 0, FIELD_W, FIELD_H)
  }, [hsv.h])

  const pick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const s = clamp((clientX - rect.left) / rect.width, 0, 1)
    const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1)
    onChange(s, v)
  }

  return (
    <div style={{ position: 'relative', width: FIELD_W, height: FIELD_H, touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        width={FIELD_W}
        height={FIELD_H}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          pick(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => dragging && pick(e.clientX, e.clientY)}
        onPointerUp={() => setDragging(false)}
        style={{ width: FIELD_W, height: FIELD_H, borderRadius: 8, cursor: 'crosshair', display: 'block' }}
      />
      {/* Cursor marker */}
      <div
        style={{
          position: 'absolute',
          left: hsv.s * FIELD_W - 7,
          top: (1 - hsv.v) * FIELD_H - 7,
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

function ReadoutRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 40, fontSize: 11, color: '#888' }}>{label}</span>
      <code
        style={{
          flex: 1,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          color: '#222',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </code>
      <button type="button" onClick={onCopy} style={{ ...btnStyle('#f0f0f0', '#333'), flex: 'none', padding: '4px 8px' }}>
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  )
}

function btnStyle(bg: string, fg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: fg,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }
}
