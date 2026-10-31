import type { JSONContent } from '@tiptap/core'
import { docFromJson, docText } from '../search/doc'
import { countWords } from '../format'

// Plain-text and Markdown import/export of Tiptap documents. Pure functions, no DOM.

type Mark = 'bold' | 'italic' | 'underline'
const text = (t: string, marks: Mark[]): JSONContent => ({ type: 'text', text: t, ...(marks.length && { marks: marks.map((type) => ({ type })) }) })
const para = (content: JSONContent[]): JSONContent => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })

/** TXT: every non-empty line is a paragraph. */
export function txtToNodes(src: string): JSONContent[] {
  return src.normalize('NFC').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).map((l) => para([text(l, [])]))
}

/** Inline Markdown: **bold**, __bold__, *italic*, _italic_, <u>underline</u>, \-escapes. */
export function mdInline(src: string): JSONContent[] {
  const out: JSONContent[] = []
  const on = new Set<Mark>()
  let buf = ''
  const push = () => {
    if (buf) out.push(text(buf, [...on]))
    buf = ''
  }
  const toggle = (m: Mark) => (push(), on.has(m) ? on.delete(m) : on.add(m))
  const re = /\\([\\*_#>`[\]-])|(\*\*|__)|(\*)|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|(<u>|<\/u>)/gu
  let last = 0
  for (const m of src.matchAll(re)) {
    buf += src.slice(last, m.index)
    last = m.index + m[0].length
    if (m[1]) buf += m[1]
    else if (m[2]) toggle('bold')
    else if (m[3] || m[0] === '_') toggle('italic')
    else if (m[4]) toggle('underline')
  }
  buf += src.slice(last)
  push()
  return out
}

/** Markdown: each non-empty line is a paragraph (novel manuscripts rarely wrap lines). */
export function mdToNodes(src: string): JSONContent[] {
  const out: JSONContent[] = []
  let quote: JSONContent | null = null
  for (const raw of src.normalize('NFC').split(/\r?\n/)) {
    const line = raw.trimEnd()
    const q = /^\s*>\s?(.*)$/.exec(line)
    if (!q) quote = null
    if (!line.trim()) continue
    if (q) {
      if (!quote) out.push((quote = { type: 'blockquote', content: [] }))
      if (q[1].trim()) quote.content!.push(para(mdInline(q[1])))
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) out.push({ type: 'heading', attrs: { level: h[1].length <= 2 ? 2 : 3 }, content: mdInline(h[2]) })
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) out.push({ type: 'horizontalRule' })
    else out.push(para(mdInline(line)))
  }
  return out.filter((n) => n.type !== 'blockquote' || n.content!.length)
}

const nodeText = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(nodeText).join('')

const NUMBERED = /^(chương|chapter|hồi|phần|quyển|tập)\s*(\d+(?:[.,]\d+)?|[IVXLCDM]+)(?![\p{L}\p{N}])\s*[:.\-–—]?\s*(.*)$/iu
const SPECIAL = /^(ngoại truyện|phiên ngoại|prologue|epilogue|lời mở đầu|mở đầu|vĩ thanh|lời kết)(?![\p{L}])\s*(\d+)?\s*[:.\-–—]?\s*(.*)$/iu

/** "Chương 7: Bí mật" → { label: "Chương 7", title: "Bí mật" }. Only short lines count. */
export function parseChapterHeading(line: string) {
  const s = line.trim()
  if (!s || s.length > 120) return null
  const m = NUMBERED.exec(s) ?? SPECIAL.exec(s)
  if (!m) return null
  return { label: m[2] ? `${m[1]} ${m[2]}` : m[1], title: m[3].trim() }
}

export interface ImportedChapter {
  label: string
  title: string
  nodes: JSONContent[]
}

/** Split at chapter headings. Fewer than two headings: no split is proposed (returns null). */
export function splitChapters(nodes: JSONContent[]): ImportedChapter[] | null {
  const out: ImportedChapter[] = []
  let cur: ImportedChapter | null = null
  const intro: JSONContent[] = []
  for (const n of nodes) {
    const h = n.type === 'paragraph' || n.type === 'heading' ? parseChapterHeading(nodeText(n)) : null
    if (h) out.push((cur = { ...h, nodes: [] }))
    else (cur ? cur.nodes : intro).push(n)
  }
  if (out.length < 2) return null
  if (intro.some((n) => nodeText(n).trim())) out.unshift({ label: 'Mở đầu', title: '', nodes: intro })
  return out
}

/** Editor-ready content of imported nodes. */
export function toContent(nodes: JSONContent[]) {
  const json = JSON.stringify({ type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] })
  const t = docText(docFromJson(json))
  return { json, text: t, words: countWords(t) }
}

// ---------- Export ----------

export const chapterHeading = (c: { label: string; title: string }) => (c.title ? `${c.label}: ${c.title}` : c.label)

export function jsonToTxt(json: string) {
  return docText(docFromJson(json), '\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

const mdEscape = (s: string) => s.replace(/([\\*_`[\]<>#])/g, '\\$1')

function mdRuns(nodes: JSONContent[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n'
      let s = mdEscape(n.text ?? '')
      const marks = new Set((n.marks ?? []).map((m) => m.type))
      // Markers must hug the text: "** x**" is not bold in Markdown.
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!
      if (!core) return s
      s = core
      if (marks.has('underline')) s = `<u>${s}</u>`
      if (marks.has('italic')) s = `*${s}*`
      if (marks.has('bold')) s = `**${s}**`
      return lead + s + trail
    })
    .join('')
}

function mdBlock(n: JSONContent): string {
  switch (n.type) {
    case 'heading': return `${n.attrs?.level === 3 ? '###' : '##'} ${mdRuns(n.content)}`
    case 'blockquote': return (n.content ?? []).map(mdBlock).join('\n\n').split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
    case 'horizontalRule': return '---'
    case 'bulletList': return (n.content ?? []).map((li) => `- ${(li.content ?? []).map(mdBlock).join(' ')}`).join('\n')
    case 'orderedList': return (n.content ?? []).map((li, i) => `${i + 1}. ${(li.content ?? []).map(mdBlock).join(' ')}`).join('\n')
    default: return mdRuns(n.content)
  }
}

export function jsonToMd(json: string) {
  const doc = docFromJson(json).toJSON() as JSONContent
  return (doc.content ?? []).map(mdBlock).filter((s) => s.trim()).join('\n\n')
}

/** Safe file name on Windows, macOS, Android and iOS. */
export const safeName = (s: string) =>
  s.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120) || 'ban-thao'
