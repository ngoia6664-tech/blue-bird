import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { applyReplacements, docMatches } from '../search/doc'
import type { FindOptions, Match } from '../search/find'

// Find highlighting as ProseMirror decorations: the document itself is never touched by searching.

export interface FindState {
  query: string
  opts: FindOptions
  matches: Match[]
  current: number
  deco: DecorationSet
}

type FindMeta = Partial<Pick<FindState, 'query' | 'opts' | 'current'>>

export const findKey = new PluginKey<FindState>('find')
const noOpts: FindOptions = { caseSensitive: false, wholeWord: false }

export const FindExtension = Extension.create({
  name: 'find',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: '', opts: noOpts, matches: [], current: 0, deco: DecorationSet.empty }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(findKey) as FindMeta | undefined
            if (!meta && !tr.docChanged) return prev
            if (!meta && !prev.query) return prev
            const query = meta?.query ?? prev.query
            const opts = meta?.opts ?? prev.opts
            const matches = docMatches(state.doc, query, opts)
            const current = Math.max(0, Math.min(meta?.current ?? prev.current, matches.length - 1))
            const deco = DecorationSet.create(
              state.doc,
              matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'find-match current' : 'find-match' })),
            )
            return { query, opts, matches, current, deco }
          },
        },
        props: { decorations: (state) => findKey.getState(state)?.deco },
      }),
    ]
  },
})

export const getFind = (editor: Editor) => findKey.getState(editor.state)!

export function setFind(editor: Editor, meta: FindMeta) {
  editor.view.dispatch(editor.state.tr.setMeta(findKey, meta).setMeta('addToHistory', false))
}

export function stepFind(editor: Editor, dir: 1 | -1) {
  const s = getFind(editor)
  if (s.matches.length) setFind(editor, { current: (s.current + dir + s.matches.length) % s.matches.length })
}

/** Replace the current match only; one undo step. */
export function replaceCurrent(editor: Editor, replacement: string) {
  const s = getFind(editor)
  const m = s.matches[s.current]
  if (!m) return false
  editor.view.dispatch(applyReplacements(editor.state.tr, [m], replacement) as typeof editor.state.tr)
  return true
}

/** Replace every match in the chapter in one transaction, so a single Ctrl+Z undoes it. */
export function replaceAllInEditor(editor: Editor, replacement: string) {
  const s = getFind(editor)
  if (!s.matches.length) return 0
  editor.view.dispatch(applyReplacements(editor.state.tr, s.matches, replacement) as typeof editor.state.tr)
  return s.matches.length
}

/** Put the cursor on the current match (when closing the bar) and focus the editor. */
export function selectCurrent(editor: Editor) {
  const m = getFind(editor).matches[getFind(editor).current]
  if (m) editor.chain().focus().setTextSelection(m).run()
  else editor.commands.focus()
}
