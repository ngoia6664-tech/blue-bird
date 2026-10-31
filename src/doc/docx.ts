import type { JSONContent } from '@tiptap/core'
import { AlignmentType, Document, HeadingLevel, Paragraph, TextRun } from 'docx'
import { docFromJson } from '../search/doc'
import { chapterHeading } from './convert'

// DOCX export (docx) and import (mammoth). Both libraries are loaded only when used.

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as const

function runs(nodes: JSONContent[] = [], extra: { italics?: boolean } = {}): TextRun[] {
  return nodes.map((n) => {
    if (n.type === 'hardBreak') return new TextRun({ text: '', break: 1 })
    const marks = new Set((n.marks ?? []).map((m) => m.type))
    return new TextRun({
      text: n.text ?? '',
      bold: marks.has('bold') || undefined,
      italics: marks.has('italic') || extra.italics || undefined,
      underline: marks.has('underline') ? {} : undefined,
    })
  })
}

function blocks(n: JSONContent, quote = false): Paragraph[] {
  const alignment = ALIGN[n.attrs?.textAlign as keyof typeof ALIGN]
  const indent = quote ? { left: 720 } : undefined
  switch (n.type) {
    case 'heading':
      return [new Paragraph({ heading: n.attrs?.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, alignment, children: runs(n.content) })]
    case 'blockquote':
      return (n.content ?? []).flatMap((c) => blocks(c, true))
    case 'horizontalRule':
      return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('* * *')] })]
    case 'bulletList':
    case 'orderedList':
      // Lists only arrive by pasting; flatten each item to one indented line.
      return (n.content ?? []).map((li, i) => new Paragraph({
        indent: { left: 360 },
        children: [new TextRun(n.type === 'bulletList' ? '• ' : `${i + 1}. `), ...runs((li.content ?? []).flatMap((c) => c.content ?? []))],
      }))
    default:
      return [new Paragraph({ alignment, indent, spacing: { after: 160 }, children: runs(n.content, { italics: quote }) })]
  }
}

export interface DocxChapter {
  label: string
  title: string
  json: string
}

/** One DOCX: optional work title, then each chapter starting on a new page. */
export function buildDocx(chapters: DocxChapter[], workTitle?: string) {
  const children: Paragraph[] = []
  if (workTitle) children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun(workTitle)] }))
  chapters.forEach((c, i) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: i > 0 || !!workTitle, children: [new TextRun(chapterHeading(c))] }))
    const doc = docFromJson(c.json).toJSON() as JSONContent
    for (const n of doc.content ?? []) children.push(...blocks(n))
  })
  return new Document({
    creator: 'Novel Studio',
    title: workTitle ?? chapters[0]?.label,
    styles: { default: { document: { run: { font: 'Times New Roman', size: 26 } } } },
    sections: [{ children }],
  })
}

/** DOCX → HTML of the parts the editor supports, plus warnings for what was dropped. */
export async function docxToHtml(data: ArrayBuffer) {
  const mammoth = await import('mammoth')
  let images = 0
  const r = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      styleMap: [
        "p[style-name='Title'] => h2:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Quote'] => blockquote > p:fresh",
        "p[style-name='Intense Quote'] => blockquote > p:fresh",
        'u => u',
      ],
      convertImage: mammoth.images.imgElement(async () => (images++, { src: '' })),
    },
  )
  const warnings = [...new Set(r.messages.filter((m) => m.type === 'warning').map((m) => m.message))]
  if (images) warnings.unshift(`Đã bỏ qua ${images} hình ảnh (chương chỉ chứa chữ).`)
  return { html: r.value.normalize('NFC'), warnings }
}
