import { getSchema, getText, getTextSerializersFromSchema } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'
import { Transform } from '@tiptap/pm/transform'
import { extensions, parseJson } from '../editor/extensions'
import { countWords } from '../format'
import { findAll, type FindOptions, type Match } from './find'

export const schema = getSchema(extensions)

/**
 * Matches inside each paragraph/heading, as document positions. A match may span bold/italic runs
 * but never crosses paragraphs. Inline leaves (hard breaks) count as one '\n', like their nodeSize.
 */
export function docMatches(doc: PMNode, query: string, opts: FindOptions): Match[] {
  const out: Match[] = []
  if (!query) return out
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    node.forEach((child) => (text += child.isText ? child.text! : '\n'))
    for (const m of findAll(text, query, opts)) out.push({ from: pos + 1 + m.from, to: pos + 1 + m.to })
    return false
  })
  return out
}

/**
 * Replace the given matches (positions in tr.doc) in one step. The new text takes the formatting
 * of the first matched character, so "**Megumi**" → "**Fushiguro Megumi**".
 */
export function applyReplacements(tr: Transform, matches: Match[], replacement: string) {
  const doc = tr.doc
  const schema = doc.type.schema // the editor's own schema; nodes from another instance are rejected
  for (const m of [...matches].sort((a, b) => b.from - a.from)) {
    if (!replacement) {
      tr.delete(m.from, m.to)
      continue
    }
    const marks = doc.resolve(m.from).marksAcross(doc.resolve(m.to)) ?? []
    tr.replaceWith(m.from, m.to, schema.text(replacement, marks))
  }
  return tr
}

const serializers = getTextSerializersFromSchema(schema)
/** Same plain text the editor stores in ChapterContent.text. */
export const docText = (doc: PMNode, blockSeparator = '\n') => getText(doc, { blockSeparator, textSerializers: serializers })

export const docFromJson = (json: string) =>
  PMNode.fromJSON(schema, parseJson(json) || { type: 'doc', content: [{ type: 'paragraph' }] })

/** Replace in stored chapter JSON, outside any editor. */
export function replaceInJson(json: string, query: string, replacement: string, opts: FindOptions) {
  const doc = docFromJson(json)
  const matches = docMatches(doc, query, opts)
  const out = applyReplacements(new Transform(doc), matches, replacement).doc
  const text = docText(out)
  return { count: matches.length, json: JSON.stringify(out.toJSON()), text, words: countWords(text) }
}
