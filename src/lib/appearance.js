export const DEFAULT_APPEARANCE = {
  uiScale: 1,       // 0.9 | 1 | 1.1 | 1.2 — multiplies the root font-size, which cascades
                     // through nearly every spacing/size value in the app since they're
                     // defined in rem, giving genuine whole-UI scaling, not just text.
  cardOpacity: null, // null = each theme's own default; otherwise 0.3–1
  backgroundArt: 'starfield', // 'starfield' | 'calm' | 'off' | 'custom'
  customBackgroundPath: null, // storage path when backgroundArt === 'custom'
}

const SCALE_STEPS = { S: 0.9, M: 1, L: 1.1, XL: 1.2 }
export { SCALE_STEPS }

// Applies a saved (or default) appearance object to the live DOM. Called on
// load and immediately after any change in the Appearance settings panel —
// no reload needed.
//
// Card transparency previously set a --panel-alpha variable and hoped other
// CSS would compose it into the final panel color — that composition wasn't
// reliably resolving. Real fix: read the current theme's actual panel RGB via
// getComputedStyle and set the fully-composed rgba(...) directly as --panel,
// so there's no multi-step variable chain to go wrong.
export function applyAppearance(appearance) {
  const a = { ...DEFAULT_APPEARANCE, ...appearance }
  const root = document.documentElement

  root.style.fontSize = `${16 * (a.uiScale || 1)}px`

  if (a.cardOpacity != null) {
    const rgb = getComputedStyle(root).getPropertyValue('--panel-rgb').trim()
    if (rgb) root.style.setProperty('--panel', `rgba(${rgb}, ${a.cardOpacity})`)
  } else {
    root.style.removeProperty('--panel')
  }
}
