// CJK Unicode ranges for word counting
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g

export type WordCountResult = {
  words: number
  chars: number
  charsNoSpace: number
}

export function countWords(text: string): WordCountResult {
  const chars = text.length
  const charsNoSpace = text.replace(/\s/g, '').length

  // Count CJK characters (each is a word)
  const cjkCount = (text.match(CJK_PATTERN) ?? []).length

  // Remove CJK chars, then count remaining Latin-style words
  const withoutCjk = text.replace(CJK_PATTERN, ' ')
  const latinWords = withoutCjk.split(/\s+/).filter((w) => w.length > 0)

  return {
    words: cjkCount + latinWords.length,
    chars,
    charsNoSpace,
  }
}
