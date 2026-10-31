import { Packer } from 'docx'
import { describe, expect, it } from 'vitest'
import { jsonToMd, jsonToTxt, mdInline, mdToNodes, parseChapterHeading, safeName, splitChapters, toContent, txtToNodes } from './convert'
import { buildDocx } from './docx'

describe('import', () => {
  it('TXT: one paragraph per non-empty line, NFC', () => {
    const nodes = txtToNodes('Dòng một\r\n\r\n  Dòng hai  \n'.normalize('NFD'))
    expect(nodes).toHaveLength(2)
    expect(toContent(nodes).text).toBe('Dòng một\n  Dòng hai')
  })

  it('Markdown inline marks and escapes', () => {
    expect(mdInline('a **đậm** và *nghiêng* <u>gạch</u> \\*sao\\*')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'đậm', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' và ' },
      { type: 'text', text: 'nghiêng', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'gạch', marks: [{ type: 'underline' }] },
      { type: 'text', text: ' *sao*' },
    ])
    expect(mdInline('snake_case_name')).toEqual([{ type: 'text', text: 'snake_case_name' }])
  })

  it('Markdown blocks: headings, quotes, rules', () => {
    expect(mdToNodes('# Lớn\n### Nhỏ\n> trích\n> dẫn\n\n---\nthường').map((n) => n.type)).toEqual(['heading', 'heading', 'blockquote', 'horizontalRule', 'paragraph'])
  })

  it('recognises common chapter headings, not ordinary sentences', () => {
    expect(parseChapterHeading('Chương 1: Khởi đầu')).toEqual({ label: 'Chương 1', title: 'Khởi đầu' })
    expect(parseChapterHeading('CHƯƠNG 7.5 - Giữa hai')).toEqual({ label: 'CHƯƠNG 7.5', title: 'Giữa hai' })
    expect(parseChapterHeading('Chapter IV')).toEqual({ label: 'Chapter IV', title: '' })
    expect(parseChapterHeading('Ngoại truyện: Mùa hè')).toEqual({ label: 'Ngoại truyện', title: 'Mùa hè' })
    expect(parseChapterHeading('Phần lớn mọi người đều về nhà.')).toBeNull()
    expect(parseChapterHeading('Chương trình hôm nay')).toBeNull()
  })

  it('splits a manuscript into chapters, keeping text before the first heading', () => {
    const parts = splitChapters(txtToNodes('Lời tựa\nChương 1: Khởi đầu\nA\nB\nChương 2: Cuộc gặp gỡ\nC'))!
    expect(parts.map((p) => [p.label, p.title, p.nodes.length])).toEqual([['Mở đầu', '', 1], ['Chương 1', 'Khởi đầu', 2], ['Chương 2', 'Cuộc gặp gỡ', 1]])
    expect(splitChapters(txtToNodes('Chương 1\nchỉ một chương'))).toBeNull()
  })
})

const sample = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Mục' }] },
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [
      { type: 'text', text: 'Trăng ' }, { type: 'text', text: 'sáng', marks: [{ type: 'bold' }] }, { type: 'text', text: ' và ' },
      { type: 'text', text: 'gió ', marks: [{ type: 'italic' }] }, { type: 'text', text: 'thổi #1 *x*' },
    ] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lời thoại' }] }] },
  ],
})

describe('export', () => {
  it('TXT keeps paragraphs and Vietnamese', () => {
    expect(jsonToTxt(sample)).toBe('Mục\n\nTrăng sáng và gió thổi #1 *x*\n\nLời thoại')
  })

  it('Markdown round-trips through import', () => {
    const md = jsonToMd(sample)
    expect(md).toBe('## Mục\n\nTrăng **sáng** và *gió* thổi \\#1 \\*x\\*\n\n> Lời thoại')
    expect(toContent(mdToNodes(md)).text).toBe('Mục\nTrăng sáng và gió thổi #1 *x*\n\nLời thoại')
  })

  it('file names have no characters Windows rejects', () => {
    expect(safeName('Chương 1: "Bí mật"/?.')).toBe('Chương 1_ _Bí mật___')
    expect(safeName('   ')).toBe('ban-thao')
  })

  it('DOCX can be read back with headings, bold, italic and Vietnamese intact', async () => {
    const buf = await Packer.toBuffer(buildDocx([{ label: 'Chương 1', title: 'Khởi đầu', json: sample }, { label: 'Chương 2', title: '', json: sample }], 'Truyện'))
    const mammoth = await import('mammoth')
    const html = (await mammoth.convertToHtml({ buffer: buf as Buffer })).value
    expect(html).toContain('<h1>Chương 1: Khởi đầu</h1>')
    expect(html).toContain('<h1>Chương 2</h1>')
    expect(html).toContain('<h2>Mục</h2>')
    expect(html).toContain('<strong>sáng</strong>')
    expect(html).toContain('<em>gió </em>')
    expect(html).toContain('Lời thoại')
  })
})
