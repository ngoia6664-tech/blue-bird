import { describe, expect, it } from 'vitest'
import { countWords, estimatePages } from './format'

describe('countWords', () => {
  it('counts Vietnamese syllables', () => {
    expect(countWords('Tiếng Việt có dấu, rất đẹp!')).toBe(6)
  })
  it('handles NFD text from pasted documents', () => {
    expect(countWords('Tiếng Việt'.normalize('NFD'))).toBe(2)
  })
  it('ignores punctuation, dashes and line breaks', () => {
    expect(countWords('— Anh đi đâu?\n\n— Về nhà…  ')).toBe(5)
  })
  it('keeps hyphenated and apostrophe words whole', () => {
    expect(countWords("e-mail don't 3-4")).toBe(3)
  })
  it('returns 0 for empty text', () => {
    expect(countWords('  \n ')).toBe(0)
  })
})

describe('estimatePages', () => {
  it('is 0 for empty and at least 1 otherwise', () => {
    expect(estimatePages(0)).toBe(0)
    expect(estimatePages(10)).toBe(1)
    expect(estimatePages(3500)).toBe(10)
  })
})
