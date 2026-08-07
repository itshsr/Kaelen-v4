export const DEFAULT_APPEARANCE = {
  uiScale: 1,       // 0.9 | 1 | 1.1 | 1.2 — multiplies the root font-size, which cascades
                     // through nearly every spacing/size value in the app since they're
                     // defined in rem, giving genuine whole-UI scaling, not just text.
  cardOpacity: null, // null = each theme's own default; otherwise 0.3–1
  backgroundArt: 'starfield', // 'starfield' | 'calm' | 'off' | 'custom'
  customBackgroundPath: null, // storage path when backgroundArt === 'custom'
  customCardColor: null, // hex string — only used when theme === 'custom' (fill/background)
  customBorderColor: null, // hex string — only used when theme === 'custom' (card border)
}

const SCALE_STEPS = { S: 0.9, M: 1, L: 1.1, XL: 1.2 }
export { SCALE_STEPS }

function hexToRgbString(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
}
// Applies a saved (or default) appearance object to the live DOM. Called on
// load and immediately after any change in the Appearance settings panel —
// no reload needed.
//
// Card transparency previously set a --panel-alpha variable and hoped other
// CSS would compose it into the final panel color — that composition wasn't
// reliably resolving (and a separate hardcoded-color bug made it worse).
// Real fix: read the current theme's actual panel RGB via getComputedStyle
// and set the fully-composed rgba(...) directly as --panel, so there's no
// multi-step variable chain to go wrong.
export function applyAppearance(appearance, theme) {
  const a = { ...DEFAULT_APPEARANCE, ...appearance }
  const root = document.documentElement

  root.style.fontSize = `${16 * (a.uiScale || 1)}px`

  // Custom theme's card color picker overrides --panel-rgb itself (not just
  // alpha) — set before reading --panel-rgb below so the transparency slider
  // composes on top of the user's chosen color, not the Void default.
  if (theme === 'custom' && a.customCardColor) {
    const rgb = hexToRgbString(a.customCardColor)
    if (rgb) root.style.setProperty('--panel-rgb', rgb)
  } else {
    root.style.removeProperty('--panel-rgb')
  }

  if (theme === 'custom' && a.customBorderColor) {
    const rgb = hexToRgbString(a.customBorderColor)
    if (rgb) root.style.setProperty('--line', `rgba(${rgb}, 0.4)`)
  } else {
    root.style.removeProperty('--line')
  }

  if (a.cardOpacity != null) {
    const rgb = getComputedStyle(root).getPropertyValue('--panel-rgb').trim()
    if (rgb) root.style.setProperty('--panel', `rgba(${rgb}, ${a.cardOpacity})`)
  } else if (theme === 'custom' && a.customCardColor) {
    const rgb = getComputedStyle(root).getPropertyValue('--panel-rgb').trim()
    const alpha = getComputedStyle(root).getPropertyValue('--panel-alpha').trim() || '0.72'
    if (rgb) root.style.setProperty('--panel', `rgba(${rgb}, ${alpha})`)
  } else {
    root.style.removeProperty('--panel')
  }
}
