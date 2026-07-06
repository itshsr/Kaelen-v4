// Deterministic Pythagorean numerology — pure calculation from provided data.
// No AI, no invention. Master numbers 11/22/33 preserved.

const reduce = n => {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split('').reduce((s, d) => s + +d, 0)
  }
  return n
}

const LETTER = {}
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => { LETTER[c] = (i % 9) + 1 })
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

const lettersOf = name => (name || '').toLowerCase().replace(/[^a-z]/g, '').split('')

export function lifePath(birthDate) {
  // birthDate: 'YYYY-MM-DD'
  if (!birthDate) return null
  const digits = birthDate.replace(/\D/g, '').split('').reduce((s, d) => s + +d, 0)
  return reduce(digits)
}

export function destiny(name) {
  const ls = lettersOf(name)
  if (!ls.length) return null
  return reduce(ls.reduce((s, c) => s + LETTER[c], 0))
}

export function soulUrge(name) {
  const ls = lettersOf(name).filter(c => VOWELS.has(c))
  if (!ls.length) return null
  return reduce(ls.reduce((s, c) => s + LETTER[c], 0))
}

export function personality(name) {
  const ls = lettersOf(name).filter(c => !VOWELS.has(c))
  if (!ls.length) return null
  return reduce(ls.reduce((s, c) => s + LETTER[c], 0))
}

export const NUM_THEMES = {
  1: 'independence, leadership, initiative',
  2: 'partnership, sensitivity, diplomacy',
  3: 'expression, creativity, communication',
  4: 'discipline, foundations, steady work',
  5: 'freedom, change, versatility',
  6: 'care, responsibility, harmony',
  7: 'analysis, introspection, inner search',
  8: 'ambition, material mastery, authority',
  9: 'compassion, completion, service',
  11: 'intuition, illumination (master number)',
  22: 'the master builder, large-scale vision (master number)',
  33: 'the master teacher, compassionate service (master number)',
}
