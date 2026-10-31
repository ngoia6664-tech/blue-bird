import { useEditorState, type Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, CaseSensitive, Replace, ReplaceAll, Search, WholeWord, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addVersion } from '../data/versions'
import type { FindOptions } from '../search/find'
import { findKey, getFind, replaceAllInEditor, replaceCurrent, selectCurrent, setFind, stepFind } from './findPlugin'

export interface FindSeed {
  query: string
  opts: FindOptions
  index: number
  nonce: number
}

interface Props {
  editor: Editor
  workId: string
  chapterId: string
  replace: boolean
  seed?: FindSeed
  focusNonce: number
  onReplaceMode: (on: boolean) => void
  onClose: () => void
  /** Continue the same search across the whole work. */
  onGlobal: (query: string, replacement: string, opts: FindOptions) => void
}

/** Find (Ctrl+F) and Find & Replace (Ctrl+H) inside the open chapter. */
export function FindBar(p: Props) {
  const { editor } = p
  const [query, setQuery] = useState(p.seed?.query ?? '')
  const [replacement, setReplacement] = useState('')
  const [opts, setOpts] = useState<FindOptions>(p.seed?.opts ?? { caseSensitive: false, wholeWord: false })
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const f = findKey.getState(e.state)
      return { total: f?.matches.length ?? 0, current: f?.current ?? 0, editable: e.isEditable }
    },
  })

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [p.focusNonce])

  // Jump from a global-search result: same query, exact n-th match.
  useEffect(() => {
    if (!p.seed) return
    setQuery(p.seed.query)
    setOpts(p.seed.opts)
    setFind(editor, { query: p.seed.query, opts: p.seed.opts, current: p.seed.index })
  }, [p.seed?.nonce])

  useEffect(() => {
    if (!editor.isDestroyed) setFind(editor, { query, opts })
  }, [query, opts.caseSensitive, opts.wholeWord])
  useEffect(() => () => void (!editor.isDestroyed && setFind(editor, { query: '' })), [])

  useEffect(() => {
    // Scroll the current match into view without moving the cursor.
    requestAnimationFrame(() => editor.view.dom.querySelector('.find-match.current')?.scrollIntoView({ block: 'center' }))
  }, [s.current, s.total, query])

  const close = () => {
    selectCurrent(editor)
    p.onClose()
  }

  async function replaceAll() {
    const n = getFind(editor).matches.length
    if (!n || !confirm(`Thay ${n} kết quả trong chương này?\nBản trước khi thay được lưu trong Lịch sử phiên bản, và có thể hoàn tác bằng Ctrl+Z.`)) return
    setBusy(true)
    try {
      await addVersion(p.workId, p.chapterId, JSON.stringify(editor.getJSON()), 'pre-replace', `Trước khi thay "${query}" → "${replacement}"`)
      replaceAllInEditor(editor, replacement)
    } catch (e) {
      alert(`Chưa thay: không lưu được bản dự phòng (${(e as Error).message}).`)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (k: keyof FindOptions, label: string, icon: React.ReactNode) => (
    <button type="button" className="tool" aria-label={label} title={label} aria-pressed={opts[k]} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}>
      {icon}
    </button>
  )

  return (
    <div className="find-bar" role="search" aria-label="Tìm trong chương">
      <div className="find-row">
        <label className="search find-input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            type="search"
            aria-label="Tìm trong chương"
            placeholder="Tìm trong chương"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                stepFind(editor, e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
        </label>
        <span className="find-count" role="status" aria-live="polite">
          {query ? (s.total ? `${s.current + 1}/${s.total}` : 'Không tìm thấy') : ''}
        </span>
        <button type="button" className="tool" aria-label="Kết quả trước (Shift+Enter)" title="Kết quả trước (Shift+Enter)" disabled={!s.total} onClick={() => stepFind(editor, -1)}><ArrowUp size={18} /></button>
        <button type="button" className="tool" aria-label="Kết quả sau (Enter)" title="Kết quả sau (Enter)" disabled={!s.total} onClick={() => stepFind(editor, 1)}><ArrowDown size={18} /></button>
        <label className="find-scope">
          <span className="sr-only">Phạm vi</span>
          <select
            aria-label="Phạm vi tìm kiếm"
            value="chapter"
            onChange={(e) => e.target.value === 'work' && p.onGlobal(query, replacement, opts)}
          >
            <option value="chapter">Chương này</option>
            <option value="work">Toàn tác phẩm…</option>
          </select>
        </label>
        {toggle('caseSensitive', 'Phân biệt hoa/thường', <CaseSensitive size={18} />)}
        {toggle('wholeWord', 'Khớp nguyên từ', <WholeWord size={18} />)}
        <button type="button" className="tool" aria-label="Thay thế (Ctrl+H)" title="Thay thế (Ctrl+H)" aria-pressed={p.replace} onClick={() => p.onReplaceMode(!p.replace)}><Replace size={18} /></button>
        <button type="button" className="tool" aria-label="Đóng tìm kiếm (Esc)" title="Đóng (Esc)" onClick={close}><X size={18} /></button>
      </div>
      {p.replace && (
        <div className="find-row">
          <label className="search find-input">
            <Replace size={16} aria-hidden="true" />
            <input
              type="text"
              aria-label="Thay bằng"
              placeholder="Thay bằng (để trống = xóa)"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && close()}
            />
          </label>
          <button type="button" className="btn small" disabled={!s.total || !s.editable || busy} onClick={() => replaceCurrent(editor, replacement)}>
            <Replace size={16} /> Thay
          </button>
          <button type="button" className="btn small" disabled={!s.total || !s.editable || busy} onClick={() => void replaceAll()}>
            <ReplaceAll size={16} /> Thay tất cả
          </button>
        </div>
      )}
    </div>
  )
}
