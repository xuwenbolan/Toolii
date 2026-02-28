export type TextStats = {
  characters: number
  charactersNoSpaces: number
  cjkCharacters: number
  words: number
  sentences: number
  paragraphs: number
  lines: number
  readingTimeMinutes: number
}

const EMPTY_STATS: TextStats = {
  characters: 0,
  charactersNoSpaces: 0,
  cjkCharacters: 0,
  words: 0,
  sentences: 0,
  paragraphs: 0,
  lines: 0,
  readingTimeMinutes: 0,
}

// CJK Unified Ideographs + Extension A + Compatibility Ideographs
const CJK_RE =
  /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}\u{2B740}-\u{2B81F}]/gu

// Sentence-ending punctuation (Latin + CJK)
const SENTENCE_END_RE = /[.!?]+[\s]?|[\u3002\uFF01\uFF1F]+[\s]?/g

function countCjk(text: string): number {
  return (text.match(CJK_RE) ?? []).length
}

function countWords(text: string): number {
  if (!text.trim()) return 0

  // Intl.Segmenter: accurate word segmentation across languages
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
    let count = 0
    for (const seg of segmenter.segment(text)) {
      if (seg.isWordLike) count++
    }
    return count
  }

  // Fallback: whitespace split for Latin + count CJK individually
  const cjk = countCjk(text)
  const withoutCjk = text.replace(CJK_RE, ' ')
  const latin = withoutCjk.split(/\s+/).filter((w) => w.length > 0).length
  return latin + cjk
}

function countSentences(text: string): number {
  if (!text.trim()) return 0
  const matches = text.match(SENTENCE_END_RE)
  return matches ? matches.length : text.trim().length > 0 ? 1 : 0
}

function countParagraphs(text: string): number {
  if (!text.trim()) return 0
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1
}

function countLines(text: string): number {
  if (text.length === 0) return 0
  return text.split('\n').length
}

export function computeTextStats(text: string): TextStats {
  if (!text) return EMPTY_STATS

  const chars = [...text]
  const characters = chars.length
  const charactersNoSpaces = chars.filter((c) => !/\s/.test(c)).length
  const cjkCharacters = countCjk(text)
  const words = countWords(text)
  const sentences = countSentences(text)
  const paragraphs = countParagraphs(text)
  const lines = countLines(text)

  // English ~250 wpm, Chinese ~500 cpm
  const latinWords = Math.max(0, words - cjkCharacters)
  const readingTimeMinutes = latinWords / 250 + cjkCharacters / 500

  return {
    characters,
    charactersNoSpaces,
    cjkCharacters,
    words,
    sentences,
    paragraphs,
    lines,
    readingTimeMinutes,
  }
}
