// Standard 78-card Rider–Waite–Smith deck. Keyword meanings follow widely used
// traditional associations. Replace/extend with Harmeet's own tarot notes when provided.

export const MAJOR = [
  ['The Fool', 'new beginnings, spontaneity, leap of faith'],
  ['The Magician', 'willpower, skill, manifestation'],
  ['The High Priestess', 'intuition, inner knowledge, mystery'],
  ['The Empress', 'nurturing, abundance, creativity'],
  ['The Emperor', 'structure, authority, stability'],
  ['The Hierophant', 'tradition, guidance, learning'],
  ['The Lovers', 'union, choice, alignment of values'],
  ['The Chariot', 'determination, control, victory through will'],
  ['Strength', 'inner strength, courage, patience'],
  ['The Hermit', 'introspection, solitude, inner guidance'],
  ['Wheel of Fortune', 'cycles, turning points, change'],
  ['Justice', 'fairness, truth, cause and effect'],
  ['The Hanged Man', 'surrender, new perspective, pause'],
  ['Death', 'endings, transformation, release'],
  ['Temperance', 'balance, moderation, patience'],
  ['The Devil', 'attachment, restriction, shadow patterns'],
  ['The Tower', 'sudden upheaval, revelation, breakdown of the false'],
  ['The Star', 'hope, renewal, inspiration'],
  ['The Moon', 'illusion, the subconscious, uncertainty'],
  ['The Sun', 'joy, vitality, clarity'],
  ['Judgement', 'awakening, reckoning, inner calling'],
  ['The World', 'completion, wholeness, integration'],
]

const SUITS = {
  Wands: 'energy, will, creative drive',
  Cups: 'emotion, relationships, intuition',
  Swords: 'thought, conflict, clarity of mind',
  Pentacles: 'material life, work, body and resources',
}
const RANKS = {
  Ace: 'seed, pure potential', Two: 'duality, balance, choice', Three: 'growth, first results',
  Four: 'stability, consolidation', Five: 'friction, challenge', Six: 'harmony, movement forward',
  Seven: 'assessment, perseverance', Eight: 'momentum, mastery in progress', Nine: 'nearing completion, resilience',
  Ten: 'completion of a cycle', Page: 'learning, messages, curiosity', Knight: 'pursuit, action',
  Queen: 'inward mastery, nurture of the theme', King: 'outward mastery, command of the theme',
}

export const DECK = [
  ...MAJOR.map(([name, meaning]) => ({ name, meaning, arcana: 'major' })),
  ...Object.entries(SUITS).flatMap(([suit, sMeaning]) =>
    Object.entries(RANKS).map(([rank, rMeaning]) => ({
      name: `${rank} of ${suit}`,
      meaning: `${rMeaning} — in the realm of ${sMeaning}`,
      arcana: 'minor',
    }))),
]

export const drawCards = n => {
  const pool = [...DECK]
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}
