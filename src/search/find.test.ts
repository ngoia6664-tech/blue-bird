import { describe, expect, it } from 'vitest'
import { filterChapters, findAll, snippet } from './find'

const any = { caseSensitive: false, wholeWord: false }
const spans = (text: string, q: string, o = any) => findAll(text, q, o).map((m) => text.slice(m.from, m.to))

describe('findAll', () => {
  it('finds every occurrence, case-insensitively by default', () => {
    expect(spans('Megumi gặp megumi. MEGUMI!', 'megumi')).toEqual(['Megumi', 'megumi', 'MEGUMI'])
    expect(spans('Megumi gặp megumi.', 'Megumi', { ...any, caseSensitive: true })).toEqual(['Megumi'])
  })

  it('matches NFC text with an NFD query and the other way round', () => {
    const nfc = 'Tiếng Việt'.normalize('NFC')
    const nfd = 'Tiếng Việt'.normalize('NFD')
    expect(spans(nfc, nfd)).toEqual([nfc])
    expect(spans(nfd, nfc)).toEqual([nfd])
  })

  it('does not match a bare letter inside an accented one', () => {
    expect(spans('Thế giới', 'e')).toEqual([])
    expect(spans('Thế giới', 'ế')).toEqual(['ế'])
  })

  it('whole-word mode skips matches inside longer words, including Vietnamese letters', () => {
    expect(spans('an ăn bàn an.', 'an', { ...any, wholeWord: true })).toEqual(['an', 'an'])
    expect(spans('Gojo-sensei', 'Gojo', { ...any, wholeWord: true })).toEqual(['Gojo'])
  })

  it('handles many matches and punctuation in the query', () => {
    expect(findAll('a, a, a, a', 'a,', any)).toHaveLength(3)
    expect(findAll('x'.repeat(20), 'x', any)).toHaveLength(20)
  })

  it('returns nothing for an empty query or text', () => {
    expect(findAll('abc', '', any)).toEqual([])
    expect(findAll('', 'a', any)).toEqual([])
  })
})

describe('snippet', () => {
  it('shows the paragraph around the match only', () => {
    const t = 'Đoạn một.\nShinobu cười.\nĐoạn ba.'
    const [m] = findAll(t, 'cười', any)
    expect(snippet(t, m)).toEqual({ before: 'Shinobu ', match: 'cười', after: '.' })
  })
})

describe('filterChapters', () => {
  const list = ['Chương 1', 'Chương 7', 'Chương 17', 'Chương 70', 'Chương 7.5', 'Ngoại truyện'].map((label, i) => ({ label, title: i === 5 ? 'Mùa Hè' : '' }))
  const labels = (q: string) => filterChapters(list, q).map((c) => c.label)
  it('puts the exact chapter number first for "7" and "Chương 7"', () => {
    expect(labels('7')[0]).toBe('Chương 7')
    expect(labels('chương 7')[0]).toBe('Chương 7')
    expect(labels('7.5')).toEqual(['Chương 7.5'])
  })
  it('matches part of a title, ignoring case', () => {
    expect(labels('mùa hè')).toEqual(['Ngoại truyện'])
  })
})
