import { WORDS_PER_PAGE } from './config'

// \p{M} keeps decomposed (NFD) Vietnamese diacritics inside the word.
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu

/** Vietnamese counts syllables as words: "tiếng Việt" = 2. */
export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0
}

export function estimatePages(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_PAGE))
}

const dateFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })
export const formatDate = (ms: number) => (ms ? dateFmt.format(ms) : '—')
export const formatNumber = (n: number) => n.toLocaleString('vi-VN')

export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}
