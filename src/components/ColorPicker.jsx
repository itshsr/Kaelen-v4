import { useRef, useState } from 'react'

function hsvToRgb(h, s, v) {
  s /= 100; v /= 100
  const c = v * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = v - c
  let r, g, b
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('') }
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return [h, max === 0 ? 0 : (d / max) * 100, max * 100]
}

// value: hex string (e.g. "#10182c"). onChange(hex) fires live while dragging.
export default function ColorPicker({ value, onChange, label }) {
  const initial = hexToRgb(value) || [16, 24, 44]
  const [hsv, setHsv] = useState(() => rgbToHsv(...initial))
  const [h, s, v] = hsv
  const svRef = useRef(null)
  const hueRef = useRef(null)

  const commit = (nh, ns, nv) => {
    setHsv([nh, ns, nv])
    const [r, g, b] = hsvToRgb(nh, ns, nv)
    onChange(rgbToHex(r, g, b))
  }

  const dragSV = e => {
    const rect = svRef.current.getBoundingClientRect()
    const move = ev => {
      const point = ev.touches ? ev.touches[0] : ev
      const x = Math.min(Math.max(point.clientX - rect.left, 0), rect.width)
      const y = Math.min(Math.max(point.clientY - rect.top, 0), rect.height)
      commit(h, (x / rect.width) * 100, 100 - (y / rect.height) * 100)
    }
    move(e.nativeEvent)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const dragHue = e => {
    const rect = hueRef.current.getBoundingClientRect()
    const move = ev => {
      const point = ev.touches ? ev.touches[0] : ev
      const x = Math.min(Math.max(point.clientX - rect.left, 0), rect.width)
      commit((x / rect.width) * 360, s, v)
    }
    move(e.nativeEvent)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const hueColor = `hsl(${h}, 100%, 50%)`
  const hexValue = rgbToHex(...hsvToRgb(h, s, v))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {label && <span className="item-sub">{label}</span>}
      <div
        ref={svRef}
        onPointerDown={dragSV}
        style={{
          position: 'relative', width: '100%', height: 160, borderRadius: 10, touchAction: 'none',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`,
        }}
      >
        <div style={{
          position: 'absolute', left: `${s}%`, top: `${100 - v}%`, transform: 'translate(-50%, -50%)',
          width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', background: hexValue, pointerEvents: 'none',
        }} />
      </div>
      <div
        ref={hueRef}
        onPointerDown={dragHue}
        style={{
          position: 'relative', width: '100%', height: 20, borderRadius: 10, touchAction: 'none',
          background: 'linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)',
        }}
      >
        <div style={{
          position: 'absolute', left: `${(h / 360) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)',
          width: 20, height: 20, borderRadius: '50%', border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', background: hueColor, pointerEvents: 'none',
        }} />
      </div>
      <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
        <span style={{ width: 28, height: 28, borderRadius: 6, background: hexValue, flexShrink: 0, border: '1px solid var(--line)' }} />
        <input
          className="input" style={{ flex: 1 }} value={hexValue}
          onChange={e => {
            const rgb = hexToRgb(e.target.value)
            if (rgb) commit(...rgbToHsv(...rgb))
            else onChange(e.target.value) // let them keep typing an incomplete hex
          }}
        />
      </div>
    </div>
  )
}
