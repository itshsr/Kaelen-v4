export const DEFAULT_APPEARANCE = {
  uiScale: 1,       // 0.9 | 1 | 1.1 | 1.2 — multiplies the root font-size, which cascades
                     // through nearly every spacing/size value in the app since they're
                     // defined in rem, giving genuine whole-UI scaling, not just text.
  cardOpacity: null, // null = each theme's own default; otherwise 0.3–1, overrides --panel-alpha
  backgroundArt: 'starfield', // 'starfield' | 'calm' | 'off'
  bubbles: {},       // { [themeId]: { shape: 'rounded'|'pill'|'sharp', size: 'compact'|'comfortable'|'roomy' } }
}

const SHAPE_RADIUS = { rounded: '16px', pill: '999px', sharp: '4px' }
const SIZE_PAD = {
  compact: '0.5rem 0.9rem',
  comfortable: '0.7rem 1.15rem',
  roomy: '0.9rem 1.4rem',
}
const SCALE_STEPS = { S: 0.9, M: 1, L: 1.1, XL: 1.2 }

export { SHAPE_RADIUS, SIZE_PAD, SCALE_STEPS }

// Applies a saved (or default) appearance object to the live DOM. Called on
// load and immediately after any change in the Appearance settings panel —
// no reload needed.
export function applyAppearance(appearance, theme) {
  const a = { ...DEFAULT_APPEARANCE, ...appearance }
  const root = document.documentElement

  root.style.fontSize = `${16 * (a.uiScale || 1)}px`

  if (a.cardOpacity != null) root.style.setProperty('--panel-alpha', a.cardOpacity)
  else root.style.removeProperty('--panel-alpha')

  const bubble = a.bubbles?.[theme]
  if (bubble?.shape) root.style.setProperty('--bubble-radius', SHAPE_RADIUS[bubble.shape])
  else root.style.removeProperty('--bubble-radius')
  if (bubble?.size) root.style.setProperty('--bubble-pad', SIZE_PAD[bubble.size])
  else root.style.removeProperty('--bubble-pad')
}
