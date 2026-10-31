import { describe, expect, it } from 'vitest'
import { docFromJson, docMatches, docText, replaceInJson } from './doc'

const any = { caseSensitive: false, wholeWord: false }
const p = (...content: object[]) => ({ type: 'paragraph', content })
const t = (text: string, ...marks: string[]) => ({ type: 'text', text, ...(marks.length && { marks: marks.map((type) => ({ type })) }) })
const doc = (...content: object[]) => JSON.stringify({ type: 'doc', content })

describe('replaceInJson', () => {
  it('replaces a phrase and keeps the formatting of the matched text', () => {
    const r = replaceInJson(doc(p(t('Gặp '), t('Megumi', 'bold'), t(' ở trường.'))), 'Megumi', 'Fushiguro Megumi', any)
    expect(r.count).toBe(1)
    expect(r.text).toBe('Gặp Fushiguro Megumi ở trường.')
    const out = JSON.parse(r.json)
    expect(out.content[0].content[1]).toEqual(t('Fushiguro Megumi', 'bold'))
  })

  it('replaces many matches across paragraphs, headings and quotes without touching structure', () => {
    const src = doc(
      { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [t('Hare và Hare')] },
      p(t('Hare', 'italic'), t(' cười.')),
      { type: 'blockquote', content: [p(t('Hare nói.'))] },
    )
    const r = replaceInJson(src, 'hare', 'Haru', any)
    expect(r.count).toBe(4)
    expect(r.text).toBe('Haru và Haru\nHaru cười.\n\nHaru nói.') // Tiptap's getText, as the editor stores it
    const out = JSON.parse(r.json)
    expect(out.content.map((n: { type: string }) => n.type)).toEqual(['heading', 'paragraph', 'blockquote'])
    expect(out.content[0].attrs).toMatchObject({ level: 2, textAlign: 'center' })
    expect(out.content[1].content[0]).toEqual(t('Haru', 'italic'))
  })

  it('matches across formatting runs; the replacement takes the first letter’s formatting', () => {
    const r = replaceInJson(doc(p(t('Meg', 'bold'), t('umi đến.'))), 'Megumi', 'Gojo', any)
    expect(r.count).toBe(1)
    expect(JSON.parse(r.json).content[0].content).toEqual([t('Gojo', 'bold'), t(' đến.')])
  })

  it('an empty replacement deletes the matches; words are recounted', () => {
    const r = replaceInJson(doc(p(t('rất rất đẹp'))), 'rất ', '', any)
    expect(r.text).toBe('đẹp')
    expect(r.words).toBe(1)
  })

  it('handles matches at the start and end of paragraphs and Vietnamese text', () => {
    const r = replaceInJson(doc(p(t('Shinobu đến, rồi Shinobu'))), 'Shinobu', 'Kochō Shinobu', any)
    expect(r.text).toBe('Kochō Shinobu đến, rồi Kochō Shinobu')
  })

  it('reports zero for a missing word or an empty chapter', () => {
    expect(replaceInJson(doc(p(t('abc'))), 'xyz', 'q', any).count).toBe(0)
    expect(replaceInJson('', 'xyz', 'q', any).count).toBe(0)
  })
})

describe('docMatches vs. stored text', () => {
  it('finds the same n-th match in the document as in ChapterContent.text', () => {
    const d = docFromJson(doc(p(t('a b a')), p(t('a', 'bold'), { type: 'hardBreak' }, t('a'))))
    const text = docText(d)
    expect(text).toBe('a b a\na\na')
    expect(docMatches(d, 'a', any)).toHaveLength(4)
  })
})
